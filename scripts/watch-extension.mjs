import { spawn } from "node:child_process"
import { watch } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const trees = ["extension/src", "extension/assets", "protocol/src"]
const ignored = new Set(["node_modules", "build", "dist", ".plasmo", ".git"])
const config = /^(?:tsconfig(?:\.[\w-]+)?\.json|(?:postcss|tailwind|babel)\.config\.[cm]?[jt]s|\.(?:parcelrc|babelrc|postcssrc)(?:\.[\w]+)?|\.browserslistrc|browserslist)$/

export function isBuildInput(filename) {
  if (filename == null) return true
  const parts = String(filename).replaceAll("\\", "/").split("/")
  if (parts.some((part) => ignored.has(part) || part === ".." || part === "")) return false
  const path = parts.join("/")
  if (trees.some((tree) => path === tree || path.startsWith(`${tree}/`))) return true
  const name = parts.at(-1)
  if (parts.length === 1) return ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", ".pnpmfile.cjs"].includes(name) || config.test(name)
  if (parts.length !== 2 || !["extension", "protocol"].includes(parts[0])) return false
  return name === "package.json" || config.test(name) || (parts[0] === "extension" && /^\.env(?:\.|$)/.test(name))
}

export function watchInputs(directory, onChange, onError, watchDirectory = watch) {
  const handles = new Map()
  function attach(path, recursive) {
    const handle = watchDirectory(join(directory, path), { recursive }, (_event, filename) => {
      const name = filename == null ? null : String(filename).replaceAll("\\", "/")
      const relative = name == null ? null : [path, name].filter(Boolean).join("/")
      // Parent watches reattach trees after deletion, replacement, or creation.
      try {
        if (!recursive) {
          for (const tree of trees) {
            if (relative == null || relative === tree) {
              handles.get(tree)?.close()
              handles.delete(tree)
              attachTree(tree)
            }
          }
        }
        if (isBuildInput(relative)) onChange()
      } catch (error) { onError(error) }
    })
    handle.on("error", onError)
    handles.set(path, handle)
  }
  function attachTree(path) {
    try { attach(path, true) } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  const close = () => { for (const handle of handles.values()) handle.close(); handles.clear() }
  try {
    for (const path of ["", "extension", "protocol"]) attach(path, false)
    for (const path of trees) attachTree(path)
  } catch (error) { close(); throw error }
  return { close }
}

export function createBuildQueue(build, onError, debounceMs = 150) {
  let pending = false
  let stopped = false
  let timer
  let running
  function flush() {
    timer = undefined
    if (stopped || running || !pending) return
    pending = false
    running = Promise.resolve().then(() => { if (!stopped) return build() }).catch((error) => {
      if (!stopped) onError(error)
    }).finally(() => {
      running = undefined
      if (pending && !stopped) timer = setTimeout(flush, debounceMs)
    })
  }
  return {
    request(immediate = false) {
      if (stopped) return
      pending = true
      clearTimeout(timer)
      if (!running) {
        if (immediate) flush()
        else timer = setTimeout(flush, debounceMs)
      }
    },
    async close() {
      stopped = true
      pending = false
      clearTimeout(timer)
      await running
    },
  }
}

export function pnpmInvocation(execPath = process.env.npm_execpath) {
  if (!execPath || !/^pnpm(?:\.[cm]?js|\.exe)?$/i.test(basename(execPath))) {
    throw new Error("Run this watcher with pnpm dev:ext (or pnpm exec node scripts/watch-extension.mjs).")
  }
  return /\.[cm]?js$/i.test(execPath) ? { command: process.execPath, prefix: [execPath] } : { command: execPath, prefix: [] }
}

export function createPnpmRunner({ directory = root, invocation = pnpmInvocation(), spawnProcess = spawn, kill = process.kill, platform = process.platform, killDelayMs = 1500 } = {}) {
  return (args, { signal }) => new Promise((resolveRun, rejectRun) => {
    if (signal.aborted) { rejectRun(signal.reason); return }
    let child
    try {
      child = spawnProcess(invocation.command, [...invocation.prefix, ...args], {
        cwd: directory, stdio: "inherit", shell: false, detached: platform !== "win32",
      })
    } catch (error) { rejectRun(error); return }
    let termination
    let failure
    function killGroup(name) {
      try { kill(-child.pid, name) } catch (error) { if (error.code !== "ESRCH") throw error }
    }
    function abort() {
      if (!child.pid || termination) return
      if (platform === "win32") {
        termination = new Promise((resolveKill, rejectKill) => {
          // pnpm starts descendants, so terminating only its PID is insufficient.
          const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false })
          killer.once("error", rejectKill)
          killer.once("close", (code) => code === 0 ? resolveKill() : rejectKill(new Error(`taskkill exited with ${code}`)))
        })
      } else {
        termination = new Promise((resolveKill, rejectKill) => {
          try { killGroup("SIGTERM") } catch (error) { rejectKill(error); return }
          // The group can outlive pnpm if a descendant ignores SIGTERM.
          setTimeout(() => {
            try { killGroup("SIGKILL"); resolveKill() } catch (error) { rejectKill(error) }
          }, killDelayMs)
        })
      }
      termination.catch(() => {})
    }
    signal.addEventListener("abort", abort, { once: true })
    child.once("error", (error) => { failure = error })
    child.once("close", async (code, childSignal) => {
      signal.removeEventListener("abort", abort)
      try {
        await termination
        if (signal.aborted) throw signal.reason
        if (failure) throw failure
        if (code !== 0) throw new Error(`pnpm ${args.join(" ")} failed (${childSignal ?? code})`)
        resolveRun()
      } catch (error) { rejectRun(error) }
    })
    if (signal.aborted) abort()
  })
}

export async function buildExtension(run, signal) {
  signal.throwIfAborted()
  await run(["--filter", "@claude-studio/protocol", "build"], { signal })
  signal.throwIfAborted()
  await run(["--filter", "@claude-studio/extension", "exec", "plasmo", "build", "--tag=dev", "--target=chrome-mv3", "--src-path=src", "--build-path=build"], { signal })
  signal.throwIfAborted()
}

export function startExtensionWatcher({ directory = root, run = createPnpmRunner({ directory }), watchSource = watchInputs, signals = process, log = console.log, error = console.error, debounceMs = 150 } = {}) {
  const controller = new AbortController()
  let source
  let stopping
  let finish
  const done = new Promise((resolveDone) => { finish = resolveDone })
  const queue = createBuildQueue(async () => {
    log("Building protocol and extension (no development server)...")
    await buildExtension(run, controller.signal)
    log("Built extension/build/chrome-mv3-dev. Reload the extension manually in chrome://extensions.")
  }, (failure) => error(`Extension build failed; watching for changes. ${failure.message}`), debounceMs)
  const onSigint = () => { void stop(130) }
  const onSigterm = () => { void stop(143) }
  function stop(code = 0) {
    stopping ??= (async () => {
      controller.abort()
      source?.close()
      await queue.close()
      signals.removeListener("SIGINT", onSigint)
      signals.removeListener("SIGTERM", onSigterm)
      finish(code)
    })()
    return stopping
  }
  signals.once("SIGINT", onSigint)
  signals.once("SIGTERM", onSigterm)
  try {
    source = watchSource(directory, () => queue.request(), (failure) => {
      error(`Extension input watcher failed: ${failure.message}`)
      void stop(1)
    })
    log("Watching local extension inputs only. No HTTP/WebSocket server or network HMR client. Manual extension reload is required.")
    queue.request(true)
  } catch (failure) {
    error(failure.message)
    void stop(1)
  }
  return { stop, done }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await startExtensionWatcher().done
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
