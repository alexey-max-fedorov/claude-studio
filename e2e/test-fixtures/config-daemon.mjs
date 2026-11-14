import { createServer } from "node:http"
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { WebSocketServer } from "ws"

const args = process.argv.slice(2)
const projectDir = args[args.indexOf("--project") + 1]
const port = Number(args[args.indexOf("--port") + 1])
const configPath = process.env.CLAUDE_STUDIO_CONFIG || join(homedir(), ".claude-studio/config.json")
const config = {
  projectDir, model: "original-model", effort: "high", permissionMode: "acceptEdits",
  systemPromptAppend: "fixture", maxBudgetUsd: null, maxTurns: null,
  ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}),
}
function trace() {
  if (process.env.FIXTURE_CONFIG_TRACE) appendFileSync(process.env.FIXTURE_CONFIG_TRACE, `${JSON.stringify({ configPath, config })}\n`)
}
trace()
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" })
  res.end('{"status":"ok"}')
})
const sockets = new WebSocketServer({ server })
const state = () => JSON.stringify({
  type: "config_state", config,
  models: [{ value: "haiku", displayName: "Haiku", description: "fixture" }], commands: [],
  permissionModes: ["default", "acceptEdits"],
})
let updates = 0
sockets.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", serverVersion: "3.0.0-fixture", protocol: 3, projectDir }))
  ws.send(state())
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.type !== "set_config") throw new Error(`Unexpected fixture message: ${msg.type}`)
    Object.assign(config, msg.patch)
    writeFileSync(configPath, JSON.stringify(config))
    trace()
    updates++
    if (updates === 1 && process.env.FIXTURE_FAIL_SETUP === "1") return ws.close()
    for (const client of sockets.clients) if (client.readyState === 1) client.send(state())
  })
})
server.listen(port, "127.0.0.1")
