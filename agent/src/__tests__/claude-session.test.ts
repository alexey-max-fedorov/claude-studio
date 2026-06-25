import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the SDK before importing the module under test.
const queryMock = vi.fn()
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryMock(args),
}))

import { ClaudeSession } from "../claude-session.js"
import { activityBuffer } from "../activity.js"
import { DEFAULT_CONFIG } from "@claude-studio/protocol"

function fakeQuery(messages: any[]) {
  return {
    async *[Symbol.asyncIterator]() { for (const m of messages) yield m },
    interrupt: async () => {},
  }
}

function collect() {
  const out = { text: "", thinking: "", tools: [] as string[], done: false, error: "" }
  return {
    out,
    cb: {
      onStreaming: (c: string) => { out.text += c },
      onThinking: (c: string) => { out.thinking += c },
      onToolUse: (t: string) => { out.tools.push(t) },
      onComplete: () => { out.done = true },
      onError: (e: string) => { out.error = e },
    },
  }
}

describe("ClaudeSession streaming", () => {
  beforeEach(() => { queryMock.mockReset(); activityBuffer.clear() })

  it("emits live text + thinking from stream_event deltas, not whole blocks", async () => {
    queryMock.mockReturnValue(fakeQuery([
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "let me think" } } },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } } },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } } },
      { type: "assistant", message: { content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", name: "Edit", input: { a: 1 } },
      ] } },
      { type: "result", subtype: "success", session_id: "s1", result: "Hello", num_turns: 1, total_cost_usd: 0, usage: {} },
    ]))
    const session = new ClaudeSession(() => DEFAULT_CONFIG)
    const helper = collect()
    session.executeRawPrompt("client1", "hi", helper.cb as any)
    // allow the async generator to drain
    await new Promise((r) => setTimeout(r, 20))
    expect(helper.out.thinking).toBe("let me think")
    expect(helper.out.text).toBe("Hello")        // from deltas only — NOT doubled by the assistant block
    expect(helper.out.tools).toEqual(["Edit"])
    expect(helper.out.done).toBe(true)
    expect(activityBuffer.entries().some((e) => e.kind === "tool" && e.text.includes("Edit"))).toBe(true)
  })

  it("appends the ultracode workflow directive and tools to the query when effort is ultracode", async () => {
    queryMock.mockReturnValue(fakeQuery([
      { type: "result", subtype: "success", session_id: "s", result: "", num_turns: 1, total_cost_usd: 0, usage: {} },
    ]))
    const session = new ClaudeSession(() => ({ ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" }))
    const helper = collect()
    session.executeRawPrompt("c", "do it", helper.cb as any)
    await new Promise((r) => setTimeout(r, 20))
    const arg = queryMock.mock.calls[0][0]
    expect(arg.prompt).toMatch(/ultracode/i)
    expect(arg.options.allowedTools).toContain("Task")
  })
})
