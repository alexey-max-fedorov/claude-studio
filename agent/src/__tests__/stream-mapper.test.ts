import { describe, expect, it } from "vitest"
import { StreamMapper } from "../stream-mapper.js"

const se = (event: unknown, parent: string | null = null) => ({ type: "stream_event", event, parent_tool_use_id: parent, uuid: "x", session_id: "s" })
const asst = (id: string, content: unknown[], parent: string | null = null) => ({
  type: "assistant",
  message: { id, content },
  parent_tool_use_id: parent,
  uuid: "x",
  session_id: "s",
})

describe("StreamMapper", () => {
  it("streams deltas and finals with matching block ids", () => {
    const m = new StreamMapper(() => 1)
    const out = [
      ...m.map(se({ type: "message_start", message: { id: "msg_A" } })),
      ...m.map(se({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } })),
      ...m.map(se({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "plan" } })),
      ...m.map(asst("msg_A", [{ type: "thinking", thinking: "plan" }])),
      ...m.map(se({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } })),
      ...m.map(se({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "PO" } })),
      ...m.map(se({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "NG" } })),
      ...m.map(se({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "Bash" } })),
      ...m.map(se({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{" } })),
      ...m.map(asst("msg_A", [{ type: "text", text: "PONG" }])),
      ...m.map(asst("msg_A", [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } }])),
    ]
    expect(out).toEqual([
      { kind: "thinking_delta", id: "msg_A:0", text: "plan" },
      { kind: "item", item: { kind: "thinking", id: "msg_A:0", text: "plan", ts: 1 } },
      { kind: "text_delta", id: "msg_A:1", text: "PO" },
      { kind: "text_delta", id: "msg_A:1", text: "NG" },
      { kind: "item", item: { kind: "assistant", id: "msg_A:1", text: "PONG", ts: 1 } },
      { kind: "item", item: { kind: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" }, ts: 1, parentToolUseId: null } },
    ])
  })

  it("tracks in-flight text until the final block arrives", () => {
    const m = new StreamMapper(() => 1)
    m.map(se({ type: "message_start", message: { id: "msg_B" } }))
    m.map(se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }))
    m.map(se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }))
    m.map(se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }))
    expect(m.inFlight()).toEqual([{ id: "msg_B:0", kind: "text", text: "Hello" }])
    m.map(asst("msg_B", [{ type: "text", text: "Hello" }]))
    expect(m.inFlight()).toEqual([])
  })

  it("ignores subagent stream/text but keeps subagent tool_use and all tool_results", () => {
    const m = new StreamMapper(() => 1)
    expect(m.map(se({ type: "message_start", message: { id: "msg_sub" } }, "toolu_task"))).toEqual([])
    expect(m.map(asst("msg_sub", [{ type: "text", text: "internal" }], "toolu_task"))).toEqual([])
    expect(m.map(asst("msg_sub", [{ type: "tool_use", id: "toolu_s", name: "Read", input: {} }], "toolu_task"))).toEqual([
      { kind: "item", item: { kind: "tool_use", id: "toolu_s", name: "Read", input: {}, ts: 1, parentToolUseId: "toolu_task" } },
    ])
    expect(
      m.map({ type: "user", parent_tool_use_id: "toolu_task", message: { content: [{ type: "tool_result", tool_use_id: "toolu_s", content: "ok" }] } }),
    ).toEqual([{ kind: "item", item: { kind: "tool_result", toolUseId: "toolu_s", text: "ok", isError: false, ts: 1 } }])
  })

  it("falls back to block position when no stream events were seen", () => {
    const m = new StreamMapper(() => 1)
    const out = [...m.map(asst("msg_C", [{ type: "text", text: "a" }])), ...m.map(asst("msg_C", [{ type: "text", text: "b" }]))]
    expect(out.map((e) => (e.kind === "item" && "id" in e.item ? e.item.id : null))).toEqual(["msg_C:0", "msg_C:1"])
  })

  it("maps results with per-turn cost deltas and readable errors", () => {
    const m = new StreamMapper(() => 5)
    const r1 = m.map({ type: "result", subtype: "success", is_error: false, duration_ms: 10, num_turns: 1, total_cost_usd: 0.5, usage: { input_tokens: 1, output_tokens: 2 } })
    expect(r1).toEqual([
      {
        kind: "item",
        item: {
          kind: "result",
          ts: 5,
          isError: false,
          durationMs: 10,
          turns: 1,
          costUsd: 0.5,
          usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ])
    const r2 = m.map({ type: "result", subtype: "error_max_turns", is_error: true, num_turns: 3, total_cost_usd: 0.75, errors: [] })[0] as any
    expect(r2.item.costUsd).toBeCloseTo(0.25)
    expect(r2.item.isError).toBe(true)
    expect(r2.item.errorText).toContain("max turns")
  })

  it("reports the budget cap as shared across messages in the live process", () => {
    const m = new StreamMapper(() => 5)
    m.map({ type: "result", subtype: "success", total_cost_usd: 0.5 })
    const out = m.map({ type: "result", subtype: "error_max_budget_usd", is_error: true, total_cost_usd: 1, errors: [] })
    expect(out[0]).toMatchObject({
      kind: "item",
      item: {
        kind: "result",
        isError: true,
        costUsd: 0.5,
        errorText: "Stopped: reached the live-process budget cap shared across messages. A process restart or /clear gives a fresh allowance.",
      },
    })
  })

  it("reports an interrupt plainly and hides CLI diagnostics", () => {
    const m = new StreamMapper(() => 5)
    const plain = m.map({ type: "result", subtype: "error_during_execution", errors: ["[ede_diagnostic] result_type=user"] })[0] as any
    expect(plain.item.errorText).not.toContain("ede_diagnostic")
    m.noteInterrupt()
    const r = m.map({ type: "result", subtype: "error_during_execution", errors: ["[ede_diagnostic] result_type=user"] })[0] as any
    expect(r.item.errorText).toBe("Interrupted by the user.")
  })

  it("surfaces local command output, compaction and API retries as system items", () => {
    const m = new StreamMapper(() => 1)
    expect(m.map({ type: "system", subtype: "local_command_output", content: "Total cost: $0" })).toEqual([
      { kind: "item", item: { kind: "system", text: "Total cost: $0", ts: 1 } },
    ])
    expect(m.map({ type: "system", subtype: "compact_boundary" })[0]).toMatchObject({ item: { text: "Conversation compacted." } })
    expect((m.map({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 5, error_status: 529, error: "overloaded" })[0] as any).item.text).toContain("529")
    expect(m.map({ type: "system", subtype: "init" })).toEqual([])
  })
  it("#3 unknown baseline (resumed from elsewhere): first result costs 0, then deltas", () => {
    const m = new StreamMapper(() => 1, null)
    const r1 = m.map({ type: "result", subtype: "success", total_cost_usd: 12.5, usage: {} })[0] as any
    expect(r1.item.costUsd).toBe(0)
    const r2 = m.map({ type: "result", subtype: "success", total_cost_usd: 12.75, usage: {} })[0] as any
    expect(r2.item.costUsd).toBeCloseTo(0.25)
    expect(m.totalCost).toBe(12.75)
  })

  it("#3 known baseline: first result after an in-daemon resume is just that turn", () => {
    const m = new StreamMapper(() => 1, 3)
    expect((m.map({ type: "result", subtype: "success", total_cost_usd: 3.5, usage: {} })[0] as any).item.costUsd).toBeCloseTo(0.5)
  })
})
