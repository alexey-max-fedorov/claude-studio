import type { ClientMessage, ServerMessage, Attachment } from "./protocol.js"
import type { StudioConfig, PermissionMode, EffortLevel } from "./config.js"
import { EFFORT_LEVELS, PERMISSION_MODES } from "./config.js"

const MAX_TEXT_LEN = 200_000
const MAX_URL_LEN = 4_000
const MAX_SHORT = 500
const MAX_PAGE_TEXT = 400_000
const MAX_DATA_URL = 12_000_000
const MAX_ATTACHMENTS = 12
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function bad(msg: string): never {
  throw new Error(`Invalid message: ${msg}`)
}

function str(val: unknown, field: string, maxLen: number): string {
  if (typeof val !== "string") bad(`${field} must be a string`)
  if ((val as string).length > maxLen) bad(`${field} exceeds max length of ${maxLen}`)
  return val as string
}

function uuid(val: unknown, field = "sessionId"): string {
  const s = str(val, field, 64)
  if (!UUID_RE.test(s)) bad(`${field} must be a UUID`)
  return s
}

function optInt(val: unknown, field: string, min: number, max: number): void {
  if (val === undefined) return
  if (typeof val !== "number" || !Number.isInteger(val) || val < min || val > max) bad(`${field} must be an integer ${min}..${max}`)
}

function strArray(val: unknown, field: string, maxItems: number, maxLen: number): void {
  if (!Array.isArray(val)) bad(`${field} must be an array of strings`)
  if ((val as unknown[]).length > maxItems) bad(`${field} has more than ${maxItems} entries`)
  ;(val as unknown[]).forEach((v, i) => str(v, `${field}[${i}]`, maxLen))
}

function validateElement(el: any): void {
  if (!el || typeof el !== "object" || Array.isArray(el)) bad("element must be an object")
  str(el.tagName, "element.tagName", MAX_SHORT)
  str(el.id, "element.id", MAX_SHORT)
  str(el.cssSelector, "element.cssSelector", 4_000)
  str(el.textContent ?? "", "element.textContent", 4_000)
  str(el.outerHTML ?? "", "element.outerHTML", 20_000)
  strArray(el.classList, "element.classList", 100, MAX_SHORT)
  if (el.attributes !== undefined) {
    if (!el.attributes || typeof el.attributes !== "object" || Array.isArray(el.attributes)) bad("element.attributes must be an object")
    const entries = Object.entries(el.attributes)
    if (entries.length > 100) bad("element.attributes has more than 100 entries")
    for (const [k, v] of entries) {
      str(k, "element.attributes key", MAX_SHORT)
      str(v, `element.attributes[${JSON.stringify(k.slice(0, 50))}]`, 4_000)
    }
  }
  if (el.parentChain !== undefined) strArray(el.parentChain, "element.parentChain", 100, 4_000)
}

export function validateAttachment(a: any, i: number): Attachment {
  if (!a || typeof a !== "object") bad(`attachments[${i}] must be an object`)
  str(a.url, `attachments[${i}].url`, MAX_URL_LEN)
  str(a.title ?? "", `attachments[${i}].title`, MAX_SHORT * 4)
  switch (a.type) {
    case "page":
      break
    case "selection":
      str(a.text, `attachments[${i}].text`, MAX_TEXT_LEN)
      break
    case "page_text":
      str(a.text, `attachments[${i}].text`, MAX_PAGE_TEXT)
      break
    case "screenshot": {
      const d = str(a.dataUrl, `attachments[${i}].dataUrl`, MAX_DATA_URL)
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) bad(`attachments[${i}].dataUrl must be a base64 png/jpeg/webp data URL`)
      break
    }
    case "element":
      validateElement(a.element)
      break
    default:
      bad(`attachments[${i}].type unknown`)
  }
  return a as Attachment
}

export function parseClientMessage(raw: string): ClientMessage {
  let msg: any
  try {
    msg = JSON.parse(raw)
  } catch {
    bad("not JSON")
  }
  if (!msg || typeof msg.type !== "string") bad("missing type field")
  switch (msg.type) {
    case "ping":
    case "get_state":
      break
    case "set_config":
      if (!msg.patch || typeof msg.patch !== "object" || Array.isArray(msg.patch)) bad("patch must be an object")
      break
    case "list_sessions":
      optInt(msg.limit, "limit", 1, 200)
      optInt(msg.offset, "offset", 0, 100_000)
      break
    case "open_session":
    case "interrupt":
    case "close_session":
      uuid(msg.sessionId)
      break
    case "rename_session":
      uuid(msg.sessionId)
      str(msg.title, "title", 200)
      break
    case "send":
      uuid(msg.sessionId)
      str(msg.text, "text", MAX_TEXT_LEN)
      if (!Array.isArray(msg.attachments)) bad("attachments must be an array")
      if (msg.attachments.length > MAX_ATTACHMENTS) bad(`at most ${MAX_ATTACHMENTS} attachments`)
      msg.attachments.forEach((a: unknown, i: number) => validateAttachment(a, i))
      if (!msg.text.trim() && msg.attachments.length === 0) bad("empty message")
      break
    case "permission_response":
      uuid(msg.sessionId)
      str(msg.requestId, "requestId", 200)
      if (msg.behavior !== "allow" && msg.behavior !== "deny") bad("behavior must be allow|deny")
      if (msg.always !== undefined && typeof msg.always !== "boolean") bad("always must be boolean")
      if (msg.message !== undefined) str(msg.message, "message", 4_000)
      if (msg.updatedInput !== undefined && (typeof msg.updatedInput !== "object" || msg.updatedInput === null || Array.isArray(msg.updatedInput))) {
        bad("updatedInput must be an object")
      }
      break
    default:
      bad(`unknown type "${msg.type}"`)
  }
  return msg as ClientMessage
}

function optCap(val: unknown, max: number, integer: boolean): number | null | undefined {
  if (val === null) return null
  if (typeof val !== "number" || !Number.isFinite(val)) return undefined
  if (val <= 0) return null
  const v = Math.min(max, val)
  return integer ? Math.round(v) : v
}

/** Sanitized partial config: only known, client-settable keys with valid values. projectDir is never client-settable. */
export function validateConfigPatch(patch: unknown): Partial<StudioConfig> {
  const out: Partial<StudioConfig> = {}
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out
  const p = patch as Record<string, unknown>
  if (typeof p.model === "string" && p.model.length <= 200) out.model = p.model
  if (typeof p.effort === "string" && EFFORT_LEVELS.includes(p.effort as EffortLevel)) out.effort = p.effort as EffortLevel
  if (typeof p.permissionMode === "string" && PERMISSION_MODES.includes(p.permissionMode as PermissionMode)) {
    out.permissionMode = p.permissionMode as PermissionMode
  }
  if (typeof p.systemPromptAppend === "string" && p.systemPromptAppend.length <= 50_000) out.systemPromptAppend = p.systemPromptAppend
  if ("maxBudgetUsd" in p) {
    const v = optCap(p.maxBudgetUsd, 10_000, false)
    if (v !== undefined) out.maxBudgetUsd = v
  }
  if ("maxTurns" in p) {
    const v = optCap(p.maxTurns, 10_000, true)
    if (v !== undefined) out.maxTurns = v
  }
  return out
}

export function mergeConfig(base: StudioConfig, patch: Partial<StudioConfig>): StudioConfig {
  return { ...base, ...validateConfigPatch(patch) }
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
