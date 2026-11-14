import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { freePort, httpGet, sleep } from "../lib/util.js"

const require = createRequire(import.meta.url)
const runner = fileURLToPath(new URL("../run.ts", import.meta.url))
const daemon = fileURLToPath(new URL("./config-daemon.mjs", import.meta.url))
const tsx = require.resolve("tsx/cli")
const original = {
  model: "original-model", effort: "high", permissionMode: "acceptEdits",
  systemPromptAppend: "fixture", maxBudgetUsd: 2, maxTurns: 7,
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
  child.kill("SIGKILL")
  await exited
}

async function run(env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  const child = spawn(process.execPath, [tsx, runner], { env, stdio: ["ignore", "pipe", "pipe"] })
  let output = ""
  child.stdout.on("data", (data) => (output += data))
  child.stderr.on("data", (data) => (output += data))
  const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", resolve)
    })
    return { code, output }
  } finally {
    clearTimeout(timer)
    await stop(child)
  }
}

function fixture() {
  const root = mkdtempSync("/tmp/claude-studio-env-test-")
  const home = join(root, "home")
  const project = join(root, "project")
  mkdirSync(join(home, ".claude-studio"), { recursive: true })
  mkdirSync(project)
  const custom = join(root, "custom-config.json")
  const fallback = join(home, ".claude-studio/config.json")
  const content = `${JSON.stringify(original, null, 2)}\n`
  writeFileSync(custom, content)
  writeFileSync(fallback, content)
  const trace = join(root, "trace.jsonl")
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, TMPDIR: "/tmp", CLAUDE_STUDIO_CONFIG: custom, E2E_DAEMON: daemon, E2E_ONLY: "none", FIXTURE_CONFIG_TRACE: trace }
  for (const key of ["E2E_URL", "E2E_KEEP", "E2E_PORT", "FIXTURE_FAIL_SETUP"]) delete env[key]
  return { root, home, project, custom, fallback, content, trace, env }
}

for (const inherited of [true, false]) {
  test(`spawned daemon uses scratch config with ${inherited ? "custom" : "default"} config inherited`, async () => {
    const f = fixture()
    let scratch: string | undefined
    try {
      if (!inherited) delete f.env.CLAUDE_STUDIO_CONFIG
      const result = await run(f.env)
      assert.equal(result.code, 0, result.output)
      const records = readFileSync(f.trace, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      const configPath = records[0].configPath as string
      scratch = join(configPath, "..")
      assert.match(configPath, /claude-studio-e2e-[^/]+\/config\.json$/)
      assert.notEqual(configPath, f.custom)
      assert.notEqual(configPath, f.fallback)
      assert.equal(records[1].config.model, "haiku")
      assert.equal(existsSync(configPath), false, "scratch config should be cleaned up")
      assert.equal(readFileSync(f.custom, "utf8"), f.content)
      assert.equal(readFileSync(f.fallback, "utf8"), f.content)
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true })
      rmSync(f.root, { recursive: true, force: true })
    }
  })
}

for (const mode of ["success", "setup failure", "scenario failure"] as const) {
  test(`external daemon restores original config after ${mode}`, async () => {
    const f = fixture()
    let child: ChildProcess | undefined
    try {
      const port = await freePort()
      child = spawn(process.execPath, [daemon, "--project", f.project, "--port", String(port)], {
        env: { ...f.env, ...(mode === "setup failure" ? { FIXTURE_FAIL_SETUP: "1" } : {}) },
        stdio: "ignore",
      })
      let ready = false
      for (let i = 0; i < 100; i++) {
        try {
          ready = (await httpGet(port, "/health", {}, 100)).status === 200
          if (ready) break
        } catch { /* fixture is still starting */ }
        await sleep(20)
      }
      assert.equal(ready, true, "fixture daemon failed to start")
      const result = await run({ ...f.env, E2E_URL: `ws://127.0.0.1:${port}`, E2E_ONLY: mode === "scenario failure" ? "d" : "none" })
      assert.equal(result.code, mode === "success" ? 0 : 1, result.output)
      const restored = JSON.parse(readFileSync(f.custom, "utf8"))
      for (const [key, value] of Object.entries(original)) assert.equal(restored[key], value, `${key}: ${result.output}`)
      const records = readFileSync(f.trace, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      assert.equal(records[1].config.model, "haiku", "test must change the config before restoring it")
      assert.equal(records.at(-1).config.model, original.model)
      assert.equal(readFileSync(f.fallback, "utf8"), f.content)
    } finally {
      if (child) await stop(child)
      rmSync(f.root, { recursive: true, force: true })
    }
  })
}
