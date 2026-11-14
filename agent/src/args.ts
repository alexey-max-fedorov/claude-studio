import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULT_EXTENSION_ORIGIN, isLoopbackBindHost, normalizeOrigin } from "./security.js"

export interface CliArgs {
  projectDir: string
  port: number
  host: string
  allowedOrigins: string[]
  allowNoOrigin: boolean
  unsafeBind: boolean
  help: boolean
  version: boolean
}

export const HELP = `claude-studio: Claude Code daemon for the Claude Studio browser side panel

Runs Claude Code (Agent SDK) in ONE project dir and serves it over a
localhost WebSocket to the side panel extension.

Usage:
  claude-studio [options]

Options:
  --project <dir>         project dir Claude Code runs in (default: cwd)
  -p, --port <n>          port (default 7281, or $PORT)
  --host <h>              bind host (default 127.0.0.1; loopback only unless
                          --unsafe-bind is also given)
  --unsafe-bind           allow a non-loopback --host (exposes Claude Code with
                          Bash to the network; the Origin check still applies)
  --allow-origin <o>      extra allowed WebSocket Origin (repeatable), also
                          $CLAUDE_STUDIO_ALLOWED_ORIGINS (comma-separated)
  -v, --version           print version
  -h, --help              show this help

Environment:
  CLAUDE_STUDIO_ALLOW_NO_ORIGIN=1   accept connections without an Origin
                                    header (local test scripts only)
  CLAUDE_STUDIO_CONFIG=<file>       config file path (default
                                    ~/.claude-studio/config.json)

The extension origin ${DEFAULT_EXTENSION_ORIGIN} is always allowed.
`

/** Parse argv (without node + script). Throws Error with a readable message on bad input. */
export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): CliArgs {
  let projectDir = cwd
  let port = env.PORT !== undefined && env.PORT !== "" ? Number(env.PORT) : 7281
  let host = "127.0.0.1"
  const origins: string[] = [DEFAULT_EXTENSION_ORIGIN]
  let help = false
  let version = false
  let unsafeBind = false

  const need = (i: number, flag: string): string => {
    const v = argv[i]
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} requires a value`)
    return v
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--project") projectDir = need(++i, a)
    else if (a.startsWith("--project=")) projectDir = a.slice("--project=".length)
    else if (a === "--port" || a === "-p") port = Number(need(++i, a))
    else if (a.startsWith("--port=")) port = Number(a.slice("--port=".length))
    else if (a === "--host") host = need(++i, a)
    else if (a.startsWith("--host=")) host = a.slice("--host=".length)
    else if (a === "--allow-origin") origins.push(need(++i, a))
    else if (a.startsWith("--allow-origin=")) origins.push(a.slice("--allow-origin=".length))
    else if (a === "--unsafe-bind") unsafeBind = true
    else if (a === "--help" || a === "-h") help = true
    else if (a === "--version" || a === "-v") version = true
    else throw new Error(`unknown option: ${a}`)
  }

  for (const o of (env.CLAUDE_STUDIO_ALLOWED_ORIGINS ?? "").split(",")) {
    if (o.trim()) origins.push(o.trim())
  }

  if (!help && !version) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer 1..65535")
    if (!host) throw new Error("--host requires a value")
    if (!isLoopbackBindHost(host) && !unsafeBind) {
      throw new Error(`refusing to bind non-loopback host ${host}; pass --unsafe-bind if you really mean it`)
    }
    projectDir = resolve(cwd, projectDir)
    if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
      throw new Error(`project dir does not exist or is not a directory: ${projectDir}`)
    }
  }

  return {
    projectDir,
    port,
    host,
    allowedOrigins: [...new Set(origins.map(normalizeOrigin))],
    allowNoOrigin: env.CLAUDE_STUDIO_ALLOW_NO_ORIGIN === "1",
    unsafeBind,
    help,
    version,
  }
}
