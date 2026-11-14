import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { renderLaunchAgent } from "./render-launchagent.mjs"

const values = {
  label: "dev.fixture.agent",
  node: '/tmp/node & <tools> "quoted"',
  cli: "/tmp/repo & <app>/agent/dist/cli.js",
  project: "/tmp/project & <app>/__LOG__",
  port: "7281",
  path: "/tmp/home & <user>/.local/bin:/usr/bin",
  log: "/tmp/home & <user>/agent's.log",
}

function plistJson(path) {
  const result = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test("plist strings round-trip XML-sensitive paths without recursive substitution", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync("/tmp/claude-studio-plist-")
  try {
    const path = join(root, "fixture.plist")
    writeFileSync(path, renderLaunchAgent(values))
    const plist = plistJson(path)
    assert.equal(plist.Label, values.label)
    assert.deepEqual(plist.ProgramArguments, [values.node, values.cli, "--project", values.project, "--port", values.port])
    assert.equal(plist.WorkingDirectory, values.project)
    assert.equal(plist.EnvironmentVariables.PATH, values.path)
    assert.equal(plist.StandardOutPath, values.log)
    assert.equal(plist.StandardErrorPath, values.log)
    assert.equal(plist.RunAtLoad, true)
    assert.equal(plist.KeepAlive, true)
    assert.equal(plist.ThrottleInterval, 10)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("renderer rejects missing values and characters forbidden by XML", () => {
  assert.throws(() => renderLaunchAgent({ ...values, project: undefined }), /valid XML strings/)
  for (const char of ["\u0000", "\u0001", "\u000b", "\ud800", "\ufffe"]) {
    assert.throws(() => renderLaunchAgent({ ...values, project: `/tmp/${char}` }), /valid XML strings/)
  }
  assert.match(renderLaunchAgent({ ...values, project: "a\rb\nc\td" }), /a&#13;b\nc\td/)
})

test("installer passes bash syntax checking", () => {
  const result = spawnSync("bash", ["-n", new URL("./install-launchagent.sh", import.meta.url).pathname], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
})

for (const invalid of [false, true]) {
  test(`installer ${invalid ? "keeps the running plist untouched when lint fails" : "validates and installs escaped paths before service commands"}`, { skip: process.platform !== "darwin" }, () => {
    const root = realpathSync(mkdtempSync("/tmp/claude-studio-install-"))
    try {
      const repo = join(root, "repo & <fixture>")
      const home = join(root, "home & <fixture>")
      const project = join(root, "project & <fixture>")
      const bin = join(root, "bin & <fixture>")
      for (const dir of [join(repo, "scripts"), join(repo, "agent/dist"), join(home, "Library/LaunchAgents"), project, bin]) mkdirSync(dir, { recursive: true })
      for (const file of ["install-launchagent.sh", "render-launchagent.mjs", "launchagent.plist.template"]) {
        copyFileSync(new URL(file, import.meta.url), join(repo, "scripts", file))
      }
      writeFileSync(join(repo, "agent/dist/cli.js"), "")
      const node = join(bin, "node")
      symlinkSync(process.execPath, node)
      const label = "dev.fixture.agent"
      const destination = join(home, "Library/LaunchAgents", `${label}.plist`)
      writeFileSync(destination, "existing running plist")
      const calls = join(root, "calls.log")
      writeFileSync(join(bin, "plutil"), `#!/bin/bash\necho lint >> "$CALLS"\n${invalid ? "exit 1" : 'exec /usr/bin/plutil "$@"'}\n`, { mode: 0o755 })
      writeFileSync(join(bin, "launchctl"), '#!/bin/bash\necho "launchctl $*" >> "$CALLS"\n[ "$1" != print ]\n', { mode: 0o755 })
      writeFileSync(join(bin, "curl"), '#!/bin/bash\necho \'{"status":"ok"}\'\n', { mode: 0o755 })
      const result = spawnSync("/bin/bash", [join(repo, "scripts/install-launchagent.sh")], {
        env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, NODE: node, PROJECT_DIR: project, LABEL: label, SKIP_BUILD: "1", CALLS: calls },
        encoding: "utf8",
        timeout: 10_000,
      })
      const lines = readFileSync(calls, "utf8").trim().split("\n")
      assert.equal(lines[0], "lint")
      assert.equal(existsSync(destination), true)
      assert.deepEqual(readdirSync(join(home, "Library/LaunchAgents")), [`${label}.plist`])
      if (invalid) {
        assert.notEqual(result.status, 0, result.stdout)
        assert.equal(readFileSync(destination, "utf8"), "existing running plist")
        assert.deepEqual(lines, ["lint"])
      } else {
        assert.equal(result.status, 0, result.stderr || result.stdout)
        assert.match(lines[1], /^launchctl bootout /)
        const plist = plistJson(destination)
        assert.equal(plist.ProgramArguments[0], node)
        assert.equal(plist.ProgramArguments[1], join(repo, "agent/dist/cli.js"))
        assert.equal(plist.WorkingDirectory, project)
        assert.equal(plist.StandardOutPath, join(home, ".claude-studio/agent.log"))
        assert.ok(plist.EnvironmentVariables.PATH.startsWith(`${home}/.local/bin:${bin}:`))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
