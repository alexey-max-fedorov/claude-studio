import { createServer, type IncomingMessage } from "node:http"
import { WebSocketServer, type WebSocket } from "ws"
import { PERMISSION_MODES, PROTOCOL_VERSION, parseClientMessage, type ClientMessage, type ServerMessage } from "@claude-studio/protocol"
import type { ConfigStore } from "./config-store.js"
import { ConnectionManager } from "./connection-manager.js"
import { ConversationManager, type SdkApi } from "./conversation-manager.js"
import { errText, log } from "./logger.js"
import { isAllowedHost, isAllowedOrigin } from "./security.js"

export const MAX_PAYLOAD = 16 * 1024 * 1024
const HEARTBEAT_MS = 30_000

export interface ServerOptions {
  config: ConfigStore
  sdk: SdkApi
  host: string
  port: number
  version: string
  allowedOrigins: string[]
  allowNoOrigin: boolean
  idleMs?: number
}

export interface StartedServer {
  url: string
  port: number
  manager: ConversationManager
  connections: ConnectionManager
  close(): Promise<void>
}

function extraHosts(bindHost: string): string[] {
  return bindHost && bindHost !== "0.0.0.0" && bindHost !== "::" ? [bindHost] : []
}

export function startServer(opts: ServerOptions): Promise<StartedServer> {
  const { config, version } = opts
  const connections = new ConnectionManager()
  const hosts = extraHosts(opts.host)

  const manager = new ConversationManager({
    getConfig: () => config.get(),
    sdk: opts.sdk,
    version,
    idleMs: opts.idleMs,
    sink: {
      event: (sessionId, event, sequence) => connections.toSession(sessionId, { type: "event", sessionId, event, sequence }),
      reset: (previousId, nextId) => connections.migrateSession(previousId, nextId),
      capabilitiesChanged: () => connections.broadcast(configState()),
    },
  })

  const configState = (): ServerMessage => ({
    type: "config_state",
    config: config.get(),
    models: manager.models(),
    commands: manager.commands(),
    permissionModes: PERMISSION_MODES,
  })

  const onConfigChange = (next: any, prev: any) => {
    manager.onConfigChange(next, prev)
    connections.broadcast(configState())
  }
  config.on("change", onConfigChange)

  const http = createServer((req, res) => {
    if (!isAllowedHost(req.headers.host, hosts)) {
      log.warn("HTTP", `rejected request with Host ${JSON.stringify(req.headers.host ?? "")}`)
      res.writeHead(403, { "content-type": "text/plain" })
      res.end("Forbidden")
      return
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ status: "ok", version, projectDir: config.get().projectDir, live: manager.liveCount }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_PAYLOAD,
    verifyClient: (info: { origin: string; req: IncomingMessage }, cb: (ok: boolean, code?: number, msg?: string) => void) => {
      const host = info.req.headers.host
      const origin = info.req.headers.origin
      if (!isAllowedHost(host, hosts)) {
        log.warn("WS", `rejected connection: Host ${JSON.stringify(host ?? "")} is not loopback`)
        return cb(false, 403, "Forbidden")
      }
      if (!isAllowedOrigin(origin, opts.allowedOrigins, opts.allowNoOrigin)) {
        log.warn("WS", `rejected connection: Origin ${JSON.stringify(origin ?? "(none)")} is not allowed`)
        return cb(false, 403, "Forbidden")
      }
      cb(true)
    },
  })

  // ws re-emits the http server's "error" events (EADDRINUSE included); an
  // unhandled "error" event would crash the daemon.
  wss.on("error", (err) => log.error("WS", `server error: ${errText(err)}`))

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientId = connections.add(ws)
    const short = clientId.slice(0, 8)
    log.info("WS", `client ${short} connected (origin ${req.headers.origin ?? "none"})`)
    connections.send(clientId, { type: "hello", serverVersion: version, protocol: PROTOCOL_VERSION, projectDir: config.get().projectDir })
    connections.send(clientId, configState())

    let alive = true
    ws.on("pong", () => {
      alive = true
    })
    const heartbeat = setInterval(() => {
      if (!alive) {
        log.info("WS", `client ${short} heartbeat timeout`)
        ws.terminate()
        return
      }
      alive = false
      try {
        ws.ping()
      } catch {
        /* socket already closing */
      }
    }, HEARTBEAT_MS)
    heartbeat.unref?.()

    ws.on("message", (data) => {
      let msg: ClientMessage
      try {
        msg = parseClientMessage(data.toString())
      } catch (err) {
        connections.send(clientId, { type: "error", error: errText(err) })
        return
      }
      handle(clientId, msg).catch((err) => {
        const sessionId = "sessionId" in msg ? (msg as { sessionId: string }).sessionId : undefined
        connections.send(clientId, { type: "error", error: errText(err), ...(sessionId ? { sessionId } : {}) })
      })
    })

    ws.on("close", () => {
      clearInterval(heartbeat)
      connections.remove(clientId)
      log.info("WS", `client ${short} disconnected`)
    })
    ws.on("error", (err) => log.warn("WS", `client ${short} error: ${errText(err)}`))
  })

  async function sendSessionList(clientId: string, limit = 40, offset = 0): Promise<void> {
    const { sessions, hasMore } = await manager.listSessions(limit, offset)
    connections.send(clientId, { type: "session_list", sessions, offset, hasMore })
  }

  async function handle(clientId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "ping":
        connections.send(clientId, { type: "pong" })
        return
      case "get_state": {
        connections.send(clientId, configState())
        const sessions = manager.liveSessions()
        for (const s of sessions) connections.subscribe(clientId, s.sessionId)
        connections.send(clientId, { type: "live_sessions", sessions })
        return
      }
      case "set_config": {
        const applied = config.update(msg.patch)
        if (Object.keys(applied).length === 0) {
          connections.send(clientId, { type: "config_error", error: "No valid or changed settings in patch." })
          connections.send(clientId, configState())
        }
        return
      }
      case "list_sessions":
        await sendSessionList(clientId, msg.limit ?? 40, msg.offset ?? 0)
        return
      case "open_session": {
        const sessionId = msg.followResets ? connections.resolveSession(clientId, msg.sessionId) : msg.sessionId
        if (msg.followResets) connections.subscribe(clientId, sessionId)
        else connections.selectSession(clientId, sessionId)
        const h = await manager.history(sessionId)
        connections.subscribe(clientId, h.sessionId)
        connections.send(clientId, { type: "session_history", ...h, ...(msg.requestId ? { requestId: msg.requestId } : {}) })
        return
      }
      case "send": {
        const sessionId = connections.resolveSession(clientId, msg.sessionId)
        connections.subscribe(clientId, sessionId)
        manager.send(sessionId, msg.text, msg.attachments)
        return
      }
      case "interrupt":
        await manager.interrupt(connections.resolveSession(clientId, msg.sessionId))
        return
      case "permission_response":
        if (!manager.respondPermission({ ...msg, sessionId: connections.resolveSession(clientId, msg.sessionId) })) {
          connections.send(clientId, { type: "error", error: "That permission request is no longer pending.", sessionId: msg.sessionId })
        }
        return
      case "close_session":
        manager.close(connections.resolveSession(clientId, msg.sessionId))
        return
      case "rename_session":
        await manager.rename(msg.sessionId, msg.title)
        await sendSessionList(clientId)
        return
    }
  }

  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      config.off("change", onConfigChange)
      reject(err.code === "EADDRINUSE" ? new Error(`port ${opts.port} is already in use`) : err)
    }
    http.once("error", onError)
    http.listen(opts.port, opts.host, () => {
      http.off("error", onError)
      http.on("error", (err) => log.error("HTTP", errText(err)))
      const addr = http.address()
      const port = typeof addr === "object" && addr ? addr.port : opts.port
      const shownHost = opts.host === "0.0.0.0" || opts.host === "::" ? "127.0.0.1" : opts.host
      const url = `ws://${shownHost.includes(":") ? `[${shownHost}]` : shownHost}:${port}`
      resolve({
        url,
        port,
        manager,
        connections,
        close: () =>
          new Promise<void>((done) => {
            config.off("change", onConfigChange)
            manager.shutdown()
            for (const c of wss.clients) c.terminate()
            wss.close()
            http.close(() => done())
            http.closeAllConnections?.()
          }),
      })
    })
  })
}
