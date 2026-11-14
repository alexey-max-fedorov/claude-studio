import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG, type LiveEvent } from "@claude-studio/protocol"
import { setQuiet } from "../logger.js"
import { ConversationManager } from "../conversation-manager.js"
import { makeFakeSdk, textTurn, until, type TurnScript } from "./fake-sdk.js"

setQuiet(true)

const OLD = "11111111-2222-4333-8444-555555555555"
const NEXT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const managers: ConversationManager[] = []
const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function setup(turn: TurnScript) {
  const existing = new Set<string>()
  const { sdk, queries } = makeFakeSdk(turn, existing)
  const events: { sessionId: string; event: LiveEvent; sequence: number }[] = []
  const reset = vi.fn()
  const manager = new ConversationManager({
    sdk, version: "test", getConfig: () => ({ ...DEFAULT_CONFIG, projectDir: "/fixture" }),
    sink: { event: (sessionId, event, sequence) => events.push({ sessionId, event, sequence }), reset, capabilitiesChanged: () => {} },
  })
  managers.push(manager)
  return { manager, sdk, queries, events, reset, existing }
}

afterEach(() => { for (const manager of managers.splice(0)) manager.shutdown() })

describe("session lifecycle", () => {
  it("migrates a reset conversation and resumes the new transcript after process eviction", async () => {
    let turns = 0
    const t = setup(async function* (message, options) {
      if (turns++ === 0) yield { type: "conversation_reset", new_conversation_id: NEXT }
      yield* textTurn("new context", `message-${turns}`)(message, options)
    })
    t.manager.send(OLD, "/clear", [])
    await until(() => t.events.some(({ event }) => event.kind === "status" && event.state === "idle"))
    expect(t.reset).toHaveBeenCalledWith(OLD, NEXT)
    expect(t.manager.isLive(OLD)).toBe(false)
    expect(t.manager.isLive(NEXT)).toBe(true)
    expect(t.events.filter(({ event }) => event.kind === "item" && event.item.kind === "assistant").every((e) => e.sessionId === NEXT)).toBe(true)
    const history = await t.manager.history(NEXT)
    expect(history.items).toContainEqual(expect.objectContaining({ kind: "assistant", text: "new context" }))
    expect(history.items.some((item) => item.kind === "user" && item.text === "/clear")).toBe(false)
    t.existing.add(NEXT)
    t.manager.close(NEXT)
    t.manager.send(NEXT, "continue", [])
    await until(() => t.queries.length === 2)
    expect(t.queries[1].options.resume).toBe(NEXT)
  })

  it("keeps completed replies when a disk snapshot predates completion", async () => {
    const finish = gate()
    const disk = gate()
    const t = setup(async function* (message, options) {
      await finish.promise
      yield* textTurn("completed reply")(message, options)
    })
    t.manager.send(OLD, "hello", [])
    await until(() => t.queries[0]?.received.length === 1)
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => { await disk.promise; return [] })
    const pending = t.manager.history(OLD)
    finish.release()
    await until(() => !t.manager.isRunning(OLD))
    disk.release()
    const history = await pending
    expect(history.items).toContainEqual(expect.objectContaining({ kind: "assistant", text: "completed reply" }))
    expect(history.running).toBe(false)
    expect(history.sequence).toBe(t.events.at(-1)?.sequence)
  })

  it("redirects an in-flight history read when its live conversation resets", async () => {
    const resetNow = gate()
    const disk = gate()
    const t = setup(async function* (message, options) {
      await resetNow.promise
      yield { type: "conversation_reset", new_conversation_id: NEXT }
      yield* textTurn("fresh context")(message, options)
    })
    t.manager.send(OLD, "/clear", [])
    await until(() => t.queries[0]?.received.length === 1)
    vi.mocked(t.sdk.getSessionMessages).mockImplementation(async () => { await disk.promise; return [] })
    const pending = t.manager.history(OLD)
    resetNow.release()
    await until(() => t.reset.mock.calls.length === 1 && !t.manager.isRunning(NEXT))
    disk.release()
    const history = await pending
    expect(history.sessionId).toBe(NEXT)
    expect(history.items).toContainEqual(expect.objectContaining({ text: "fresh context" }))
  })

  it("keeps queued follow-ups on the new conversation after reset", async () => {
    let turn = 0
    const t = setup(async function* (message, options) {
      if (turn++ === 0) {
        yield { type: "conversation_reset", new_conversation_id: NEXT }
        yield { type: "result", subtype: "success", total_cost_usd: 0, usage: {}, queued_turn_count: 1 }
      } else yield* textTurn("follow-up reply")(message, options)
    })
    t.manager.send(OLD, "/clear", [])
    t.manager.send(OLD, "follow-up", [])
    await until(() => t.queries[0]?.received.length === 2 && !t.manager.isRunning(NEXT))
    const history = await t.manager.history(NEXT)
    expect(history.items).toContainEqual(expect.objectContaining({ kind: "user", text: "follow-up" }))
    expect(history.items.some((item) => item.kind === "user" && item.text === "/clear")).toBe(false)
  })

  it("uses the persisted init ID when it differs from the announced reset ID", async () => {
    const persisted = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
    const t = setup(async function* (message, options) {
      yield { type: "conversation_reset", new_conversation_id: NEXT }
      yield { type: "system", subtype: "init", session_id: persisted }
      yield* textTurn("persisted reply")(message, options)
    })
    t.manager.send(OLD, "/clear", [])
    await until(() => !t.manager.isRunning(persisted) && t.reset.mock.calls.length === 2)
    expect(t.reset.mock.calls).toEqual([[OLD, NEXT], [NEXT, persisted]])
    expect(t.manager.isLive(NEXT)).toBe(false)
    expect(t.manager.isLive(persisted)).toBe(true)
    t.existing.add(persisted)
    t.manager.close(persisted)
    t.manager.send(persisted, "continue", [])
    await until(() => t.queries.length === 2)
    expect(t.queries[1].options.resume).toBe(persisted)
  })

})
