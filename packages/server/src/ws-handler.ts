import type { WebSocket } from "ws"
import { parseClientMessage } from "@canvas-code/shared"
import type { ConnectionManager } from "./connection-manager.js"
import type { ClaudeSessionManager } from "./claude-session.js"
import { log } from "./logger.js"

interface StreamCallbacks {
  onStreaming: (chunk: string) => void
  onToolUse: (tool: string, input: Record<string, unknown>) => void
  onComplete: (result: string, sessionId: string, cost: number, turns: number) => void
  onError: (error: string) => void
}

function withLogging(clientId: string, callbacks: StreamCallbacks): StreamCallbacks {
  let streamStarted = false
  return {
    onStreaming(chunk) {
      if (!streamStarted) {
        streamStarted = true
        log.dim("AI", `[${clientId.slice(0, 8)}] Streaming started`)
      }
      callbacks.onStreaming(chunk)
    },
    onToolUse(tool, input) {
      log.event("AI", `[${clientId.slice(0, 8)}] Tool: ${tool} ${JSON.stringify(input).slice(0, 100)}`)
      callbacks.onToolUse(tool, input)
    },
    onComplete(result, sessionId, cost, turns) {
      log.success("AI", `[${clientId.slice(0, 8)}] Complete (${turns} turns, $${cost.toFixed(4)})`)
      callbacks.onComplete(result, sessionId, cost, turns)
    },
    onError(error) {
      log.error("AI", `[${clientId.slice(0, 8)}] Error: ${error}`)
      callbacks.onError(error)
    },
  }
}

export function handleConnection(ws: WebSocket, connections: ConnectionManager, claude: ClaudeSessionManager): void {
  const clientId = connections.add(ws)
  const short = clientId.slice(0, 8)
  log.info("WS", `Client connected: ${short}`)
  connections.send(clientId, { type: "connected", clientId })

  let alive = true
  ws.on("pong", () => { alive = true })
  const heartbeat = setInterval(() => {
    if (!alive) {
      log.dim("WS", `Heartbeat timeout, terminating: ${short}`)
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
  }, 30_000)

  ws.on("message", (data) => {
    try {
      const msg = parseClientMessage(data.toString())
      switch (msg.type) {
        case "ping":
          connections.send(clientId, { type: "pong" })
          break

        case "prompt":
          log.event("AI", `[${short}] Prompt: "${msg.prompt}" → ${msg.element.cssSelector} on ${msg.route}`)
          claude.executePrompt(clientId, {
            route: msg.route,
            element: msg.element,
            prompt: msg.prompt,
          }, withLogging(clientId, {
            onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
            onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
            onComplete: (result, sessionId, cost, turns) =>
              connections.send(clientId, { type: "ai_complete", result, sessionId, cost, turns }),
            onError: (error) => connections.send(clientId, { type: "ai_error", error }),
          }))
          break

        case "raw_prompt":
          log.event("AI", `[${short}] Raw prompt: "${msg.prompt}"`)
          claude.executeRawPrompt(clientId, msg.prompt, withLogging(clientId, {
            onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
            onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
            onComplete: (result, sessionId, cost, turns) =>
              connections.send(clientId, { type: "ai_complete", result, sessionId, cost, turns }),
            onError: (error) => connections.send(clientId, { type: "ai_error", error }),
          }))
          break

        case "reset_session":
          log.info("WS", `[${short}] Session reset`)
          claude.resetSession(clientId)
          connections.send(clientId, { type: "session_reset", newSessionId: "reset" })
          break
      }
    } catch (err) {
      log.error("WS", `[${short}] Message error: ${err}`)
      connections.send(clientId, { type: "ai_error", error: String(err) })
    }
  })

  ws.on("close", () => {
    log.info("WS", `Client disconnected: ${short}`)
    clearInterval(heartbeat)
    connections.remove(clientId)
  })
}
