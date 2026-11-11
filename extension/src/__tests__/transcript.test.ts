import { describe, expect, it } from "vitest"
import type { ChatItem, LiveEvent } from "@claude-studio/protocol"
import { buildView, initialTranscript, matchToolRow, transcriptReducer as r, type Row, type TranscriptState } from "../lib/transcript"

const S = "11111111-1111-4111-8111-111111111111"
const ev = (event: LiveEvent) => ({ type: "event" as const, sessionId: S, event })
const item = (i: ChatItem) => ev({ kind: "item", item: i })
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function run(actions: Parameters<typeof r>[1][], start: TranscriptState = initialTranscript(S)) {
  return actions.reduce(r, start)
}

describe("transcript reducer", () => {
  it("streams text deltas into one block, then the final item replaces it", () => {
    const s = run([
      ev({ kind: "status", state: "running" }),
      ev({ kind: "text_delta", id: "m1:0", text: "Hel" }),
      ev({ kind: "text_delta", id: "m1:0", text: "lo" }),
    ])
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0]).toMatchObject({ kind: "assistant", text: "Hello", streaming: true })
    const f = r(s, item({ kind: "assistant", id: "m1:0", text: "Hello, world", ts: 1 }))
    expect(f.rows).toHaveLength(1)
    expect(f.rows[0]).toMatchObject({ kind: "assistant", text: "Hello, world", streaming: false })
    // a late delta after the final text is ignored
    const late = r(f, ev({ kind: "text_delta", id: "m1:0", text: "!!" }))
    expect((late.rows[0] as any).text).toBe("Hello, world")
  })

  it("mid-turn reopen: deltas append to the partial block from history, the final item replaces it", () => {
    let s = r(initialTranscript(S), {
      type: "history",
      msg: {
        type: "session_history",
        sessionId: S,
        running: true,
        pending: [],
        items: [
          { kind: "user", id: "u1", text: "go", attachments: [], ts: 1 },
          { kind: "assistant", id: "m1:0", text: "Done with step one.", ts: 2 },
          { kind: "assistant", id: "m2:0", text: "Working on st", ts: 3 },
        ],
      },
    })
    expect(s.rows[2]).toMatchObject({ text: "Working on st", streaming: false })
    s = r(s, ev({ kind: "text_delta", id: "m2:0", text: "ep two" }))
    expect(s.rows[2]).toMatchObject({ text: "Working on step two", streaming: true })
    expect(s.rows[1]).toMatchObject({ streaming: false })
    s = r(s, item({ kind: "assistant", id: "m2:0", text: "Working on step two. Done.", ts: 4 }))
    expect(s.rows).toHaveLength(3)
    expect(s.rows[2]).toMatchObject({ text: "Working on step two. Done.", streaming: false })
    s = r(s, ev({ kind: "text_delta", id: "m2:0", text: "late" }))
    expect((s.rows[2] as any).text).toBe("Working on step two. Done.")
  })

  it("new-session event order renders one user bubble (echo replaces optimistic)", () => {
    let s = r(initialTranscript(S), { type: "local_user", nonce: "x", text: "/cost", attachments: [], ts: 1 })
    s = run(
      [
        ev({ kind: "status", state: "starting" }),
        item({ kind: "user", id: "agent-u1", text: "/cost", attachments: [], ts: 2 }),
        ev({ kind: "status", state: "running" }),
        item({ kind: "system", text: "Total cost: $0.00", ts: 3 }),
        item({ kind: "result", ts: 4, isError: false, durationMs: 10, turns: 1, costUsd: 0, usage }),
        ev({ kind: "status", state: "idle" }),
      ],
      s,
    )
    expect(s.rows.map((x) => x.kind)).toEqual(["user", "system", "result"])
    expect(s.rows[0]).toMatchObject({ id: "agent-u1" })
    expect(s.status).toBe("idle")
  })

  it("keeps thinking and text with the same message separate", () => {
    const s = run([
      ev({ kind: "thinking_delta", id: "m1:0", text: "hmm" }),
      ev({ kind: "text_delta", id: "m1:1", text: "Answer" }),
      item({ kind: "thinking", id: "m1:0", text: "hmm, ok", ts: 1 }),
    ])
    expect(s.rows.map((x) => x.kind)).toEqual(["thinking", "assistant"])
    expect(s.rows[0]).toMatchObject({ text: "hmm, ok", streaming: false })
    expect(s.rows[1]).toMatchObject({ streaming: true })
  })

  it("idle status and result items finalize streaming blocks", () => {
    const s = run([ev({ kind: "text_delta", id: "a", text: "x" }), ev({ kind: "status", state: "idle" })])
    expect(s.rows[0]).toMatchObject({ streaming: false })
    expect(s.status).toBe("idle")
    const s2 = run([
      ev({ kind: "text_delta", id: "a", text: "x" }),
      item({ kind: "result", ts: 2, isError: false, durationMs: 1200, turns: 2, costUsd: 0.1, usage }),
    ])
    expect(s2.rows[0]).toMatchObject({ streaming: false })
    expect(s2.rows[1]).toMatchObject({ kind: "result", turns: 2 })
  })

  it("attaches tool_result by exact toolu_ id", () => {
    const s = run([
      item({ kind: "tool_use", id: "toolu_A", name: "Bash", input: { command: "ls" }, ts: 1, parentToolUseId: null }),
      item({ kind: "tool_use", id: "toolu_B", name: "Read", input: { file_path: "/x" }, ts: 1, parentToolUseId: null }),
      item({ kind: "tool_result", toolUseId: "toolu_A", text: "files", isError: false, ts: 2 }),
    ])
    expect((s.rows[0] as any).result).toMatchObject({ text: "files" })
    expect((s.rows[1] as any).result).toBeUndefined()
  })

  it("only matches tool_result by exact id; anything else becomes an orphan row", () => {
    const s = run([
      item({ kind: "tool_use", id: "toolu_A", name: "Bash", input: {}, ts: 1, parentToolUseId: null }),
      item({ kind: "tool_result", toolUseId: "A", text: "suffix-ish", isError: false, ts: 2 }),
      item({ kind: "tool_result", toolUseId: "toolu_unknown", text: "unknown", isError: true, ts: 3 }),
    ])
    expect((s.rows[0] as any).result).toBeUndefined()
    expect(s.rows.slice(1).map((x) => x.kind)).toEqual(["orphan_result", "orphan_result"])
  })

  it("keeps an unmatched tool_result as an orphan row", () => {
    const s = run([item({ kind: "tool_result", toolUseId: "toolu_X", text: "lost", isError: false, ts: 1 })])
    expect(s.rows[0]).toMatchObject({ kind: "orphan_result", text: "lost" })
  })

  it("matchToolRow is exact", () => {
    const rows: Row[] = [
      { kind: "tool", id: "toolu_1", name: "A", input: {}, ts: 0, parentToolUseId: null, result: { text: "", isError: false, ts: 0 } },
      { kind: "tool", id: "toolu_2", name: "B", input: {}, ts: 0, parentToolUseId: null },
    ]
    expect(matchToolRow(rows, "toolu_1")).toBe(0)
    expect(matchToolRow(rows, "nope")).toBe(-1)
    expect(matchToolRow(rows, "")).toBe(-1)
  })

  it("adds, dedupes and removes permission requests", () => {
    const req = { kind: "permission_request" as const, requestId: "p1", toolName: "Bash", input: { command: "rm -rf x" }, canAlwaysAllow: true }
    const s = run([ev(req), ev(req)])
    expect(s.permissions).toHaveLength(1)
    const s2 = r(s, ev({ kind: "permission_resolved", requestId: "p1", behavior: "allow" }))
    expect(s2.permissions).toHaveLength(0)
  })

  it("ignores events for other sessions", () => {
    const s = r(initialTranscript(S), { type: "event", sessionId: "other", event: { kind: "text_delta", id: "x", text: "y" } })
    expect(s.rows).toHaveLength(0)
  })

  it("history replaces rows, sets running and pending, keeps unechoed local messages", () => {
    let s = r(initialTranscript(S), { type: "local_user", nonce: "n1", text: "queued", attachments: [], ts: 5 })
    s = r(s, {
      type: "history",
      msg: {
        type: "session_history",
        sessionId: S,
        running: true,
        pending: [{ kind: "permission_request", requestId: "p9", toolName: "Edit", input: {}, canAlwaysAllow: false }],
        items: [
          { kind: "user", id: "u1", text: "hi", attachments: [], ts: 1 },
          { kind: "tool_use", id: "toolu_1", name: "Bash", input: {}, ts: 2, parentToolUseId: null },
          { kind: "tool_result", toolUseId: "toolu_1", text: "ok", isError: false, ts: 3 },
        ],
      },
    })
    expect(s.loaded).toBe(true)
    expect(s.status).toBe("running")
    expect(s.permissions.map((p) => p.requestId)).toEqual(["p9"])
    expect(s.rows.map((x) => x.kind)).toEqual(["user", "tool", "user"])
    expect((s.rows[1] as any).result.text).toBe("ok")
  })

  it("server user item replaces the optimistic local bubble", () => {
    let s = r(initialTranscript(S), { type: "local_user", nonce: "n1", text: "hello", attachments: [{ type: "page", label: "Example" }], ts: 1 })
    s = r(s, item({ kind: "user", id: "u1", text: "hello", attachments: [], ts: 2 }))
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0]).toMatchObject({ id: "u1", attachments: [{ label: "Example" }] })
    expect((s.rows[0] as any).local).toBeUndefined()
  })

  it("an older identical user message in history does not swallow a pending local bubble", () => {
    const now = 1_000_000
    let s = r(initialTranscript(S), { type: "local_user", nonce: "n2", text: "yes", attachments: [], ts: now })
    s = r(s, {
      type: "history",
      msg: { type: "session_history", sessionId: S, running: false, pending: [], items: [{ kind: "user", id: "old", text: "yes", attachments: [], ts: now - 60_000 }] },
    })
    expect(s.rows.map((x) => (x as any).id)).toEqual(["old", "local:n2"])
    // the live echo (newer) then replaces the local bubble, not the old message
    s = r(s, item({ kind: "user", id: "new", text: "yes", attachments: [], ts: now + 50 }))
    expect(s.rows.map((x) => (x as any).id)).toEqual(["old", "new"])
  })

  it("a history echo newer than the local bubble resolves it", () => {
    let s = r(initialTranscript(S), { type: "local_user", nonce: "n3", text: "go", attachments: [], ts: 100_000 })
    s = r(s, {
      type: "history",
      msg: { type: "session_history", sessionId: S, running: true, pending: [], items: [{ kind: "user", id: "e", text: "go", attachments: [], ts: 100_200 }] },
    })
    expect(s.rows.map((x) => (x as any).id)).toEqual(["e"])
  })

  it("local bubbles can be marked failed, retried and removed", () => {
    let s = r(initialTranscript(S), { type: "local_user", nonce: "n4", text: "hi", attachments: [], ts: 1 })
    s = r(s, { type: "local_status", nonce: "n4", failed: true })
    expect(s.rows[0]).toMatchObject({ failed: true, local: true })
    s = r(s, { type: "local_status", nonce: "n4", failed: false, ts: 50 })
    expect(s.rows[0]).toMatchObject({ failed: false, ts: 50 })
    s = r(s, { type: "local_remove", nonce: "n4" })
    expect(s.rows).toHaveLength(0)
  })

  it("errors and system items get unique ids", () => {
    const s = run([item({ kind: "error", text: "boom", ts: 1 }), item({ kind: "system", text: "compacted", ts: 2 }), { type: "local_error", text: "x", ts: 3 }])
    const ids = s.rows.map((x) => (x as any).id)
    expect(new Set(ids).size).toBe(3)
  })

  it("reset clears state for a new session", () => {
    const s = run([ev({ kind: "text_delta", id: "a", text: "x" }), { type: "reset", sessionId: "new", loaded: true }])
    expect(s).toMatchObject({ sessionId: "new", rows: [], loaded: true, status: "idle" })
  })
})

describe("buildView", () => {
  it("nests subagent tool calls under their parent Task", () => {
    const rows: Row[] = [
      { kind: "tool", id: "toolu_T", name: "Task", input: { description: "explore" }, ts: 0, parentToolUseId: null },
      { kind: "tool", id: "toolu_c1", name: "Grep", input: {}, ts: 0, parentToolUseId: "toolu_T" },
      { kind: "tool", id: "toolu_c2", name: "Read", input: {}, ts: 0, parentToolUseId: "toolu_c1" },
      { kind: "assistant", id: "m:0", text: "done", ts: 0, streaming: false },
      { kind: "tool", id: "toolu_o", name: "Read", input: {}, ts: 0, parentToolUseId: "toolu_missing" },
    ]
    const v = buildView(rows)
    expect(v.map((x) => (x as any).id)).toEqual(["toolu_T", "m:0", "toolu_o"])
    const task = v[0] as any
    expect(task.children.map((c: any) => c.id)).toEqual(["toolu_c1"])
    expect(task.children[0].children.map((c: any) => c.id)).toEqual(["toolu_c2"])
  })
})
