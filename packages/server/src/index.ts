import express from "express"
import { createServer } from "node:http"
import { WebSocketServer } from "ws"
import { config } from "./config.js"
import { ConnectionManager } from "./connection-manager.js"
import { handleConnection } from "./ws-handler.js"

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
const connections = new ConnectionManager()

app.get("/health", (_req, res) => {
  res.json({ status: "ok", connections: connections.count })
})

wss.on("connection", (ws) => {
  handleConnection(ws, connections)
})

server.listen(config.port, () => {
  console.log(`Canvas Code bridge server listening on port ${config.port}`)
  console.log(`Health: http://localhost:${config.port}/health`)
  console.log(`WebSocket: ws://localhost:${config.port}`)
})
