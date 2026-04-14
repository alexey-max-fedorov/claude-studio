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

const MAX_PROMPT_LEN = 50_000
const MAX_ROUTE_LEN = 1_000
const MAX_ELEMENT_STR_LEN = 2_000

function assertStr(val: unknown, field: string, maxLen = MAX_ELEMENT_STR_LEN): string {
  if (typeof val !== "string") throw new Error(`Invalid message: ${field} must be a string`)
  if (val.length > maxLen) throw new Error(`Invalid message: ${field} exceeds max length of ${maxLen}`)
  return val
}

export function parseClientMessage(raw: string): ClientMessage {
  const msg = JSON.parse(raw)
  if (!msg || typeof msg.type !== "string") {
    throw new Error("Invalid message: missing type field")
  }
  switch (msg.type) {
    case "prompt": {
      assertStr(msg.route, "route", MAX_ROUTE_LEN)
      assertStr(msg.prompt, "prompt", MAX_PROMPT_LEN)
      if (!msg.element || typeof msg.element !== "object") {
        throw new Error("Invalid message: element must be an object")
      }
      assertStr(msg.element.cssSelector, "element.cssSelector")
      assertStr(msg.element.tagName, "element.tagName")
      assertStr(msg.element.textContent, "element.textContent")
      assertStr(msg.element.outerHTML, "element.outerHTML")
      if (!Array.isArray(msg.element.classList)) {
        throw new Error("Invalid message: element.classList must be an array")
      }
      break
    }
    case "raw_prompt":
      assertStr(msg.prompt, "prompt", MAX_PROMPT_LEN)
      break
    case "ping":
    case "reset_session":
    case "query_capabilities":
    case "query_models":
      break
    default:
      throw new Error(`Invalid message: unknown type "${msg.type}"`)
  }
  return msg as ClientMessage
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
