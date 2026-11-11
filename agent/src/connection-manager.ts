import { randomUUID } from "node:crypto"
import type { WebSocket } from "ws"
import { serializeServerMessage, type ServerMessage } from "@claude-studio/protocol"

interface Client {
  id: string
  ws: WebSocket
  sessions: Set<string>
}

/** Connected clients plus which sessions each one is subscribed to. */
export class ConnectionManager {
  private clients = new Map<string, Client>()

  add(ws: WebSocket): string {
    const id = randomUUID()
    this.clients.set(id, { id, ws, sessions: new Set() })
    return id
  }

  remove(clientId: string): void {
    this.clients.delete(clientId)
  }

  subscribe(clientId: string, sessionId: string): void {
    this.clients.get(clientId)?.sessions.add(sessionId)
  }

  send(clientId: string, msg: ServerMessage): void {
    const c = this.clients.get(clientId)
    if (c && c.ws.readyState === 1) c.ws.send(serializeServerMessage(msg))
  }

  broadcast(msg: ServerMessage): void {
    const raw = serializeServerMessage(msg)
    for (const { ws } of this.clients.values()) if (ws.readyState === 1) ws.send(raw)
  }

  /** Send to every client subscribed to sessionId. */
  toSession(sessionId: string, msg: ServerMessage): void {
    const raw = serializeServerMessage(msg)
    for (const c of this.clients.values()) {
      if (c.sessions.has(sessionId) && c.ws.readyState === 1) c.ws.send(raw)
    }
  }

  get count(): number {
    return this.clients.size
  }
}
