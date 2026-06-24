import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import type { WebSocket } from "ws"
import { serializeServerMessage, type ServerMessage } from "@claude-studio/protocol"

interface Client {
  id: string
  ws: WebSocket
}

export class ConnectionManager extends EventEmitter {
  private clients = new Map<string, Client>()

  add(ws: WebSocket): string {
    const id = randomUUID()
    this.clients.set(id, { id, ws })
    this.emit("count", this.clients.size)
    return id
  }

  remove(clientId: string): void {
    if (this.clients.delete(clientId)) this.emit("count", this.clients.size)
  }

  send(clientId: string, msg: ServerMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === 1) client.ws.send(serializeServerMessage(msg))
  }

  broadcast(msg: ServerMessage): void {
    const raw = serializeServerMessage(msg)
    for (const { ws } of this.clients.values()) {
      if (ws.readyState === 1) ws.send(raw)
    }
  }

  get count(): number {
    return this.clients.size
  }
}
