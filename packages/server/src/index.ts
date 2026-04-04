import express from "express"
import { createServer } from "node:http"
import { WebSocketServer } from "ws"
import { config } from "./config.js"
import { ConnectionManager } from "./connection-manager.js"
import { ClaudeSessionManager } from "./claude-session.js"
import { handleConnection } from "./ws-handler.js"
import { log } from "./logger.js"
import { logClaudeEnvironment } from "./env-check.js"

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
const connections = new ConnectionManager()
const claude = new ClaudeSessionManager()

app.get("/health", (_req, res) => {
  res.json({ status: "ok", connections: connections.count })
})

wss.on("connection", (ws) => {
  handleConnection(ws, connections, claude)
})

server.listen(config.port, () => {
  log.info("SRV", `Listening on port ${config.port}`)
  log.dim("SRV", `Health: http://localhost:${config.port}/health`)
  log.dim("SRV", `WebSocket: ws://localhost:${config.port}`)
  log.dim("SRV", `Project: ${config.projectDir}`)
  logClaudeEnvironment()
})
