import { describe, expect, it } from "vitest"
import type { ChatItem } from "@claude-studio/protocol"
import { initialTranscript, transcriptReducer, type TranscriptState } from "../lib/transcript"

const SID = "11111111-2222-4333-8444-555555555555"
const history = (sequence: number, text = "") => ({
  type: "session_history" as const, sessionId: SID, sequence, running: !!text, pending: [],
  items: text ? [{ kind: "assistant" as const, id: "message:0", text, ts: 1 }] : [],
})
const begin = () => transcriptReducer(initialTranscript(SID), { type: "begin_history" })
const delta = (state: TranscriptState, sequence: number, text: string) => transcriptReducer(state, {
  type: "event", sessionId: SID, sequence, event: { kind: "text_delta", id: "message:0", text },
})

describe("history ordering", () => {
  it("preserves a final response delivered after the history snapshot was captured", () => {
    let state = begin()
    state = transcriptReducer(state, { type: "event", sessionId: SID, sequence: 2, event: { kind: "item", item: { kind: "assistant", id: "message:0", text: "finished", ts: 1 } } })
    state = transcriptReducer(state, { type: "event", sessionId: SID, sequence: 3, event: { kind: "status", state: "idle" } })
    state = transcriptReducer(state, { type: "history", msg: history(1) })
    expect(state.rows).toContainEqual(expect.objectContaining({ kind: "assistant", text: "finished", streaming: false }))
    expect(state.status).toBe("idle")
    expect(state.pendingEvents).toEqual([])
  })

  it("does not double-append deltas already included in the snapshot", () => {
    let state = delta(begin(), 1, "Hel")
    state = delta(state, 2, "lo")
    state = transcriptReducer(state, { type: "history", msg: history(1, "Hel") })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ text: "Hello", streaming: true })
    state = delta(state, 1, "Hel")
    expect(state.rows[0]).toMatchObject({ text: "Hello" })
  })

  it("replays permission resolution after an older pending-permission snapshot", () => {
    let state = begin()
    state = transcriptReducer(state, { type: "event", sessionId: SID, sequence: 8, event: { kind: "permission_resolved", requestId: "permission", behavior: "allow" } })
    state = transcriptReducer(state, { type: "history", msg: { ...history(7), pending: [{ kind: "permission_request", requestId: "permission", toolName: "Bash", input: {}, canAlwaysAllow: false }] } })
    expect(state.permissions).toEqual([])
  })

  it("accepts events from a restarted daemon with a fresh sequence", () => {
    let state = transcriptReducer(begin(), { type: "history", msg: history(100) })
    state = transcriptReducer(state, { type: "begin_history" })
    state = delta(state, 2, "fresh")
    state = transcriptReducer(state, { type: "history", msg: history(1) })
    expect(state.rows[0]).toMatchObject({ text: "fresh" })
  })

  it.each<ChatItem>([
    { kind: "result", id: "turn", ts: 1, isError: true, errorText: "Budget exceeded", durationMs: 10, turns: 1, costUsd: 0.25, usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    { kind: "error", id: "error", text: "Process stopped", ts: 1 },
    { kind: "system", id: "warning", text: "Retrying", ts: 1 },
  ])("upserts identified $kind items across snapshot replay and duplicate delivery", (item) => {
    let state = transcriptReducer(begin(), { type: "event", sessionId: SID, sequence: 2, event: { kind: "item", item } })
    state = transcriptReducer(state, { type: "history", msg: { ...history(1), items: [item] } })
    expect(state.rows).toEqual([item])
    state = transcriptReducer(state, { type: "event", sessionId: SID, sequence: 3, event: { kind: "item", item } })
    expect(state.rows).toEqual([item])
  })

})
