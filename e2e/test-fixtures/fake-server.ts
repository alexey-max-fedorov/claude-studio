/*
 * Minimal fake daemon for the client/validator self test. NOT a mock agent:
 * it only checks Host/Origin, says hello, answers ping, plays one scripted
 * turn on `send`, and can emit a deliberately broken frame on request.
 */
import { createServer, type Server } from "node:http"
import { WebSocketServer, type WebSocket } from "ws"
import type { ServerMessage } from "../../protocol/src/protocol.js"

export const FAKE_ORIGIN = "chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol"

export interface FakeServer {
  port: number
  url: string
  close(): Promise<void>
}

const CONFIG_STATE: ServerMessage = {
  type: "config_state",
  config: { projectDir: "/tmp/fake", model: "", effort: "", permissionMode: "acceptEdits", systemPromptAppend: "", maxBudgetUsd: null, maxTurns: null },
  models: [{ value: "haiku", displayName: "Haiku", description: "Fastest" }],
  commands: [{ name: "compact", description: "Compact", argumentHint: "" }],
  permissionModes: ["default", "acceptEdits"],
}

function okHost(h: string | undefined): boolean {
  if (!h) return false
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(`http://${h}`).hostname)
  } catch {
    return false
  }
}

export function startFakeServer(): Promise<FakeServer> {
  const http: Server = createServer((req, res) => {
    if (!okHost(req.headers.host)) {
      res.writeHead(403)
      res.end("bad host")
      return
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ status: "ok" }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  const wss = new WebSocketServer({
    server: http,
    verifyClient: (info, cb) => {
      if (!okHost(info.req.headers.host)) return cb(false, 403, "bad host")
      if (info.origin !== FAKE_ORIGIN) return cb(false, 403, "bad origin")
      cb(true)
    },
  })
  const send = (ws: WebSocket, m: unknown) => ws.send(JSON.stringify(m))
  wss.on("connection", (ws) => {
    send(ws, { type: "hello", serverVersion: "0.0.0-fake", protocol: 3, projectDir: "/tmp/fake" })
    send(ws, CONFIG_STATE)
    ws.on("message", (data) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return send(ws, { type: "error", error: "Invalid message: not JSON" })
      }
      const sid: string = msg.sessionId
      switch (msg.type) {
        case "ping":
          return send(ws, { type: "pong" })
        case "send": {
          const id = "msg_fake:0"
          const ts = Date.now()
          const seq: ServerMessage[] = [
            { type: "event", sessionId: sid, event: { kind: "status", state: "running" } },
            { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "user", id: "u1", text: msg.text, attachments: [], ts } } },
            { type: "event", sessionId: sid, event: { kind: "text_delta", id, text: "PO" } },
            { type: "event", sessionId: sid, event: { kind: "text_delta", id, text: "NG" } },
            { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "assistant", id, text: "PONG", ts } } },
            {
              type: "event",
              sessionId: sid,
              event: {
                kind: "item",
                item: {
                  kind: "result",
                  ts,
                  isError: false,
                  durationMs: 12,
                  turns: 1,
                  costUsd: 0.0001,
                  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                },
              },
            },
            { type: "event", sessionId: sid, event: { kind: "status", state: "idle" } },
          ]
          seq.forEach((m, i) => setTimeout(() => send(ws, m), 10 * (i + 1)))
          return
        }
        // Test hooks: emit broken frames.
        case "get_state":
          if (msg.breakWith === "unknown_kind") return send(ws, { type: "event", sessionId: sid, event: { kind: "mystery" } })
          if (msg.breakWith === "missing_field") return send(ws, { type: "hello", serverVersion: "x", protocol: 3 })
          if (msg.breakWith === "unknown_type") return send(ws, { type: "surprise" })
          return send(ws, CONFIG_STATE)
        default:
          return send(ws, { type: "error", error: `Invalid message: unknown type "${msg.type}"` })
      }
    })
  })
  return new Promise((resolve) => {
    http.listen(0, "127.0.0.1", () => {
      const addr = http.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      resolve({
        port,
        url: `ws://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((r) => {
            for (const c of wss.clients) c.terminate()
            wss.close()
            http.close(() => r())
          }),
      })
    })
  })
}
