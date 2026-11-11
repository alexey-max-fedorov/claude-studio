import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { request } from "node:http"
import WebSocket from "ws"
import { ConfigStore } from "../config-store.js"
import { setQuiet } from "../logger.js"
import { DEFAULT_EXTENSION_ORIGIN } from "../security.js"
import { startServer, type StartedServer } from "../server.js"
import { makeFakeSdk, textTurn, until } from "./fake-sdk.js"

setQuiet(true)

const SID = "11111111-2222-4333-8444-555555555555"
let dir: string
let server: StartedServer
let sdk: ReturnType<typeof makeFakeSdk>["sdk"]

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cs-srv-"))
  const fake = makeFakeSdk(textTurn("PONG"))
  sdk = fake.sdk
  server = await startServer({
    config: new ConfigStore(dir, join(dir, "config.json")),
    sdk,
    host: "127.0.0.1",
    port: 0,
    version: "9.9.9",
    allowedOrigins: [DEFAULT_EXTENSION_ORIGIN],
    allowNoOrigin: false,
  })
})

afterEach(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

function connect(headers: Record<string, string>): Promise<{ ws: WebSocket; msgs: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers })
    const msgs: any[] = []
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString())))
    ws.on("open", () => resolve({ ws, msgs }))
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
    ws.on("error", reject)
  })
}

function get(path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port: server.port, path, headers: { host } }, (res) => {
      let body = ""
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
    })
    r.on("error", reject)
    r.end()
  })
}

describe("server", () => {
  it("#7 a port already in use rejects startServer instead of crashing", async () => {
    await expect(
      startServer({
        config: new ConfigStore(dir, join(dir, "config2.json")),
        sdk,
        host: "127.0.0.1",
        port: server.port,
        version: "9.9.9",
        allowedOrigins: [DEFAULT_EXTENSION_ORIGIN],
        allowNoOrigin: false,
      }),
    ).rejects.toThrow(/already in use/)
  })

  it("serves /health only to loopback Host headers", async () => {
    const ok = await get("/health", `127.0.0.1:${server.port}`)
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.body)).toEqual({ status: "ok", version: "9.9.9", projectDir: dir, live: 0 })
    expect((await get("/health", "evil.example")).status).toBe(403)
  })

  it("rejects foreign or missing Origins and rebinding Hosts", async () => {
    await expect(connect({ Origin: "https://evil.example" })).rejects.toThrow(/403/)
    await expect(connect({})).rejects.toThrow(/403/)
    await expect(connect({ Origin: DEFAULT_EXTENSION_ORIGIN, Host: "evil.example" })).rejects.toThrow(/403/)
  })

  it("greets the extension, validates input, and routes a conversation", async () => {
    const { ws, msgs } = await connect({ Origin: DEFAULT_EXTENSION_ORIGIN })
    await until(() => msgs.length >= 2)
    expect(msgs[0]).toEqual({ type: "hello", serverVersion: "9.9.9", protocol: 3, projectDir: dir })
    expect(msgs[1].type).toBe("config_state")
    expect(msgs[1].permissionModes).toContain("bypassPermissions")

    ws.send("not json")
    await until(() => msgs.some((m) => m.type === "error"))

    ws.send(JSON.stringify({ type: "set_config", patch: { model: "haiku" } }))
    await until(() => msgs.some((m) => m.type === "config_state" && m.config.model === "haiku"))
    ws.send(JSON.stringify({ type: "set_config", patch: { model: 42 } }))
    await until(() => msgs.some((m) => m.type === "config_error"))

    // a second client that never subscribed must not get session events
    const other = await connect({ Origin: DEFAULT_EXTENSION_ORIGIN })

    ws.send(JSON.stringify({ type: "send", sessionId: SID, text: "hi", attachments: [] }))
    await until(() => msgs.some((m) => m.type === "event" && m.event.kind === "status" && m.event.state === "idle"))
    const evs = msgs.filter((m) => m.type === "event")
    expect(evs.every((m) => m.sessionId === SID)).toBe(true)
    expect(evs.some((m) => m.event.kind === "item" && m.event.item.kind === "assistant" && m.event.item.text === "PONG")).toBe(true)
    expect(other.msgs.some((m) => m.type === "event")).toBe(false)

    other.ws.send(JSON.stringify({ type: "open_session", sessionId: SID }))
    await until(() => other.msgs.some((m) => m.type === "session_history"))
    // the turn finished, so history comes from the transcript only (empty in this fake)
    const hist = other.msgs.find((m) => m.type === "session_history")
    expect(hist).toEqual({ type: "session_history", sessionId: SID, items: [], running: false, pending: [] })

    ws.send(JSON.stringify({ type: "rename_session", sessionId: SID, title: "New name" }))
    await until(() => msgs.some((m) => m.type === "session_list"))
    expect(sdk.renameSession).toHaveBeenCalledWith(SID, "New name", { dir })

    // disconnecting does not kill the session
    ws.close()
    other.ws.close()
    await new Promise((r) => setTimeout(r, 20))
    expect(server.manager.isLive(SID)).toBe(true)
  })
})
