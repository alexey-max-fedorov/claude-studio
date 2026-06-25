import type { WebSocket } from "ws"
import type { IncomingMessage } from "node:http"
import { parseClientMessage, type ServerMessage } from "@claude-studio/protocol"
import type { ConnectionManager } from "./connection-manager.js"
import type { ClaudeSession, SessionCallbacks } from "./claude-session.js"
import type { ConfigStore } from "./config-store.js"
import { availableModels, discoverPlugins, discoverSkills } from "./discovery.js"
import { log } from "./logger.js"

export interface HandlerDeps {
  connections: ConnectionManager
  claude: ClaudeSession
  config: ConfigStore
  serverVersion: string
}

export function buildConfigState(config: ConfigStore): ServerMessage {
  const cfg = config.get()
  return {
    type: "config_state",
    config: cfg,
    availableModels: availableModels(),
    availablePlugins: discoverPlugins(cfg.projectDir),
    availableSkills: discoverSkills(cfg.projectDir),
  }
}

export function handleConnection(ws: WebSocket, req: IncomingMessage, deps: HandlerDeps): void {
  const { connections, claude, config, serverVersion } = deps
  const clientId = connections.add(ws)
  const devHost = hostFromHeader(req.headers.host)
  const short = clientId.slice(0, 8)
  log.info("WS", `client connected: ${short}`)
  connections.send(clientId, { type: "connected", clientId, serverVersion })
  connections.send(clientId, buildConfigState(config))

  let alive = true
  ws.on("pong", () => { alive = true })
  const heartbeat = setInterval(() => {
    if (!alive) { log.dim("WS", `heartbeat timeout: ${short}`); ws.terminate(); return }
    alive = false
    ws.ping()
  }, 30_000)

  const callbacks = (): SessionCallbacks => ({
    onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
    onThinking: (chunk) => connections.send(clientId, { type: "ai_thinking", chunk }),
    onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
    onError: (error) => connections.send(clientId, { type: "ai_error", error }),
    onComplete: (c) => {
      connections.send(clientId, { type: "ai_complete", ...c })
      const s = claude.getStats(clientId)
      connections.send(clientId, {
        type: "session_info",
        model: config.get().model,
        cumulativeCost: s.totalCost,
        cumulativeInputTokens: s.totalInputTokens,
        cumulativeOutputTokens: s.totalOutputTokens,
        turnCount: s.turnCount,
      })
    },
  })

  ws.on("message", (data) => {
    let msg
    try {
      msg = parseClientMessage(data.toString())
    } catch (err) {
      connections.send(clientId, { type: "ai_error", error: String(err) })
      return
    }
    switch (msg.type) {
      case "ping":
        connections.send(clientId, { type: "pong" })
        break
      case "prompt":
        claude.executePrompt(clientId, { route: msg.route, url: msg.url ?? "", element: msg.element, prompt: msg.prompt, devHost }, callbacks())
        break
      case "raw_prompt":
        claude.executeRawPrompt(clientId, msg.prompt, callbacks())
        break
      case "interrupt":
        void claude.interrupt(clientId)
        break
      case "reset_session":
        claude.resetSession(clientId)
        connections.send(clientId, { type: "session_reset", newSessionId: "reset" })
        break
      case "get_config":
        connections.send(clientId, buildConfigState(config))
        break
      case "set_config":
        try {
          config.update(msg.patch) // ConfigStore "change" → server broadcasts config_state to all
        } catch (err) {
          connections.send(clientId, { type: "config_error", error: String(err) })
        }
        break
      case "query_capabilities":
        connections.send(clientId, { type: "capabilities", commands: claude.getCapabilities() })
        break
    }
  })

  ws.on("close", () => {
    log.info("WS", `client disconnected: ${short}`)
    clearInterval(heartbeat)
    connections.remove(clientId)
    claude.resetSession(clientId)
  })
}

/** The hostname the client dialed (from the WS upgrade Host header), lowercased, port stripped. */
function hostFromHeader(h: string | undefined): string | undefined {
  if (!h) return undefined
  try { return new URL("http://" + h).hostname.toLowerCase() } catch { return undefined }
}
