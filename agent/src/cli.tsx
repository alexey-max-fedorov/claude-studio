#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { ConfigStore } from "./config-store.js"
import { startServer } from "./server.js"
import { App } from "./tui/App.js"
import { log } from "./logger.js"

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf-8"))
    return pkg.version ?? "2.0.0"
  } catch {
    return "2.0.0"
  }
}

function parseArgs(argv: string[]) {
  const out: { port: number; host: string; tui: boolean; help: boolean; version: boolean } = {
    port: Number(process.env.PORT ?? 7281),
    host: process.env.BIND_HOST ?? "127.0.0.1",
    tui: true, help: false, version: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--port" || a === "-p") out.port = Number(argv[++i])
    else if (a === "--host") out.host = argv[++i]
    else if (a === "--no-tui") out.tui = false
    else if (a === "--help" || a === "-h") out.help = true
    else if (a === "--version" || a === "-v") out.version = true
  }
  return out
}

const HELP = `claude-studio — visual AI coding assistant (agent server)

Usage:
  pnpx claude-studio [options]      run in your project directory

Options:
  -p, --port <n>     WebSocket port (default 7281, or $PORT)
      --host <h>     bind host (default 127.0.0.1, or $BIND_HOST)
      --no-tui       headless mode (print URL, log to stderr)
  -v, --version      print version
  -h, --help         show this help
`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const version = readVersion()
  if (args.help) { process.stdout.write(HELP); return }
  if (args.version) { process.stdout.write(version + "\n"); return }

  const config = new ConfigStore(process.cwd())
  const server = startServer({ config, host: args.host, port: args.port, serverVersion: version })

  const useTui = args.tui && process.stdout.isTTY
  if (useTui) {
    const { waitUntilExit } = render(<App config={config} connections={server.connections} url={server.url} />)
    await waitUntilExit()
    await server.close()
  } else {
    log.success("SRV", `Claude Studio ${version} — ${server.url}`)
    process.stdout.write(`Claude Studio ${version}\nWebSocket: ${server.url}\n`)
    process.on("SIGINT", async () => { await server.close(); process.exit(0) })
  }
}

main().catch((err) => {
  log.error("SRV", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
