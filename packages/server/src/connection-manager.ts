import { randomUUID } from "node:crypto"
import type { WebSocket } from "ws"
import type { ServerMessage } from "@canvas-code/shared"
import { serializeServerMessage } from "@canvas-code/shared"

interface Client {
  id: string
  ws: WebSocket
  sessionId: string | null
}

export class ConnectionManager {
  private clients = new Map<string, Client>()

  add(ws: WebSocket): string {
    const id = randomUUID()
    this.clients.set(id, { id, ws, sessionId: null })
    return id
  }

  remove(clientId: string): void {
    this.clients.delete(clientId)
  }

  send(clientId: string, msg: ServerMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === 1) {
      client.ws.send(serializeServerMessage(msg))
    }
  }

  getClient(clientId: string): Client | undefined {
    return this.clients.get(clientId)
  }

  setSessionId(clientId: string, sessionId: string): void {
    const client = this.clients.get(clientId)
    if (client) client.sessionId = sessionId
  }

  get count(): number {
    return this.clients.size
  }
}
