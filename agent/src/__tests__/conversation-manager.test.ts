import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG, type LiveEvent, type StudioConfig } from "@claude-studio/protocol"
import {
  BROWSER_NOTE,
  buildQueryOptions,
  ConversationManager,
  FALLBACK_MODELS,
  LIVE_BUFFER_MAX_BYTES,
  toSessionSummary,
} from "../conversation-manager.js"
import { setQuiet } from "../logger.js"
import { makeFakeSdk, textTurn, tick, until, type TurnScript } from "./fake-sdk.js"

setQuiet(true)

const SID = "11111111-2222-4333-8444-555555555555"

function setup(turn: TurnScript, opts: { existing?: string[]; config?: Partial<StudioConfig>; idleMs?: number } = {}) {
  let config: StudioConfig = { ...DEFAULT_CONFIG, projectDir: "/proj", ...opts.config }
  const { sdk, queries } = makeFakeSdk(turn, new Set(opts.existing ?? []))
  const events: LiveEvent[] = []
  const capsChanged = vi.fn()
  const mgr = new ConversationManager({
    getConfig: () => config,
    sdk,
    version: "test",
    idleMs: opts.idleMs,
    sink: { event: (_sid, e) => events.push(e), capabilitiesChanged: capsChanged },
  })
  const setConfig = (patch: Partial<StudioConfig>) => {
    const prev = config
    config = { ...config, ...patch }
    mgr.onConfigChange(config, prev)
  }
  const kinds = () => events.map((e) => (e.kind === "item" ? `item:${e.item.kind}` : e.kind === "status" ? `status:${e.state}` : e.kind))
  return { mgr, sdk, queries, events, kinds, capsChanged, setConfig }
}

describe("buildQueryOptions", () => {
  it("builds terminal-equivalent options and omits empty settings", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, projectDir: "/p" }, { sessionId: SID })
    expect(o).toMatchObject({
      cwd: "/p",
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      permissionMode: "acceptEdits",
      allowDangerouslySkipPermissions: true,
      sessionId: SID,
      systemPrompt: { type: "preset", preset: "claude_code", append: BROWSER_NOTE },
    })
    for (const k of ["model", "effort", "maxBudgetUsd", "maxTurns", "resume", "allowedTools"]) expect(k in o).toBe(false)
    expect(o.env?.PATH).toBe(process.env.PATH)
    expect(BROWSER_NOTE).not.toMatch(/\u2014/)
  })

  it("passes set values and resume", () => {
    const o = buildQueryOptions(
      { ...DEFAULT_CONFIG, projectDir: "/p", model: "opus", effort: "high", maxBudgetUsd: 2, maxTurns: 9, systemPromptAppend: "Be brief." },
      { resume: SID },
    )
    expect(o).toMatchObject({ model: "opus", effort: "high", maxBudgetUsd: 2, maxTurns: 9, resume: SID })
    expect((o.systemPrompt as any).append).toBe(`${BROWSER_NOTE}\n\nBe brief.`)
    expect("sessionId" in o).toBe(false)
  })
})

describe("ConversationManager", () => {
  it("starts a new session with sessionId, streams, and goes idle", async () => {
    const t = setup(textTurn("PONG"))
    t.mgr.send(SID, "hi", [])
    await until(() => t.kinds().includes("status:idle"))
    expect(t.kinds()).toEqual(["status:starting", "item:user", "status:running", "text_delta", "item:assistant", "item:result", "status:idle"])
    expect(t.queries[0].options.sessionId).toBe(SID)
    expect(t.queries[0].options.resume).toBeUndefined()
    const user = t.events[1] as any
    expect(user.item).toMatchObject({ kind: "user", text: "hi", attachments: [] })
    // the SDK message carries the same uuid as the user item, so history ids match
    expect(t.queries[0].received[0].uuid).toBe(user.item.id)
    expect(t.queries[0].received[0].message.content).toBe("hi")
    expect(t.mgr.isLive(SID)).toBe(true)
    expect(t.mgr.isRunning(SID)).toBe(false)
  })

  it("open_session mid-turn on a brand-new session returns the user item and partial text", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const t = setup(async function* () {
      yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "msg_9" } } }
      yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } }
      yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hal" } } }
      await gate
      yield { type: "assistant", parent_tool_use_id: null, message: { id: "msg_9", content: [{ type: "text", text: "Half" }] } }
      yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, usage: {} }
    })
    t.mgr.send(SID, "hello", [])
    await until(() => t.events.some((e) => e.kind === "text_delta"))
    const h = await t.mgr.history(SID)
    expect(h.running).toBe(true)
    expect(h.items).toEqual([
      { kind: "user", id: expect.any(String), text: "hello", attachments: [], ts: expect.any(Number) },
      { kind: "assistant", id: "msg_9:0", text: "Hal", ts: expect.any(Number) },
    ])
    release()
    await until(() => t.kinds().includes("status:idle"))
    const h2 = await t.mgr.history(SID)
    expect(h2).toMatchObject({ sessionId: SID, running: false, pending: [], sequence: expect.any(Number) })
    expect(h2.items).toContainEqual(expect.objectContaining({ kind: "assistant", text: "Half" }))
  })

  it("#8 caps the live buffer by bytes while a turn is running", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const t = setup(async function* () {
      await gate
      yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, usage: {}, queued_turn_count: 0 }
    })
    const big = "x".repeat(190_000)
    for (let i = 0; i < 40; i++) t.mgr.send(SID, `${i} ${big}`, [])
    const h = await t.mgr.history(SID)
    const bytes = JSON.stringify(h.items).length
    expect(bytes).toBeLessThanOrEqual(LIVE_BUFFER_MAX_BYTES)
    expect(h.items.length).toBeGreaterThan(10)
    expect((h.items.at(-1) as any).text.startsWith("39 ")).toBe(true)
    release()
  })

  it("#3 per-turn cost survives a process restart; unknown prior totals report 0", async () => {
    let total = 0
    const existing = new Set<string>()
    const turn: TurnScript = async function* () {
      total += 0.25
      yield { type: "result", subtype: "success", is_error: false, total_cost_usd: total, usage: {}, queued_turn_count: 0 }
    }
    const { sdk } = makeFakeSdk(turn, existing)
    const costs: number[] = []
    const mgr = new ConversationManager({
      getConfig: () => ({ ...DEFAULT_CONFIG, projectDir: "/proj" }),
      sdk,
      version: "t",
      sink: { event: (_s, e) => e.kind === "item" && e.item.kind === "result" && costs.push(e.item.costUsd), capabilitiesChanged: () => {} },
    })
    mgr.send(SID, "one", [])
    await until(() => costs.length === 1)
    mgr.close(SID)
    existing.add(SID)
    mgr.send(SID, "two", []) // resumed in this daemon: total continues at 0.5
    await until(() => costs.length === 2)
    expect(costs).toEqual([0.25, 0.25])
    // a session resumed from the terminal (no known total) shows 0 first
    const OTHER = "99999999-2222-4333-8444-555555555555"
    existing.add(OTHER)
    total = 7
    mgr.send(OTHER, "hi", [])
    await until(() => costs.length === 3)
    expect(costs[2]).toBe(0)
    mgr.shutdown()
  })

  it("#4 a send whose message cannot be built leaves no session behind", () => {
    const t = setup(textTurn("x"))
    expect(() => t.mgr.send(SID, "hi", [{ type: "element", url: "u", title: "t", element: null as any }])).toThrow()
    expect(t.mgr.isLive(SID)).toBe(false)
    expect(t.queries).toHaveLength(0)
    expect(t.events).toEqual([])
  })

  it("#5 an interrupt while the process is still launching is not dropped", async () => {
    const t = setup(textTurn("x"))
    let resolveInfo!: (v: undefined) => void
    ;(t.sdk.getSessionInfo as any).mockImplementation(() => new Promise((r) => (resolveInfo = r)))
    t.mgr.send(SID, "hi", [])
    await t.mgr.interrupt(SID) // before query() exists
    resolveInfo(undefined)
    await until(() => !t.mgr.isLive(SID))
    expect(t.queries).toHaveLength(0)
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ kind: "system" }) }))
    expect(t.kinds().at(-1)).toBe("status:idle")
  })

  it("probes models and commands at boot without a user turn", async () => {
    const t = setup(textTurn("x"))
    expect(t.mgr.commands()).toEqual([])
    expect(await t.mgr.probeCapabilities()).toBe(true)
    expect(t.queries[0].options.persistSession).toBe(false)
    expect(t.queries[0].close).toHaveBeenCalled()
    expect(t.queries[0].received).toEqual([])
    expect(t.mgr.commands()).toEqual([{ name: "review", description: "Review", argumentHint: "" }])
    expect(t.mgr.models().map((m) => m.value)).toEqual(["", "sonnet"])
    expect(t.capsChanged).toHaveBeenCalledTimes(1)
    // a later session does not ask again
    t.mgr.send(SID, "hi", [])
    await until(() => t.kinds().includes("status:idle"))
    expect(t.capsChanged).toHaveBeenCalledTimes(1)
  })

  it("resumes a session that exists on disk", async () => {
    const t = setup(textTurn("x"), { existing: [SID] })
    t.mgr.send(SID, "hi", [])
    await until(() => t.queries.length === 1)
    expect(t.queries[0].options.resume).toBe(SID)
    expect(t.queries[0].options.sessionId).toBeUndefined()
  })

  it("queues a second send into the same process", async () => {
    const t = setup(textTurn("ok"))
    t.mgr.send(SID, "one", [])
    t.mgr.send(SID, "two", [{ type: "page", url: "https://a", title: "A" }])
    await until(() => t.queries[0]?.received.length === 2)
    expect(t.queries).toHaveLength(1)
    expect(Array.isArray(t.queries[0].received[1].message.content)).toBe(true)
  })

  it("caches models/commands after init and prepends Default", async () => {
    const t = setup(textTurn("ok"))
    expect(t.mgr.models()).toEqual(FALLBACK_MODELS)
    t.mgr.send(SID, "hi", [])
    await until(() => t.capsChanged.mock.calls.length === 1)
    expect(t.mgr.models()).toEqual([
      { value: "", displayName: "Default", description: "Claude Code default" },
      { value: "opus", displayName: "Opus", description: "o" },
    ])
    expect(t.mgr.commands()).toEqual([{ name: "compact", description: "Compact", argumentHint: "" }])
  })

  describe("permissions", () => {
    const suggestion = { type: "addRules", rules: [{ toolName: "Bash", ruleContent: "ls" }], behavior: "allow", destination: "session" }
    const permTurn = (results: any[]): TurnScript =>
      async function* (_m, options) {
        const ac = new AbortController()
        const r = await options.canUseTool!("Bash", { command: "ls" }, {
          signal: ac.signal,
          suggestions: [suggestion as any],
          title: "Run ls",
          toolUseID: "toolu_1",
          requestId: "r",
        })
        results.push(r)
        yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, usage: {} }
      }

    it("broadcasts the request and applies an always-allow answer", async () => {
      const results: any[] = []
      const t = setup(permTurn(results))
      t.mgr.send(SID, "go", [])
      await until(() => t.events.some((e) => e.kind === "permission_request"))
      const req = t.events.find((e) => e.kind === "permission_request") as any
      expect(req).toMatchObject({ toolName: "Bash", input: { command: "ls" }, title: "Run ls", canAlwaysAllow: true })
      expect((await t.mgr.history(SID)).pending).toEqual([req])
      expect(t.mgr.respondPermission({ type: "permission_response", sessionId: SID, requestId: req.requestId, behavior: "allow", always: true })).toBe(true)
      await until(() => results.length === 1)
      expect(results[0]).toMatchObject({ behavior: "allow", updatedInput: { command: "ls" }, updatedPermissions: [suggestion] })
      expect(t.events).toContainEqual({ kind: "permission_resolved", requestId: req.requestId, behavior: "allow" })
      // second answer is rejected
      expect(t.mgr.respondPermission({ type: "permission_response", sessionId: SID, requestId: req.requestId, behavior: "deny" })).toBe(false)
    })

    it("passes updatedInput through (AskUserQuestion answers) and denies with a default message", async () => {
      const results: any[] = []
      const t = setup(permTurn(results))
      t.mgr.send(SID, "go", [])
      await until(() => t.events.some((e) => e.kind === "permission_request"))
      const req = t.events.find((e) => e.kind === "permission_request") as any
      t.mgr.respondPermission({ type: "permission_response", sessionId: SID, requestId: req.requestId, behavior: "allow", updatedInput: { answers: { "Q?": "A" } } })
      await until(() => results.length === 1)
      expect(results[0]).toMatchObject({ behavior: "allow", updatedInput: { answers: { "Q?": "A" } } })
      expect(results[0].updatedPermissions).toBeUndefined()

      t.mgr.send(SID, "again", [])
      await until(() => t.events.filter((e) => e.kind === "permission_request").length === 2)
      const req2 = t.events.filter((e) => e.kind === "permission_request")[1] as any
      t.mgr.respondPermission({ type: "permission_response", sessionId: SID, requestId: req2.requestId, behavior: "deny" })
      await until(() => results.length === 2)
      expect(results[1]).toMatchObject({ behavior: "deny", message: "User denied this in the browser panel." })
    })

    it("denies pending requests when the session is closed", async () => {
      const results: any[] = []
      const t = setup(permTurn(results))
      t.mgr.send(SID, "go", [])
      await until(() => t.events.some((e) => e.kind === "permission_request"))
      expect(t.mgr.close(SID)).toBe(true)
      await until(() => results.length === 1)
      expect(results[0].behavior).toBe("deny")
      expect(t.queries[0].close).toHaveBeenCalled()
      expect(t.mgr.isLive(SID)).toBe(false)
      expect(t.kinds().at(-1)).toBe("status:idle")
    })

    it("interrupt calls query.interrupt and denies anything pending", async () => {
      const results: any[] = []
      const t = setup(permTurn(results))
      t.mgr.send(SID, "go", [])
      await until(() => t.events.some((e) => e.kind === "permission_request"))
      await t.mgr.interrupt(SID)
      expect(t.queries[0].interrupt).toHaveBeenCalled()
      await until(() => results.length === 1)
      expect(results[0].behavior).toBe("deny")
    })
  })

  it("pushes model / permission mode live and retires idle sessions on restart-only changes", async () => {
    const t = setup(textTurn("ok"))
    t.mgr.send(SID, "hi", [])
    await until(() => t.kinds().includes("status:idle"))
    t.setConfig({ model: "opus", permissionMode: "bypassPermissions" })
    expect(t.queries[0].setModel).toHaveBeenCalledWith("opus")
    expect(t.queries[0].setPermissionMode).toHaveBeenCalledWith("bypassPermissions")
    t.setConfig({ model: "" })
    expect(t.queries[0].setModel).toHaveBeenLastCalledWith(undefined)
    expect(t.mgr.isLive(SID)).toBe(true)
    t.setConfig({ effort: "high" })
    expect(t.mgr.isLive(SID)).toBe(false)
    // next send starts a fresh process with the new options
    t.mgr.send(SID, "again", [])
    await until(() => t.queries.length === 2)
    expect(t.queries[1].options.effort).toBe("high")
  })

  it("closes a running stale session once its turn finishes", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const t = setup(async function* () {
      await gate
      yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, usage: {} }
    })
    t.mgr.send(SID, "hi", [])
    await until(() => t.queries.length === 1)
    t.setConfig({ systemPromptAppend: "new" })
    expect(t.mgr.isLive(SID)).toBe(true)
    release()
    await until(() => !t.mgr.isLive(SID))
  })

  it("closes idle sessions after the idle timeout", async () => {
    const t = setup(textTurn("ok"), { idleMs: 30 })
    t.mgr.send(SID, "hi", [])
    await until(() => t.kinds().includes("status:idle"))
    await until(() => !t.mgr.isLive(SID), 1000)
  })

  it("reports a crashed process as an error item and cleans up", async () => {
    const t = setup(async function* () {
      throw new Error("boom")
    })
    t.mgr.send(SID, "hi", [])
    await until(() => !t.mgr.isLive(SID))
    expect(t.events).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ kind: "error", text: expect.stringContaining("boom") }) }))
    expect(t.kinds().at(-1)).toBe("status:idle")
  })

  it("lists sessions with titles, pagination and live flags", async () => {
    const t = setup(textTurn("ok"))
    ;(t.sdk.listSessions as any).mockResolvedValue([
      { sessionId: SID, summary: "Summary", customTitle: "", firstPrompt: "fp", lastModified: 5, gitBranch: "main" },
      { sessionId: "b", summary: "", lastModified: 4 },
      { sessionId: "c", summary: "x", lastModified: 3 },
    ])
    t.mgr.send(SID, "hi", [])
    await until(() => t.kinds().includes("status:idle"))
    const r = await t.mgr.listSessions(2, 0)
    expect(t.sdk.listSessions).toHaveBeenCalledWith({ dir: "/proj", limit: 3, offset: 0 })
    expect(r.hasMore).toBe(true)
    expect(r.sessions).toEqual([
      { sessionId: SID, title: "Summary", lastModified: 5, gitBranch: "main", live: true, running: false },
      { sessionId: "b", title: "Untitled", lastModified: 4, live: false, running: false },
    ])
  })

  it("toSessionSummary prefers customTitle and truncates to 120 chars", () => {
    expect(toSessionSummary({ sessionId: "a", summary: "s", customTitle: "Custom", lastModified: 1 }, false, false).title).toBe("Custom")
    expect(toSessionSummary({ sessionId: "a", summary: "y".repeat(300), lastModified: 1 }, false, false).title).toHaveLength(120)
  })

  it("shutdown closes everything", async () => {
    const t = setup(textTurn("ok"))
    t.mgr.send(SID, "hi", [])
    await until(() => t.queries.length === 1)
    await tick(10)
    t.mgr.shutdown()
    expect(t.mgr.liveCount).toBe(0)
  })
})
