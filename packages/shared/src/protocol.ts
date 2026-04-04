import type { ElementSelection } from "./element-selection.js"

// --- Client → Server ---
export type ClientMessage =
  | { type: "ping" }
  | { type: "prompt"; route: string; element: ElementSelection; prompt: string }
  | { type: "raw_prompt"; prompt: string }
  | { type: "reset_session" }
  | { type: "query_capabilities" }
  | { type: "query_models" }

// --- Server → Client ---
export type ServerMessage =
  | { type: "connected"; clientId: string }
  | { type: "pong" }
  | { type: "ai_streaming"; chunk: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "ai_complete"; result: string; sessionId: string; cost: number; turns: number;
      usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
      duration_ms: number; model: string }
  | { type: "ai_error"; error: string }
  | { type: "session_reset"; newSessionId: string }
  | { type: "session_info"; model: string; cumulativeCost: number; cumulativeInputTokens: number;
      cumulativeOutputTokens: number; turnCount: number }
  | { type: "capabilities"; commands: Array<{ name: string; description: string; argumentHint: string }> }
  | { type: "command_output"; content: string }
  | { type: "available_models"; models: Array<{ id: string; name: string }>; current: string }

export function parseClientMessage(raw: string): ClientMessage {
  const msg = JSON.parse(raw)
  if (!msg || typeof msg.type !== "string") {
    throw new Error("Invalid message: missing type field")
  }
  return msg as ClientMessage
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
