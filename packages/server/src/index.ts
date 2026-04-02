import express from "express"
import { createServer } from "node:http"
import { WebSocketServer } from "ws"
import { config } from "./config.js"

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

let connectionCount = 0

app.get("/health", (_req, res) => {
  res.json({ status: "ok", connections: connectionCount })
})

wss.on("connection", (ws) => {
  connectionCount++
  console.log(`Client connected (${connectionCount} total)`)

  ws.on("close", () => {
    connectionCount--
    console.log(`Client disconnected (${connectionCount} total)`)
  })

  ws.on("message", (data) => {
    const raw = data.toString()
    console.log("Received:", raw)
    try {
      const msg = JSON.parse(raw)
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }))
      }
    } catch {
      ws.send(JSON.stringify({ type: "ai_error", error: "Invalid message" }))
    }
  })
})

server.listen(config.port, () => {
  console.log(`Canvas Code bridge server listening on port ${config.port}`)
  console.log(`Health: http://localhost:${config.port}/health`)
  console.log(`WebSocket: ws://localhost:${config.port}`)
})
