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
const MAX_SHORT_STR_LEN = 200
const MAX_LIST_LEN = 50

function assertStr(val: unknown, field: string, maxLen = MAX_ELEMENT_STR_LEN): string {
  if (typeof val !== "string") throw new Error(`Invalid message: ${field} must be a string`)
  if (val.length > maxLen) throw new Error(`Invalid message: ${field} exceeds max length of ${maxLen}`)
  return val
}

function assertStrArr(val: unknown, field: string, maxEntryLen = MAX_SHORT_STR_LEN): string[] {
  if (!Array.isArray(val)) throw new Error(`Invalid message: ${field} must be an array`)
  if (val.length > MAX_LIST_LEN) throw new Error(`Invalid message: ${field} exceeds max entries of ${MAX_LIST_LEN}`)
  for (let i = 0; i < val.length; i++) assertStr(val[i], `${field}[${i}]`, maxEntryLen)
  return val as string[]
}

function assertStrRecord(val: unknown, field: string): Record<string, string> {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    throw new Error(`Invalid message: ${field} must be an object`)
  }
  const entries = Object.entries(val as Record<string, unknown>)
  if (entries.length > MAX_LIST_LEN) throw new Error(`Invalid message: ${field} exceeds max entries of ${MAX_LIST_LEN}`)
  for (const [k, v] of entries) {
    if (k.length > MAX_SHORT_STR_LEN) throw new Error(`Invalid message: ${field} key exceeds max length of ${MAX_SHORT_STR_LEN}`)
    assertStr(v, `${field}["${k}"]`, MAX_ELEMENT_STR_LEN)
  }
  return val as Record<string, string>
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
      const el = msg.element
      assertStr(el.cssSelector, "element.cssSelector")
      assertStr(el.tagName, "element.tagName")
      assertStr(el.id, "element.id")
      assertStr(el.textContent, "element.textContent")
      assertStr(el.outerHTML, "element.outerHTML")
      assertStrArr(el.classList, "element.classList")
      assertStrArr(el.parentChain, "element.parentChain")
      assertStrRecord(el.attributes, "element.attributes")
      if (!el.computedStyles || typeof el.computedStyles !== "object") {
        throw new Error("Invalid message: element.computedStyles must be an object")
      }
      assertStr(el.computedStyles.color, "element.computedStyles.color", MAX_SHORT_STR_LEN)
      assertStr(el.computedStyles.backgroundColor, "element.computedStyles.backgroundColor", MAX_SHORT_STR_LEN)
      assertStr(el.computedStyles.fontSize, "element.computedStyles.fontSize", MAX_SHORT_STR_LEN)
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
