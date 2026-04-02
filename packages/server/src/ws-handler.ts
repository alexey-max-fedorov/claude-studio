import type { WebSocket } from "ws"
import { parseClientMessage } from "@canvas-code/shared"
import type { ConnectionManager } from "./connection-manager.js"

export function handleConnection(ws: WebSocket, connections: ConnectionManager): void {
  const clientId = connections.add(ws)
  connections.send(clientId, { type: "connected", clientId })

  // Heartbeat
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
          // Will be wired to ClaudeSessionManager in Phase 4
          console.log(`[${clientId}] Prompt: "${msg.prompt}" on ${msg.route} for ${msg.element.cssSelector}`)
          connections.send(clientId, { type: "ai_streaming", chunk: `Received prompt: "${msg.prompt}" for ${msg.element.cssSelector}` })
          connections.send(clientId, { type: "ai_complete", result: "Stub response", sessionId: "stub", cost: 0, turns: 0 })
          break
        case "raw_prompt":
          console.log(`[${clientId}] Raw prompt: "${msg.prompt}"`)
          break
        case "reset_session":
          console.log(`[${clientId}] Session reset`)
          connections.send(clientId, { type: "session_reset", newSessionId: "new-stub" })
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
