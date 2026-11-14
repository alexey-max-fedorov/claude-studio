import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { get } from "node:http"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "agent/package.json"), "utf8"))
const pnpm = process.env.npm_execpath
assert.ok(pnpm && /pnpm/i.test(pnpm), "Run this check with pnpm verify:package [tarball]")
const command = /\.[cm]?js$/.test(pnpm) ? process.execPath : pnpm
const prefix = command === process.execPath ? [pnpm] : []

function runPnpm(args, cwd, env = process.env) {
  try {
    return execFileSync(command, [...prefix, ...args], { cwd, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    throw new Error(`pnpm ${args.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? ""}`, { cause: error })
  }
}

function filesUnder(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // pnpm can add executable shims inside the installed package.
    if (!prefix && entry.name === "node_modules") {
      const modules = join(dir, entry.name)
      assert.deepEqual(readdirSync(modules), [".bin"], "Unexpected nested package dependencies")
      for (const shim of readdirSync(join(modules, ".bin"), { withFileTypes: true })) {
        assert.match(shim.name, /^(claude-studio|anthropic-ai-sdk)(\.cmd|\.ps1)?$/i)
        assert.ok(!shim.isDirectory(), `Unexpected shim directory: ${shim.name}`)
      }
      return []
    }
    const name = prefix + entry.name
    assert.ok(!entry.isSymbolicLink(), `Unexpected package symlink: ${name}`)
    return entry.isDirectory() ? filesUnder(join(dir, entry.name), `${name}/`) : [name]
  })
}

function isolatedEnv(home, config) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, ".claude"), CLAUDE_STUDIO_CONFIG: config }
  for (const key of ["NODE_PATH", "NODE_OPTIONS", "PORT", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_STUDIO_ALLOW_NO_ORIGIN", "CLAUDE_STUDIO_ALLOWED_ORIGINS", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_SESSION_ACCESS_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) delete env[key]
  return env
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function health(port) {
  return new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${port}/health`, (response) => {
      let body = ""
      response.setEncoding("utf8").on("data", (chunk) => { body += chunk })
      response.on("end", () => {
        try { assert.equal(response.statusCode, 200); resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    })
    request.setTimeout(1000, () => request.destroy(new Error("Health request timed out")))
    request.once("error", reject)
  })
}

const scratch = mkdtempSync(join(tmpdir(), "claude-studio-package-"))
let daemon
let exited
let socket
let logs = ""
let spawnError
let cleanupPromise
let verified = false

function cleanup() {
  cleanupPromise ??= (async () => {
    try {
      socket?.terminate()
      if (daemon && !spawnError && daemon.exitCode === null && daemon.signalCode === null) {
        daemon.kill("SIGTERM")
        let timer
        try {
          await Promise.race([exited, new Promise((resolve) => { timer = setTimeout(resolve, 3000) })])
        } finally { clearTimeout(timer) }
        if (daemon.exitCode === null && daemon.signalCode === null) { daemon.kill("SIGKILL"); await exited }
      }
    } finally {
      // The native runtime may finish writing isolated settings just after the daemon exits.
      rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })()
  return cleanupPromise
}

function interrupt(signal) {
  const code = signal === "SIGINT" ? 130 : 143
  console.error(`${signal}: cleaning up package verification`)
  void cleanup().then(() => process.exit(code), (error) => { console.error(error); process.exit(code) })
}
const onSigint = () => interrupt("SIGINT")
const onSigterm = () => interrupt("SIGTERM")
process.once("SIGINT", onSigint)
process.once("SIGTERM", onSigterm)

async function until(check, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (daemon && (daemon.exitCode !== null || daemon.signalCode !== null)) throw new Error(`Daemon exited while waiting for ${label}\n${logs}`)
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${label}\n${logs}`)
}

try {
  const tarball = process.argv[2] ? resolve(process.argv[2]) : join(scratch, `claude-studio-${pkg.version}.tgz`)
  if (!process.argv[2]) {
    console.log("Building and packing the agent with pnpm...")
    runPnpm(["--dir", join(root, "agent"), "pack", "--out", tarball], root)
  }
  const consumer = join(scratch, "consumer")
  const project = join(scratch, "project with spaces")
  const home = join(scratch, "home")
  mkdirSync(consumer)
  mkdirSync(home)
  mkdirSync(join(project, ".claude/skills/package-smoke-check"), { recursive: true })
  writeFileSync(join(project, ".claude/skills/package-smoke-check/SKILL.md"), "---\nname: package-smoke-check\ndescription: Verifies package skill discovery.\n---\nReturn PACKAGE-VERIFIED.\n")
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, dependencies: { "claude-studio": `file:${tarball}` } }))
  writeFileSync(join(consumer, ".npmrc"), "auto-install-peers=false\nstrict-peer-dependencies=true\nignore-scripts=true\nnode-linker=isolated\n")
  const env = isolatedEnv(home, join(scratch, "config.json"))
  console.log("Installing production dependencies with automatic peer installation disabled...")
  runPnpm(["install", "--prod", "--ignore-workspace", "--ignore-scripts", "--strict-peer-dependencies", "--config.auto-install-peers=false"], consumer, env)

  const installed = realpathSync(join(consumer, "node_modules/claude-studio"))
  const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"))
  assert.equal(manifest.name, "claude-studio")
  assert.equal(manifest.version, pkg.version)
  assert.equal(manifest.engines.node, ">=20")
  assert.equal(manifest.publishConfig.tag, "next")
  assert.equal(manifest.bin["claude-studio"], "dist/cli.js")
  assert.deepEqual(filesUnder(installed).sort(), ["LICENSE", "README.md", "dist/cli.js", "package.json"])
  for (const version of Object.values(manifest.dependencies)) assert.ok(!version.startsWith("workspace:"), "Runtime workspace dependency escaped into the package")
  console.log("PASS package contents, metadata, and self-contained runtime dependencies")

  assert.equal(runPnpm(["exec", "claude-studio", "--version"], consumer, env).trim(), pkg.version)
  assert.match(runPnpm(["exec", "claude-studio", "--help"], consumer, env), /--project/)
  console.log("PASS installed pnpm executable, --version, and --help")
  const entry = join(installed, "dist/cli.js")
  assert.equal(execFileSync(process.execPath, [entry, "--version"], { cwd: project, env, encoding: "utf8" }).trim(), pkg.version)
  assert.match(execFileSync(process.execPath, [entry, "--help"], { cwd: project, env, encoding: "utf8" }), /--project/)
  console.log(`PASS direct CLI startup under ${process.version}`)

  console.log("Checking packaged daemon and native SDK initialization...")
  const port = await freePort()
  daemon = spawn(process.execPath, [join(installed, "dist/cli.js"), "--project", project, "--port", String(port)], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] })
  exited = new Promise((resolve) => {
    daemon.once("exit", (code, signal) => resolve({ code, signal }))
    daemon.once("error", (error) => { spawnError = error; resolve({ code: null, signal: null }) })
  })
  for (const stream of [daemon.stdout, daemon.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-64_000) })
  await until(async () => { try { return (await health(port)).status === "ok" } catch { return false } }, "daemon health")
  assert.deepEqual(await health(port), { status: "ok", version: pkg.version, projectDir: project, live: 0 })
  console.log("PASS packaged daemon health")

  const extension = JSON.parse(readFileSync(join(root, "extension/package.json"), "utf8"))
  const hash = createHash("sha256").update(Buffer.from(extension.manifest.key, "base64")).digest("hex").slice(0, 32)
  const extensionId = [...hash].map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join("")
  const WebSocket = createRequire(join(installed, "package.json"))("ws")
  const messages = []
  socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `chrome-extension://${extensionId}`, handshakeTimeout: 5000 })
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())))
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject) })
  socket.on("error", () => {})
  await until(() => messages.some((message) => message.type === "hello"), "extension handshake")
  const hello = messages.find((message) => message.type === "hello")
  assert.equal(hello.protocol, 3)
  assert.equal(hello.projectDir, project)
  socket.send(JSON.stringify({ type: "get_state" }))
  await until(() => messages.some((message) => message.type === "config_state" && message.commands.some((command) => command.name === "package-smoke-check")), "bundled Claude Code runtime and project skill discovery")
  console.log("PASS revised extension origin, protocol v3, and native SDK initialization with project settings")

  const rejected = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "https://untrusted.invalid", handshakeTimeout: 5000 })
  try {
    const status = await new Promise((resolve, reject) => {
      rejected.once("unexpected-response", (_request, response) => { response.resume(); resolve(response.statusCode) })
      rejected.once("open", () => reject(new Error("Untrusted origin was accepted")))
      rejected.once("error", reject)
    })
    assert.equal(status, 403)
  } finally { rejected.terminate() }
  console.log("PASS untrusted browser origins remain rejected")

  daemon.kill("SIGTERM")
  const stopped = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Daemon shutdown timed out")), 7000).unref())])
  if (process.platform === "win32") {
    assert.equal(stopped.signal, "SIGTERM")
    console.log("PASS daemon termination (Windows)")
  } else {
    assert.equal(stopped.code, 0)
    console.log("PASS graceful daemon shutdown")
  }
  verified = true
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  await cleanup()
  process.removeListener("SIGINT", onSigint)
  process.removeListener("SIGTERM", onSigterm)
}

if (verified && !process.exitCode) console.log(`Package verified: claude-studio@${pkg.version}`)
