import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { buildExtension, createBuildQueue, createPnpmRunner, isBuildInput, pnpmInvocation, startExtensionWatcher, watchInputs } from "./watch-extension.mjs"

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await delay(5)
  }
  assert.fail("Timed out waiting for watcher state")
}
function fixture() {
  const directory = mkdtempSync("/tmp/extension watch with spaces-")
  for (const path of ["extension/src", "extension/assets", "protocol/src"]) mkdirSync(join(directory, path), { recursive: true })
  return directory
}
function harness(run, options = {}) {
  const signals = new EventEmitter()
  const logs = []
  const errors = []
  let change
  let watchError
  let closed = false
  const watcher = startExtensionWatcher({
    run, signals, debounceMs: 5, directory: "/tmp/workspace with spaces",
    log: (line) => logs.push(line), error: (line) => errors.push(line),
    watchSource: (_root, onChange, onError) => {
      change = onChange
      watchError = onError
      return { close() { closed = true } }
    }, ...options,
  })
  return { ...watcher, signals, logs, errors, change: () => change(), failWatch: (error) => watchError(error), closed: () => closed }
}

test("input filter includes source trees, assets, package and build configuration", () => {
  for (const path of [null, "extension/src/sidepanel.tsx", "extension\\src\\new file.ts", "extension/assets/icon.png", "protocol/src/protocol.ts", "protocol/package.json", "protocol/tsconfig.json", "extension/package.json", "extension/.env", "extension/.env.production.local", "extension/.parcelrc", "extension/postcss.config.js", "extension/tailwind.config.cjs", "extension/tsconfig.json", "extension/.babelrc.json", "tsconfig.base.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", "package.json"]) {
    assert.equal(isBuildInput(path), true, String(path))
  }
  for (const path of ["extension/build/chrome-mv3-dev/manifest.json", "extension/.plasmo/sidepanel.tsx", "extension/node_modules/pkg/index.js", "protocol/dist/index.js", "extension/src/node_modules/pkg.ts", "agent/src/server.ts", "README.md", "extension/README.md", "website/package.json", "../extension/src/sidepanel.tsx", "/extension/src/file.ts"]) {
    assert.equal(isBuildInput(path), false, path)
  }
})

test("pnpm invocation distinguishes JS entrypoints from native binaries without a shell", () => {
  for (const suffix of [".cjs", ".mjs", ".js"]) {
    const path = join("/tmp/tools with spaces", `pnpm${suffix}`)
    assert.deepEqual(pnpmInvocation(path), { command: process.execPath, prefix: [path] })
  }
  const binary = join("/tmp/tools with spaces", process.platform === "win32" ? "pnpm.exe" : "pnpm")
  assert.deepEqual(pnpmInvocation(binary), { command: binary, prefix: [] })
  for (const invalid of ["", "/tmp/npm-cli.js", "/tmp/not-pnpm", "/tmp/pnpm.cmd"]) assert.throws(() => pnpmInvocation(invalid), /Run this watcher with pnpm/)
})

test("build scopes protocol before production Plasmo with an explicit dev tag and fixed paths", async () => {
  const calls = []
  const signal = new AbortController().signal
  await buildExtension(async (args, options) => { calls.push(args); assert.equal(options.signal, signal) }, signal)
  assert.deepEqual(calls, [
    ["--filter", "@claude-studio/protocol", "build"],
    ["--filter", "@claude-studio/extension", "exec", "plasmo", "build", "--tag=dev", "--target=chrome-mv3", "--src-path=src", "--build-path=build"],
  ])
})

test("a failed or interrupted protocol build cannot launch Plasmo", async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(buildExtension(async () => { calls++; throw new Error("tsc failed") }, controller.signal), /tsc failed/)
  assert.equal(calls, 1)
  await assert.rejects(buildExtension(async () => { calls++; controller.abort() }, controller.signal), { name: "AbortError" })
  assert.equal(calls, 2)
})

test("queue debounces bursts and serializes exactly one follow-up during an active build", async () => {
  const gates = []
  let active = 0
  let maximum = 0
  const queue = createBuildQueue(async () => {
    active++
    maximum = Math.max(maximum, active)
    const gate = deferred()
    gates.push(gate)
    await gate.promise
    active--
  }, assert.fail, 5)
  try {
    queue.request(); queue.request(); queue.request()
    await until(() => gates.length === 1)
    for (let count = 0; count < 10; count++) queue.request()
    await delay(15)
    assert.equal(gates.length, 1)
    gates[0].resolve()
    await until(() => gates.length === 2)
    gates[1].resolve()
    await delay(20)
    assert.equal(gates.length, 2)
    assert.equal(maximum, 1)
  } finally {
    for (const gate of gates) gate.resolve()
    await queue.close()
  }
})

test("closing a queue cancels debounced and not-yet-started immediate work", async () => {
  let builds = 0
  for (const immediate of [false, true]) {
    const queue = createBuildQueue(async () => { builds++ }, assert.fail, 10)
    queue.request(immediate)
    await queue.close()
    queue.request(true)
  }
  await delay(20)
  assert.equal(builds, 0)
})

test("watcher builds initially, recovers after failure, and documents manual reload", async () => {
  const calls = []
  let fail = true
  const watcher = harness(async (args) => {
    calls.push(args)
    if (fail) throw new Error("fixture build failure")
  })
  try {
    await until(() => watcher.errors.length === 1)
    assert.equal(calls.length, 1)
    assert.match(watcher.errors[0], /watching for changes.*fixture build failure/)
    fail = false
    watcher.change(); watcher.change(); watcher.change()
    await until(() => watcher.logs.some((line) => line.startsWith("Built ")))
    assert.equal(calls.length, 3)
    assert.ok(watcher.logs.some((line) => /No HTTP\/WebSocket server/.test(line)))
    assert.ok(watcher.logs.some((line) => /Reload the extension manually in chrome:\/\/extensions/.test(line)))
  } finally { await watcher.stop() }
  assert.equal(await watcher.done, 0)
  assert.equal(watcher.closed(), true)
  assert.equal(watcher.signals.listenerCount("SIGINT"), 0)
  assert.equal(watcher.signals.listenerCount("SIGTERM"), 0)
})

test("a failed Plasmo build recovers on the next input event", async () => {
  let calls = 0
  const watcher = harness(async () => {
    calls++
    if (calls === 2) throw new Error("Plasmo failure")
  })
  try {
    await until(() => watcher.errors.length === 1)
    assert.equal(calls, 2)
    watcher.change()
    await until(() => watcher.logs.some((line) => line.startsWith("Built ")))
    assert.equal(calls, 4)
  } finally { await watcher.stop() }
})

for (const [signalName, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`${signalName} aborts the active child and discards queued rebuilds`, async () => {
    let calls = 0
    let aborted = false
    const watcher = harness((_args, { signal }) => new Promise((_resolve, reject) => {
      calls++
      signal.addEventListener("abort", () => { aborted = true; reject(signal.reason) }, { once: true })
    }))
    await until(() => calls === 1)
    watcher.change()
    watcher.signals.emit(signalName)
    assert.equal(await watcher.done, code)
    watcher.change()
    await delay(15)
    assert.equal(aborted, true)
    assert.equal(calls, 1)
    assert.equal(watcher.closed(), true)
    assert.deepEqual(watcher.errors, [])
    assert.equal(watcher.signals.listenerCount("SIGINT"), 0)
    assert.equal(watcher.signals.listenerCount("SIGTERM"), 0)
  })
}

test("watch-source errors and startup failures clean up instead of claiming to watch", async () => {
  const watcher = harness(async () => {})
  watcher.failWatch(new Error("watch limit"))
  assert.equal(await watcher.done, 1)
  assert.equal(watcher.closed(), true)
  assert.match(watcher.errors[0], /watch limit/)
  const failed = harness(async () => {}, { watchSource() { throw new Error("recursive watch unavailable") } })
  assert.equal(await failed.done, 1)
  assert.match(failed.errors[0], /recursive watch unavailable/)
  assert.equal(failed.signals.listenerCount("SIGINT"), 0)
})

test("watch inputs target only source trees recursively and reattach replaced trees", () => {
  const handles = []
  let changes = 0
  const source = watchInputs("/tmp/workspace with spaces", () => changes++, assert.fail, (path, options, callback) => {
    const handle = Object.assign(new EventEmitter(), { path, options, callback, closed: false, close() { this.closed = true } })
    handles.push(handle)
    return handle
  })
  try {
    assert.deepEqual(handles.filter((handle) => handle.options.recursive).map((handle) => handle.path), ["extension/src", "extension/assets", "protocol/src"].map((path) => join("/tmp/workspace with spaces", path)))
    const extension = handles[1]
    extension.callback("rename", "build")
    extension.callback("rename", ".plasmo")
    extension.callback("change", "README.md")
    assert.equal(changes, 0)
    extension.callback("change", "package.json")
    assert.equal(changes, 1)
    const oldSource = handles[3]
    extension.callback("rename", "src")
    assert.equal(oldSource.closed, true)
    assert.equal(changes, 2)
    assert.equal(handles.at(-1).path, oldSource.path)
    handles.at(-1).callback("change", Buffer.from("sidepanel.tsx"))
    handles[0].callback("change", null)
    assert.equal(changes, 4)
  } finally { source.close() }
  assert.ok(handles.every((handle) => handle.closed))
})

test("watch inputs tolerate absent trees and close handles after attach failures", () => {
  const handles = []
  let failure
  const source = watchInputs("/tmp/fixture", () => {}, (error) => { failure = error }, (path, _options, callback) => {
    if (path.endsWith("src") || path.endsWith("assets")) throw Object.assign(new Error("missing"), { code: "ENOENT" })
    const handle = Object.assign(new EventEmitter(), { callback, closed: false, close() { this.closed = true } })
    handles.push(handle)
    return handle
  })
  handles[1].callback("rename", "src")
  assert.equal(failure, undefined)
  source.close()
  assert.ok(handles.every((handle) => handle.closed))
  const handle = Object.assign(new EventEmitter(), { closed: false, close() { this.closed = true } })
  let count = 0
  assert.throws(() => watchInputs("/tmp/fixture", () => {}, assert.fail, () => {
    if (count++) throw new Error("watch limit")
    return handle
  }), /watch limit/)
  assert.equal(handle.closed, true)
})

test("native recursive filesystem events observe nested inputs but ignore generated output", async () => {
  const directory = fixture()
  let changes = 0
  const failures = []
  const source = watchInputs(directory, () => changes++, (error) => failures.push(error))
  try {
    await delay(50)
    const beforeCreation = changes
    mkdirSync(join(directory, "extension/src/nested"))
    writeFileSync(join(directory, "extension/src/nested/new file.ts"), "export {}")
    await until(() => changes > beforeCreation)
    await delay(30)
    const initial = changes
    writeFileSync(join(directory, "extension/src/nested/new file.ts"), "export const changed = true")
    await until(() => changes > initial)
    await delay(30)
    const previous = changes
    mkdirSync(join(directory, "extension/build"))
    writeFileSync(join(directory, "extension/build/generated.js"), "generated")
    await delay(30)
    assert.equal(changes, previous)
    assert.deepEqual(failures, [])
  } finally {
    source.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

function stubChild() { return Object.assign(new EventEmitter(), { pid: 12345 }) }

test("runner preserves spaced arguments and cwd, rejects spawn/build errors, and skips aborted work", async () => {
  const invocation = { command: "/tmp/pnpm binary", prefix: [] }
  const child = stubChild()
  const controller = new AbortController()
  const runner = createPnpmRunner({ directory: "/tmp/repo with spaces", invocation, spawnProcess(command, args, options) {
    assert.equal(command, invocation.command)
    assert.deepEqual(args, ["--filter", "space name", "build"])
    assert.equal(options.cwd, "/tmp/repo with spaces")
    assert.equal(options.shell, false)
    queueMicrotask(() => child.emit("close", 1, null))
    return child
  } })
  await assert.rejects(runner(["--filter", "space name", "build"], { signal: controller.signal }), /failed \(1\)/)
  const spawnFailure = createPnpmRunner({ invocation, spawnProcess() {
    const failed = stubChild()
    delete failed.pid
    queueMicrotask(() => { failed.emit("error", new Error("ENOENT")); failed.emit("close", -2, null) })
    return failed
  } })
  await assert.rejects(spawnFailure([], { signal: controller.signal }), /ENOENT/)
  controller.abort()
  await assert.rejects(runner([], { signal: controller.signal }), { name: "AbortError" })
})

test("POSIX shutdown escalates the process group even after pnpm exits", async () => {
  const child = stubChild()
  const kills = []
  const controller = new AbortController()
  const runner = createPnpmRunner({ invocation: { command: "/tmp/pnpm", prefix: [] }, platform: "darwin", killDelayMs: 5,
    spawnProcess(_command, _args, options) { assert.equal(options.detached, true); return child },
    kill(pid, signal) { kills.push([pid, signal]); if (signal === "SIGTERM") queueMicrotask(() => child.emit("close", null, "SIGTERM")) },
  })
  const finished = runner(["build"], { signal: controller.signal })
  controller.abort()
  await assert.rejects(finished, { name: "AbortError" })
  assert.deepEqual(kills, [[-child.pid, "SIGTERM"], [-child.pid, "SIGKILL"]])
})

test("Windows shutdown terminates the pnpm descendant tree without a shell", async () => {
  const child = stubChild()
  const controller = new AbortController()
  const runner = createPnpmRunner({ invocation: { command: "pnpm.exe", prefix: [] }, platform: "win32",
    spawnProcess(command, args, options) {
      assert.equal(options.shell, false)
      if (command === "pnpm.exe") { assert.equal(options.detached, false); return child }
      assert.equal(command, "taskkill")
      assert.deepEqual(args, ["/pid", String(child.pid), "/T", "/F"])
      const killer = new EventEmitter()
      queueMicrotask(() => { killer.emit("close", 0); child.emit("close", 1, null) })
      return killer
    },
  })
  const finished = runner(["build"], { signal: controller.signal })
  controller.abort()
  await assert.rejects(finished, { name: "AbortError" })
})
