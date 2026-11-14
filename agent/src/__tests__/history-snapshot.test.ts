import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG, type ChatItem, type LiveEvent } from "@claude-studio/protocol"
import { initialTranscript, transcriptReducer } from "../../../extension/src/lib/transcript.js"
import { validateServerMessage } from "../../../e2e/lib/validate.js"
import { ConversationManager, LIVE_BUFFER_MAX, LIVE_BUFFER_MAX_BYTES } from "../conversation-manager.js"
import { setQuiet } from "../logger.js"
import { readLocalCommandOutputs } from "../transcript-file.js"
import { makeFakeSdk, until, type TurnScript } from "./fake-sdk.js"

vi.mock("../transcript-file.js", () => ({ readLocalCommandOutputs: vi.fn(async () => new Map()) }))

setQuiet(true)

const SID = "11111111-2222-4333-8444-555555555555"
const managers: ConversationManager[] = []
const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
const user = (id: string, text: string) => ({ type: "user", uuid: id, message: { content: text }, timestamp: 1 })
const assistant = (id: string, text: string) => ({ type: "assistant", message: { id, content: [{ type: "text", text }] }, timestamp: 2 })
const result = (total: number, queued = 0) => ({
  type: "result", subtype: "success", total_cost_usd: total, queued_turn_count: queued,
  duration_ms: 12, num_turns: 1, usage: { input_tokens: 5, output_tokens: 2 },
})

function setup(turn: TurnScript) {
  const { sdk, queries } = makeFakeSdk(turn)
  const events: { sessionId: string; event: LiveEvent; sequence: number }[] = []
  let state = initialTranscript(SID)
  const manager = new ConversationManager({
    sdk, version: "test", getConfig: () => ({ ...DEFAULT_CONFIG, projectDir: "/tmp/claude-studio-history-fixture" }),
    sink: {
      event: (sessionId, event, sequence) => {
        events.push({ sessionId, event, sequence })
        state = transcriptReducer(state, { type: "event", sessionId, event, sequence })
      },
      capabilitiesChanged: () => {},
    },
  })
  managers.push(manager)
  return {
    manager, sdk, queries, events,
    get state() { return state },
    begin() { state = transcriptReducer(state, { type: "begin_history" }) },
    apply(history: Awaited<ReturnType<ConversationManager["history"]>>) {
      const msg = { type: "session_history" as const, ...history }
      expect(validateServerMessage(msg)).toEqual({ errors: [], warnings: [] })
      state = transcriptReducer(state, { type: "history", msg })
    },
  }
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.shutdown()
  vi.mocked(readLocalCommandOutputs).mockResolvedValue(new Map())
})

describe("manager history snapshots applied to the panel", () => {
  it("keeps an echoed queued send before the last disk anchor when the first turn completes", async () => {
    const finishA = gate()
    const finishB = gate()
    const disk = gate()
    let turn = 0
    const t = setup(async function* () {
      if (turn++ === 0) {
        await finishA.promise
        yield assistant("a", "answer A")
        yield result(0.25, 1)
      } else {
        await finishB.promise
        yield assistant("b", "answer B")
        yield result(0.5)
      }
    })
    t.manager.send(SID, "A", [])
    t.manager.send(SID, "B", [])
    await until(() => t.queries[0]?.received.length === 1)
    const [a, b] = t.events.flatMap(({ event }) => event.kind === "item" && event.item.kind === "user" ? [event.item] : [])
    const diskA = [user(a.id, "A"), assistant("a", "answer A")]
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => { await disk.promise; return diskA as any })
    t.begin()
    const pending = t.manager.history(SID)
    finishA.release()
    await until(() => t.queries[0]?.received.length === 2)
    disk.release()
    const snapshot = await pending
    t.apply(snapshot)
    expect(snapshot.running).toBe(true)
    expect(t.state.rows.map((row) => row.kind)).toEqual(["user", "user", "assistant", "result"])
    expect(t.state.rows.filter((row) => row.kind === "user")).toEqual([
      expect.objectContaining({ id: a.id, text: "A" }), expect.objectContaining({ id: b.id, text: "B" }),
    ])
    expect(t.state.rows.at(-1)).toMatchObject({ kind: "result", costUsd: 0.25 })
    t.apply(await t.manager.history(SID))
    expect(t.state.rows).toHaveLength(4)
    finishB.release()
    await until(() => !t.manager.isRunning(SID))
    vi.mocked(t.sdk.getSessionMessages).mockResolvedValue([...diskA, user(b.id, "B"), assistant("b", "answer B")] as any)
    t.begin()
    t.apply(await t.manager.history(SID))
    expect(t.state.rows.map((row) => row.kind)).toEqual(["user", "assistant", "result", "user", "assistant", "result"])
    expect(t.state.rows.filter((row) => row.kind === "result").map((row) => row.costUsd)).toEqual([0.25, 0.25])
  })

  it("keeps budget failure details, usage, and cost when an older nonempty disk read finishes after idle", async () => {
    const finish = gate()
    const disk = gate()
    const t = setup(async function* () {
      await finish.promise
      yield { ...result(0.125), subtype: "error_max_budget_usd", errors: [] }
    })
    t.manager.send(SID, "budgeted request", [])
    await until(() => t.queries[0]?.received.length === 1)
    const sent = t.queries[0].received[0]
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => { await disk.promise; return [user(sent.uuid!, "budgeted request")] as any })
    t.begin()
    const pending = t.manager.history(SID)
    finish.release()
    await until(() => !t.manager.isRunning(SID))
    expect(t.state.rows.at(-1)).toMatchObject({ kind: "result", isError: true })
    disk.release()
    const snapshot = await pending
    t.apply(snapshot)
    expect(snapshot.sequence).toBe(t.events.at(-1)?.sequence)
    expect(t.state.status).toBe("idle")
    expect(t.state.pendingEvents).toEqual([])
    expect(t.state.rows).toHaveLength(2)
    expect(t.state.rows[1]).toMatchObject({
      kind: "result", id: expect.any(String), isError: true, errorText: expect.stringMatching(/budget/i),
      costUsd: 0.125, durationMs: 12, turns: 1, usage: { input_tokens: 5, output_tokens: 2 },
    })
    const expected = t.state.rows
    t.manager.close(SID)
    t.begin()
    t.apply(await t.manager.history(SID))
    expect(t.state.rows).toEqual(expected)
  })

  it("keeps a system warning and process error through gated history and reconnect after teardown", async () => {
    const finish = gate()
    const disk = gate()
    const t = setup(async function* () {
      await finish.promise
      yield { type: "system", subtype: "informational", level: "warning", content: "Custom warning" }
      throw new Error("fixture failure")
    })
    t.manager.send(SID, "request", [])
    await until(() => t.queries[0]?.received.length === 1)
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => { await disk.promise; return [user(t.queries[0].received[0].uuid!, "request")] as any })
    t.begin()
    const pending = t.manager.history(SID)
    finish.release()
    await until(() => !t.manager.isLive(SID))
    disk.release()
    t.apply(await pending)
    expect(t.state.rows.map((row) => row.kind)).toEqual(["user", "system", "error"])
    expect(t.state.rows[1]).toMatchObject({ text: "Custom warning", id: expect.any(String) })
    expect(t.state.rows[2]).toMatchObject({ text: "Claude Code stopped: fixture failure", id: expect.any(String) })
    const expected = t.state.rows
    t.begin()
    t.apply(await t.manager.history(SID))
    expect(t.state.rows).toEqual(expected)
    expect(t.state.status).toBe("idle")
  })

  it.each(["native", "legacy-shared", "legacy-rewritten"])("dedupes persisted slash output during a gated snapshot (%s)", async (format) => {
    const finish = gate()
    const disk = gate()
    const t = setup(async function* () {
      await finish.promise
      yield { type: "system", subtype: "local_command_output", uuid: "live-output", content: "\u001b[1mUsage: 17%\u001b[22m" }
      yield result(0)
    })
    if (format === "native") vi.mocked(readLocalCommandOutputs).mockResolvedValue(new Map([["live-output", "Usage: 17%"]]))
    t.manager.send(SID, "/usage", [])
    await until(() => t.queries[0]?.received.length === 1)
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => {
      await disk.promise
      const output = format === "native"
        ? { type: "system", uuid: "live-output", timestamp: 2 }
        : user(format === "legacy-shared" ? "live-output" : "disk-output", "<local-command-stdout>Usage: 17%</local-command-stdout>")
      return [user(t.queries[0].received[0].uuid!, "<command-name>/usage</command-name>"), output] as any
    })
    t.begin()
    const pending = t.manager.history(SID)
    finish.release()
    await until(() => !t.manager.isRunning(SID))
    disk.release()
    t.apply(await pending)
    expect(t.state.rows.map((row) => row.kind)).toEqual(["user", "system", "result"])
    expect(t.state.rows[1]).toMatchObject({ id: "live-output", text: "Usage: 17%" })
    t.apply(await t.manager.history(SID))
    expect(t.state.rows).toHaveLength(3)
  })

  it("retains queued input under live-buffer item pressure while respecting the cap", async () => {
    const finish = gate()
    const next = gate()
    let turn = 0
    const t = setup(async function* () {
      if (turn++ === 0) {
        await finish.promise
        for (let i = 0; i < LIVE_BUFFER_MAX + 10; i++) {
          yield { type: "system", subtype: "informational", level: "warning", content: `Warning ${i}` }
        }
        yield assistant("a", "answer A")
        yield result(0, 1)
      } else await next.promise
    })
    t.manager.send(SID, "A", [])
    t.manager.send(SID, "B", [])
    await until(() => t.queries[0]?.received.length === 1)
    const sent = t.queries[0].received[0]
    vi.mocked(t.sdk.getSessionMessages).mockResolvedValue([user(sent.uuid!, "A"), assistant("a", "answer A")] as any)
    finish.release()
    await until(() => t.queries[0]?.received.length === 2)
    const snapshot = await t.manager.history(SID)
    expect(snapshot.items).toContainEqual(expect.objectContaining({ kind: "user", text: "B" }))
    expect(snapshot.items.length).toBeLessThanOrEqual(LIVE_BUFFER_MAX)
    next.release()
  })

  it("bounds retired history buffers across sessions", async () => {
    const t = setup(async function* () { yield result(0) })
    for (let i = 0; i < 35; i++) {
      const id = `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`
      t.manager.send(id, "x".repeat(190_000), [])
      await until(() => !t.manager.isRunning(id))
      t.manager.close(id)
    }
    const items: ChatItem[] = []
    for (let i = 0; i < 35; i++) {
      items.push(...(await t.manager.history(`11111111-2222-4333-8444-${String(i).padStart(12, "0")}`)).items)
    }
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(LIVE_BUFFER_MAX)
    expect(JSON.stringify(items).length).toBeLessThanOrEqual(LIVE_BUFFER_MAX_BYTES)
  })
})
