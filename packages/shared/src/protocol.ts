import type { ElementSelection } from "./element-selection.js"

// --- Client → Server ---
export type ClientMessage =
  | { type: "ping" }
  | { type: "prompt"; route: string; element: ElementSelection; prompt: string }
  | { type: "raw_prompt"; prompt: string }
  | { type: "reset_session" }

// --- Server → Client ---
export type ServerMessage =
  | { type: "connected"; clientId: string }
  | { type: "pong" }
  | { type: "ai_streaming"; chunk: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "ai_complete"; result: string; sessionId: string; cost: number; turns: number }
  | { type: "ai_error"; error: string }
  | { type: "session_reset"; newSessionId: string }

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
