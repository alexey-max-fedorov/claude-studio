#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { getSessionInfo, getSessionMessages, listSessions, query, renameSession } from "@anthropic-ai/claude-agent-sdk"
import { HELP, parseArgs } from "./args.js"
import { ConfigStore } from "./config-store.js"
import type { SdkApi } from "./conversation-manager.js"
import { errText, log } from "./logger.js"
import { startServer } from "./server.js"

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf-8"))
    return String(pkg.version ?? "0.0.0")
  } catch {
    return "0.0.0"
  }
}

const sdk: SdkApi = { query, getSessionInfo, getSessionMessages, listSessions, renameSession }

async function main(): Promise<void> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`claude-studio: ${errText(err)}\n\n${HELP}`)
    process.exit(2)
  }
  const version = readVersion()
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.version) {
    process.stdout.write(`${version}\n`)
    return
  }

  const config = new ConfigStore(args.projectDir, process.env.CLAUDE_STUDIO_CONFIG || undefined)
  const server = await startServer({
    config,
    sdk,
    host: args.host,
    port: args.port,
    version,
    allowedOrigins: args.allowedOrigins,
    allowNoOrigin: args.allowNoOrigin,
  })
  log.info("SRV", `Claude Studio agent ${version} listening on ${server.url}`)
  log.info("SRV", `project: ${args.projectDir}`)
  log.info("SRV", `config: ${config.path}`)
  log.info("SRV", `allowed origins: ${args.allowedOrigins.join(", ")}${args.allowNoOrigin ? " (+ no Origin)" : ""}`)

  // Fill the model + slash command lists before the first conversation (no model call).
  void server.manager.probeCapabilities()

  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) return
    stopping = true
    log.info("SRV", `${signal} received, shutting down`)
    const force = setTimeout(() => process.exit(0), 5_000)
    force.unref()
    await server.close()
    process.exit(0)
  }
  process.on("SIGINT", () => void stop("SIGINT"))
  process.on("SIGTERM", () => void stop("SIGTERM"))
}

// Keep the daemon up through stray errors (log them), but let launchd restart
// it if they come in a burst, which means something is really broken.
const crashTimes: number[] = []
function onStrayError(kind: string, err: unknown): void {
  log.error("SRV", `${kind}: ${err instanceof Error && err.stack ? err.stack : errText(err)}`)
  const now = Date.now()
  crashTimes.push(now)
  while (crashTimes.length && now - crashTimes[0] > 60_000) crashTimes.shift()
  if (crashTimes.length > 20) {
    log.error("SRV", "too many errors in one minute, exiting")
    process.exit(1)
  }
}
process.on("unhandledRejection", (err) => onStrayError("unhandled rejection", err))
process.on("uncaughtException", (err) => onStrayError("uncaught exception", err))

main().catch((err) => {
  log.error("SRV", errText(err))
  process.exit(1)
})
