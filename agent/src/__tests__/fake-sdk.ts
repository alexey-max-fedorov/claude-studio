import { vi } from "vitest"
import type { Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SdkApi } from "../conversation-manager.js"

export type TurnScript = (msg: SDKUserMessage, options: Options) => AsyncGenerator<any>

export const textTurn = (text: string, msgId = "msg_1"): TurnScript =>
  async function* () {
    yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: msgId } } }
    yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } }
    yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } }
    yield { type: "assistant", parent_tool_use_id: null, message: { id: msgId, content: [{ type: "text", text }] } }
    yield { type: "result", subtype: "success", is_error: false, duration_ms: 1, num_turns: 1, total_cost_usd: 0.01, usage: {}, queued_turn_count: 0 }
  }

export interface FakeQueryHandle {
  options: Options
  received: SDKUserMessage[]
  interrupt: ReturnType<typeof vi.fn>
  setModel: ReturnType<typeof vi.fn>
  setPermissionMode: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

export function makeFakeSdk(turn: TurnScript, existing: Set<string> = new Set()) {
  const queries: FakeQueryHandle[] = []
  const sdk: SdkApi = {
    query({ prompt, options }) {
      let closed = false
      const handle: FakeQueryHandle = {
        options,
        received: [],
        interrupt: vi.fn(async () => undefined),
        setModel: vi.fn(async () => undefined),
        setPermissionMode: vi.fn(async () => undefined),
        close: vi.fn(() => {
          closed = true
        }),
      }
      queries.push(handle)
      const gen = (async function* () {
        for await (const m of prompt) {
          if (closed) return
          handle.received.push(m)
          yield { type: "system", subtype: "init", session_id: "x" }
          yield* turn(m, options)
        }
      })()
      return Object.assign(gen, {
        interrupt: handle.interrupt,
        setModel: handle.setModel,
        setPermissionMode: handle.setPermissionMode,
        close: handle.close,
        supportedModels: async () => [
          { value: "default", displayName: "Default (recommended)", description: "d" },
          { value: "opus", displayName: "Opus", description: "o" },
        ],
        supportedCommands: async () => [{ name: "compact", description: "Compact", argumentHint: "" }],
        initializationResult: async () => ({
          models: [
            { value: "default", displayName: "Default (recommended)", description: "d" },
            { value: "sonnet", displayName: "Sonnet", description: "s" },
          ],
          commands: [{ name: "review", description: "Review", argumentHint: "" }],
        }),
      }) as any
    },
    getSessionInfo: vi.fn(async (id: string) => (existing.has(id) ? ({ sessionId: id, summary: "s", lastModified: 1 } as any) : undefined)),
    getSessionMessages: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
    renameSession: vi.fn(async () => undefined),
  }
  return { sdk, queries }
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

export async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("condition not met in time")
    await tick(5)
  }
}
