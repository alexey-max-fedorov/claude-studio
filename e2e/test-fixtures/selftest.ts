/*
 * Self test for e2e/lib: validator unit checks over every protocol variant,
 * plus the client (connect / probe / waitFor / violation handling) against
 * the tiny fake server. Run: pnpm --filter e2e selftest
 */
import { randomUUID } from "node:crypto"
import type { ServerMessage } from "../../protocol/src/protocol.js"
import { ShapeError, TestClient, WaitTimeout, probeConnect } from "../lib/client.js"
import { validateServerMessage } from "../lib/validate.js"
import { httpGet, tinyPngDataUrl } from "../lib/util.js"
import { startFakeServer } from "./fake-server.js"

let failures = 0
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -- ${detail}` : ""}`)
  if (!ok) failures++
}

const sid = randomUUID()
const ts = Date.now()
const usage = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const permReq = { kind: "permission_request" as const, requestId: "r1", toolName: "Bash", input: { command: "ls" }, canAlwaysAllow: true }

// One valid sample per variant.
const GOOD: ServerMessage[] = [
  { type: "hello", serverVersion: "3.0.0", protocol: 3, projectDir: "/x" },
  { type: "pong" },
  {
    type: "config_state",
    config: { projectDir: "/x", model: "haiku", effort: "", permissionMode: "default", systemPromptAppend: "", maxBudgetUsd: null, maxTurns: 5 },
    models: [{ value: "", displayName: "Default", description: "" }],
    commands: [{ name: "compact", description: "", argumentHint: "" }],
    permissionModes: ["default", "acceptEdits", "plan", "auto", "bypassPermissions", "dontAsk"],
  },
  { type: "config_error", error: "nope" },
  { type: "session_list", sessions: [{ sessionId: sid, title: "t", lastModified: ts, live: false, running: false, gitBranch: "main" }], offset: 0, hasMore: false },
  {
    type: "session_history",
    sessionId: sid,
    running: false,
    pending: [permReq],
    items: [
      { kind: "user", id: "u", text: "hi", attachments: [{ type: "page_text", label: "Page" }], ts },
      { kind: "assistant", id: "msg_1:0", text: "yo", ts },
      { kind: "thinking", id: "msg_1:1", text: "hmm", ts },
      { kind: "tool_use", id: "toolu_1", name: "Bash", input: {}, ts, parentToolUseId: null },
      { kind: "tool_result", toolUseId: "toolu_1", text: "out", isError: false, ts },
      { kind: "result", ts, isError: false, durationMs: 1, turns: 1, costUsd: 0, usage },
      { kind: "error", text: "e", ts },
      { kind: "system", text: "s", ts },
    ],
  },
  { type: "event", sessionId: sid, event: { kind: "text_delta", id: "msg_1:0", text: "y" } },
  { type: "event", sessionId: sid, event: { kind: "thinking_delta", id: "msg_1:1", text: "h" } },
  { type: "event", sessionId: sid, event: { kind: "status", state: "starting" } },
  { type: "event", sessionId: sid, event: permReq },
  { type: "event", sessionId: sid, event: { kind: "permission_resolved", requestId: "r1", behavior: "deny" } },
  { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "result", ts, isError: true, errorText: "x", durationMs: 1, turns: 0, costUsd: 0, usage } } },
  { type: "error", error: "bad", sessionId: sid },
  { type: "error", error: "bad" },
]

const BAD: [string, unknown][] = [
  ["unknown type", { type: "surprise" }],
  ["non-object", "hello"],
  ["hello missing projectDir", { type: "hello", serverVersion: "1", protocol: 3 }],
  ["event unknown kind", { type: "event", sessionId: sid, event: { kind: "mystery" } }],
  ["event bad sessionId", { type: "event", sessionId: "nope", event: { kind: "status", state: "idle" } }],
  ["status bad state", { type: "event", sessionId: sid, event: { kind: "status", state: "busy" } }],
  ["item unknown ChatItem kind", { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "banner", ts } } }],
  ["tool_use missing parentToolUseId", { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "tool_use", id: "toolu_1", name: "Bash", input: {}, ts } } }],
  ["result usage missing field", { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "result", ts, isError: false, durationMs: 1, turns: 1, costUsd: 0, usage: { input_tokens: 1 } } } }],
  ["config_state bad permissionMode", { ...GOOD[2], config: { ...(GOOD[2] as any).config, permissionMode: "yolo" } }],
  ["session_history pending wrong kind", { ...GOOD[5], pending: [{ ...permReq, kind: "status" }] }],
  ["user item attachments not array", { type: "event", sessionId: sid, event: { kind: "item", item: { kind: "user", id: "u", text: "x", attachments: null, ts } } }],
  ["text_delta text number", { type: "event", sessionId: sid, event: { kind: "text_delta", id: "a", text: 5 } }],
]

async function main(): Promise<void> {
  // --- validator ---
  GOOD.forEach((m, i) => {
    const r = validateServerMessage(m)
    check(`validator accepts ${m.type}${m.type === "event" ? `/${m.event.kind}` : ""} #${i}`, r.errors.length === 0 && r.warnings.length === 0, [...r.errors, ...r.warnings].join("; "))
  })
  for (const [name, m] of BAD) {
    const r = validateServerMessage(m)
    check(`validator rejects: ${name}`, r.errors.length > 0, "no errors reported")
  }
  const extra = validateServerMessage({ type: "pong", extra: 1 })
  check("validator warns (not errors) on extra keys", extra.errors.length === 0 && extra.warnings.length === 1, JSON.stringify(extra))
  check("tiny PNG data URL well formed", /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(tinyPngDataUrl()))

  // --- client against fake server ---
  const srv = await startFakeServer()
  try {
    const health = await httpGet(srv.port, "/health")
    check("httpGet /health 200", health.status === 200 && JSON.parse(health.body).status === "ok", `${health.status}`)
    const evilHttp = await httpGet(srv.port, "/health", { Host: "evil.example" })
    check("httpGet with Host override is rejected by fake", evilHttp.status === 403, `${evilHttp.status}`)

    const evil = await probeConnect(srv.url, { origin: "https://evil.example" })
    check("probe: bad origin classified rejected", !evil.accepted, evil.detail)
    const none = await probeConnect(srv.url, { origin: null })
    check("probe: no origin classified rejected", !none.accepted, none.detail)
    const evilHost = await probeConnect(srv.url, { headers: { Host: "evil.example" } })
    check("probe: spoofed Host classified rejected", !evilHost.accepted, evilHost.detail)
    const good = await probeConnect(srv.url)
    check("probe: extension origin accepted", good.accepted, good.detail)
    if (good.accepted) await good.client.close()

    const c = await TestClient.connect(srv.url, { label: "A" })
    const hello = await c.waitFor((m) => m.type === "hello", 2000)
    check("waitFor hello", hello.type === "hello")
    await c.waitFor((m) => m.type === "config_state", 2000)
    check("config_state collected", c.messages.some((m) => m.type === "config_state"))

    const mark = c.mark()
    c.send({ type: "send", sessionId: sid, text: "Reply with exactly: PONG", attachments: [] })
    await c.waitFor((m) => m.type === "event" && m.event.kind === "status" && m.event.state === "idle", 3000, { from: mark })
    const deltas = c.events(sid, mark).filter((e) => e.event.kind === "text_delta")
    const assistant = c.items(sid, mark).find((i) => i.item.kind === "assistant")
    check("scripted turn: 2 deltas + assistant item", deltas.length === 2 && assistant?.item.kind === "assistant" && assistant.item.text === "PONG")

    // waitFor from an old mark finds already-collected messages synchronously
    const again = await c.waitFor((m) => m.type === "hello", 10)
    check("waitFor scans backlog", again.type === "hello")

    // timeout path
    let timedOut = false
    try {
      await c.waitFor((m) => m.type === "session_list", 150, { label: "never" })
    } catch (e) {
      timedOut = e instanceof WaitTimeout
    }
    check("waitFor times out with WaitTimeout", timedOut)

    // error reply, connection stays open
    const m2 = c.mark()
    c.sendRaw(JSON.stringify({ type: "nope" }))
    await c.waitFor((m) => m.type === "error", 2000, { from: m2 })
    c.send({ type: "ping" })
    await c.waitFor((m) => m.type === "pong", 2000, { from: m2 })
    check("error then pong on same socket", c.open)

    // violation fails pending waiters loudly
    for (const breakWith of ["unknown_kind", "missing_field", "unknown_type"]) {
      const d = await TestClient.connect(srv.url, { label: `D-${breakWith}` })
      await d.waitFor((m) => m.type === "config_state", 2000)
      const pending = d.waitFor((m) => m.type === "session_list", 3000)
      d.sendRaw(JSON.stringify({ type: "get_state", breakWith, sessionId: sid }))
      let shape = false
      try {
        await pending
      } catch (e) {
        shape = e instanceof ShapeError
      }
      check(`violation (${breakWith}) rejects pending waiter with ShapeError`, shape && d.violations.length === 1, d.violations.join(" / "))
      let later = false
      try {
        await d.waitFor((m) => m.type === "hello", 100)
      } catch (e) {
        later = e instanceof ShapeError
      }
      check(`later waitFor (${breakWith}) also fails loudly`, later)
      await d.close()
    }

    // close rejects pending waiters
    const pendingClose = c.waitFor((m) => m.type === "session_list", 3000)
    await c.close()
    let closedErr = false
    try {
      await pendingClose
    } catch {
      closedErr = true
    }
    check("close rejects pending waiters", closedErr)
  } finally {
    await srv.close()
  }

  console.log(failures ? `\nselftest: ${failures} FAILED` : "\nselftest: all passed")
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error("selftest crashed:", e)
  process.exit(1)
})
