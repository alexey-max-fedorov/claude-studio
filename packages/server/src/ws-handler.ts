import type { WebSocket } from "ws"
import { parseClientMessage } from "@canvas-code/shared"
import type { ConnectionManager } from "./connection-manager.js"
import type { ClaudeSessionManager } from "./claude-session.js"

export function handleConnection(ws: WebSocket, connections: ConnectionManager, claude: ClaudeSessionManager): void {
  const clientId = connections.add(ws)
  connections.send(clientId, { type: "connected", clientId })

  let alive = true
  ws.on("pong", () => { alive = true })
  const heartbeat = setInterval(() => {
    if (!alive) { ws.terminate(); return }
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
          console.log(`[${clientId}] Prompt: "${msg.prompt}" for ${msg.element.cssSelector} on ${msg.route}`)
          claude.executePrompt(clientId, {
            route: msg.route,
            element: msg.element,
            prompt: msg.prompt,
          }, {
            onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
            onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
            onComplete: (result, sessionId, cost, turns) =>
              connections.send(clientId, { type: "ai_complete", result, sessionId, cost, turns }),
            onError: (error) => connections.send(clientId, { type: "ai_error", error }),
          })
          break

        case "raw_prompt":
          console.log(`[${clientId}] Raw prompt: "${msg.prompt}"`)
          claude.executeRawPrompt(clientId, msg.prompt, {
            onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
            onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
            onComplete: (result, sessionId, cost, turns) =>
              connections.send(clientId, { type: "ai_complete", result, sessionId, cost, turns }),
            onError: (error) => connections.send(clientId, { type: "ai_error", error }),
          })
          break

        case "reset_session":
          claude.resetSession(clientId)
          connections.send(clientId, { type: "session_reset", newSessionId: "reset" })
          break
      }
    } catch (err) {
      connections.send(clientId, { type: "ai_error", error: String(err) })
    }
  })

  ws.on("close", () => {
    clearInterval(heartbeat)
    connections.remove(clientId)
  })
}
