import { createServer } from "node:http"
import { WebSocketServer } from "ws"
import { ConnectionManager } from "./connection-manager.js"
import { ClaudeSession } from "./claude-session.js"
import type { ConfigStore } from "./config-store.js"
import { handleConnection, buildConfigState } from "./ws-handler.js"
import { log } from "./logger.js"

export interface StartedServer {
  url: string
  connections: ConnectionManager
  close(): Promise<void>
}

export function startServer(opts: {
  config: ConfigStore
  host: string
  port: number
  serverVersion: string
}): StartedServer {
  const { config, host, port, serverVersion } = opts
  const connections = new ConnectionManager()
  const claude = new ClaudeSession(() => config.get())

  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ status: "ok", connections: connections.count }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ server: http, maxPayload: 1024 * 1024 })
  wss.on("connection", (ws, req) => handleConnection(ws, req, { connections, claude, config, serverVersion }))

  // Realtime config sync: any store change → broadcast to every client.
  config.on("change", () => connections.broadcast(buildConfigState(config)))

  http.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.error("SRV", `port ${port} is already in use — try a different port with --port <n>`)
    } else {
      log.error("SRV", `server error: ${err.message}`)
    }
    process.exit(1)
  })

  http.listen(port, host, () => {
    log.success("SRV", `listening on ${host}:${port}`)
  })

  const url = `ws://${host === "0.0.0.0" ? "localhost" : host}:${port}`
  return {
    url,
    connections,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close()
        http.close(() => resolve())
      }),
  }
}
