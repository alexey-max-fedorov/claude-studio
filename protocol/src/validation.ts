import type { ClientMessage, ServerMessage } from "./protocol.js"
import type { StudioConfig, PermissionMode, EffortLevel } from "./config.js"
import { EFFORT_LEVELS } from "./config.js"

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
    if (k.length > MAX_SHORT_STR_LEN) throw new Error(`Invalid message: ${field} key exceeds max length`)
    assertStr(v, `${field}["${k}"]`, MAX_ELEMENT_STR_LEN)
  }
  return val as Record<string, string>
}

export function parseClientMessage(raw: string): ClientMessage {
  const msg = JSON.parse(raw)
  if (!msg || typeof msg.type !== "string") throw new Error("Invalid message: missing type field")
  switch (msg.type) {
    case "prompt": {
      assertStr(msg.route, "route", MAX_ROUTE_LEN)
      if (msg.url !== undefined) assertStr(msg.url, "url", MAX_ROUTE_LEN)
      assertStr(msg.prompt, "prompt", MAX_PROMPT_LEN)
      if (!msg.element || typeof msg.element !== "object") throw new Error("Invalid message: element must be an object")
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
    case "set_config":
      if (!msg.patch || typeof msg.patch !== "object" || Array.isArray(msg.patch)) {
        throw new Error("Invalid message: patch must be an object")
      }
      break
    case "ping":
    case "reset_session":
    case "interrupt":
    case "get_config":
    case "query_capabilities":
      break
    default:
      throw new Error(`Invalid message: unknown type "${msg.type}"`)
  }
  return msg as ClientMessage
}

const PERMISSION_MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "bypassPermissions"]

function num(val: unknown): number | undefined {
  const n = typeof val === "number" ? val : typeof val === "string" ? Number(val) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** Returns a sanitized partial config: only known keys, correct types, clamped ranges. */
export function validateConfigPatch(patch: unknown): Partial<StudioConfig> {
  const out: Partial<StudioConfig> = {}
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out
  const p = patch as Record<string, unknown>

  if (typeof p.model === "string" && p.model.length <= MAX_SHORT_STR_LEN) out.model = p.model
  if (typeof p.effort === "string" && EFFORT_LEVELS.includes(p.effort as EffortLevel)) {
    out.effort = p.effort as EffortLevel
  }
  if (typeof p.projectDir === "string" && p.projectDir.length <= MAX_ROUTE_LEN) out.projectDir = p.projectDir
  if (typeof p.systemPromptAppend === "string" && p.systemPromptAppend.length <= MAX_PROMPT_LEN) {
    out.systemPromptAppend = p.systemPromptAppend
  }
  if (typeof p.allowBash === "boolean") out.allowBash = p.allowBash
  if (typeof p.routeHints === "boolean") out.routeHints = p.routeHints

  const mt = num(p.maxTurns)
  if (mt !== undefined) out.maxTurns = Math.max(1, Math.min(100, Math.round(mt)))
  const mb = num(p.maxBudgetUsd)
  if (mb !== undefined) out.maxBudgetUsd = Math.max(0, Math.min(1000, mb))

  if (typeof p.permissionMode === "string" && PERMISSION_MODES.includes(p.permissionMode as PermissionMode)) {
    out.permissionMode = p.permissionMode as PermissionMode
  }
  if (Array.isArray(p.enabledPlugins)) {
    out.enabledPlugins = p.enabledPlugins.filter((x) => typeof x === "string").slice(0, MAX_LIST_LEN) as string[]
  }
  if (Array.isArray(p.enabledSkills)) {
    out.enabledSkills = p.enabledSkills.filter((x) => typeof x === "string").slice(0, MAX_LIST_LEN) as string[]
  }
  return out
}

export function mergeConfig(base: StudioConfig, patch: Partial<StudioConfig>): StudioConfig {
  return { ...base, ...validateConfigPatch(patch) }
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
