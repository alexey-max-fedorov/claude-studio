/*
 * Hand-written runtime shape checks for every ServerMessage / ChatItem /
 * LiveEvent variant in protocol/src/protocol.ts (v3).
 *
 * The validator tables are keyed by the protocol's own discriminant unions, so
 * adding or removing a variant in protocol.ts breaks `tsc --noEmit` here until
 * the checks are updated.
 *
 * Result: `errors` = contract violations (missing/mistyped fields, unknown
 * kinds). `warnings` = extra keys not in the contract (drift, not fatal).
 */
import type { ChatItem, LiveEvent, ServerMessage, SessionSummary } from "../../protocol/src/protocol.js"
import type { PermissionMode } from "../../protocol/src/config.js"

export interface ShapeReport {
  errors: string[]
  warnings: string[]
}

type Checker = (v: Record<string, unknown>, path: string, r: ShapeReport) => void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Exhaustive key lists. `satisfies` makes tsc fail when the protocol adds/removes a variant.
const PERMISSION_MODES = {
  default: 1,
  acceptEdits: 1,
  plan: 1,
  bypassPermissions: 1,
  auto: 1,
  dontAsk: 1,
} satisfies Record<PermissionMode, 1>
const EFFORTS = new Set(["", "low", "medium", "high", "xhigh", "max"])
const ATTACHMENT_TYPES = new Set(["page", "selection", "page_text", "screenshot", "element"])

// ---------------------------------------------------------------------------
// field helpers
// ---------------------------------------------------------------------------
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function req(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): unknown {
  if (!(key in o) || o[key] === undefined) {
    r.errors.push(`${path}.${key} missing`)
    return undefined
  }
  return o[key]
}

function str(o: Record<string, unknown>, key: string, path: string, r: ShapeReport, opts: { nonEmpty?: boolean; optional?: boolean } = {}): void {
  if (opts.optional && (!(key in o) || o[key] === undefined)) return
  const v = req(o, key, path, r)
  if (v === undefined) return
  if (typeof v !== "string") r.errors.push(`${path}.${key} must be string, got ${typeof v}`)
  else if (opts.nonEmpty && v.length === 0) r.errors.push(`${path}.${key} must be non-empty`)
}

function num(o: Record<string, unknown>, key: string, path: string, r: ShapeReport, opts: { optional?: boolean; int?: boolean; min?: number } = {}): void {
  if (opts.optional && (!(key in o) || o[key] === undefined)) return
  const v = req(o, key, path, r)
  if (v === undefined) return
  if (typeof v !== "number" || !Number.isFinite(v)) r.errors.push(`${path}.${key} must be a finite number, got ${JSON.stringify(v)}`)
  else if (opts.int && !Number.isInteger(v)) r.errors.push(`${path}.${key} must be an integer`)
  else if (opts.min !== undefined && v < opts.min) r.errors.push(`${path}.${key} must be >= ${opts.min}`)
}

function bool(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): void {
  const v = req(o, key, path, r)
  if (v === undefined) return
  if (typeof v !== "boolean") r.errors.push(`${path}.${key} must be boolean, got ${typeof v}`)
}

function obj(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): Record<string, unknown> | undefined {
  const v = req(o, key, path, r)
  if (v === undefined) return undefined
  if (!isObj(v)) {
    r.errors.push(`${path}.${key} must be an object`)
    return undefined
  }
  return v
}

function arr(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): unknown[] | undefined {
  const v = req(o, key, path, r)
  if (v === undefined) return undefined
  if (!Array.isArray(v)) {
    r.errors.push(`${path}.${key} must be an array`)
    return undefined
  }
  return v
}

function oneOf(o: Record<string, unknown>, key: string, allowed: Set<string> | Record<string, unknown>, path: string, r: ShapeReport): void {
  const v = req(o, key, path, r)
  if (v === undefined) return
  const ok = allowed instanceof Set ? allowed.has(v as string) : typeof v === "string" && Object.prototype.hasOwnProperty.call(allowed, v)
  if (!ok) r.errors.push(`${path}.${key} has unexpected value ${JSON.stringify(v)}`)
}

function nullableStr(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): void {
  if (!(key in o)) {
    r.errors.push(`${path}.${key} missing (must be string or null)`)
    return
  }
  const v = o[key]
  if (v !== null && typeof v !== "string") r.errors.push(`${path}.${key} must be string or null`)
}

function nullableNum(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): void {
  if (!(key in o)) {
    r.errors.push(`${path}.${key} missing (must be number or null)`)
    return
  }
  const v = o[key]
  if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) r.errors.push(`${path}.${key} must be number or null`)
}

function uuid(o: Record<string, unknown>, key: string, path: string, r: ShapeReport): void {
  const v = req(o, key, path, r)
  if (v === undefined) return
  if (typeof v !== "string" || !UUID_RE.test(v)) r.errors.push(`${path}.${key} must be a UUID, got ${JSON.stringify(v)}`)
}

function extraKeys(o: Record<string, unknown>, allowed: string[], path: string, r: ShapeReport): void {
  const set = new Set(allowed)
  for (const k of Object.keys(o)) if (!set.has(k)) r.warnings.push(`${path}.${k} is not in the protocol`)
}

// ---------------------------------------------------------------------------
// shared sub-shapes
// ---------------------------------------------------------------------------
function checkUsage(o: Record<string, unknown>, path: string, r: ShapeReport): void {
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) num(o, k, path, r, { min: 0 })
  extraKeys(o, ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"], path, r)
}

function checkStudioConfig(o: Record<string, unknown>, path: string, r: ShapeReport): void {
  str(o, "projectDir", path, r)
  str(o, "model", path, r)
  oneOf(o, "effort", EFFORTS, path, r)
  oneOf(o, "permissionMode", PERMISSION_MODES, path, r)
  str(o, "systemPromptAppend", path, r)
  nullableNum(o, "maxBudgetUsd", path, r)
  nullableNum(o, "maxTurns", path, r)
  extraKeys(o, ["projectDir", "model", "effort", "permissionMode", "systemPromptAppend", "maxBudgetUsd", "maxTurns"], path, r)
}

function checkSessionSummary(o: Record<string, unknown>, path: string, r: ShapeReport): void {
  uuid(o, "sessionId", path, r)
  str(o, "title", path, r)
  num(o, "lastModified", path, r)
  str(o, "gitBranch", path, r, { optional: true })
  bool(o, "live", path, r)
  bool(o, "running", path, r)
  extraKeys(o, ["sessionId", "title", "lastModified", "gitBranch", "live", "running"] satisfies (keyof SessionSummary)[], path, r)
}

function checkPermissionRequest(o: Record<string, unknown>, path: string, r: ShapeReport): void {
  str(o, "requestId", path, r, { nonEmpty: true })
  str(o, "toolName", path, r, { nonEmpty: true })
  obj(o, "input", path, r)
  str(o, "title", path, r, { optional: true })
  str(o, "blockedPath", path, r, { optional: true })
  bool(o, "canAlwaysAllow", path, r)
  extraKeys(o, ["kind", "requestId", "toolName", "input", "title", "blockedPath", "canAlwaysAllow"], path, r)
}

// ---------------------------------------------------------------------------
// ChatItem
// ---------------------------------------------------------------------------
const CHAT_ITEM_CHECKS: { [K in ChatItem["kind"]]: Checker } = {
  user: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    num(o, "ts", p, r)
    const atts = arr(o, "attachments", p, r)
    atts?.forEach((a, i) => {
      const ap = `${p}.attachments[${i}]`
      if (!isObj(a)) return void r.errors.push(`${ap} must be an object`)
      oneOf(a, "type", ATTACHMENT_TYPES, ap, r)
      str(a, "label", ap, r)
      extraKeys(a, ["type", "label"], ap, r)
    })
    extraKeys(o, ["kind", "id", "text", "attachments", "ts"], p, r)
  },
  assistant: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    num(o, "ts", p, r)
    extraKeys(o, ["kind", "id", "text", "ts"], p, r)
  },
  thinking: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    num(o, "ts", p, r)
    extraKeys(o, ["kind", "id", "text", "ts"], p, r)
  },
  tool_use: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "name", p, r, { nonEmpty: true })
    obj(o, "input", p, r)
    num(o, "ts", p, r)
    nullableStr(o, "parentToolUseId", p, r)
    extraKeys(o, ["kind", "id", "name", "input", "ts", "parentToolUseId"], p, r)
  },
  tool_result: (o, p, r) => {
    str(o, "toolUseId", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    bool(o, "isError", p, r)
    num(o, "ts", p, r)
    extraKeys(o, ["kind", "toolUseId", "text", "isError", "ts"], p, r)
  },
  result: (o, p, r) => {
    num(o, "ts", p, r)
    bool(o, "isError", p, r)
    str(o, "errorText", p, r, { optional: true })
    num(o, "durationMs", p, r, { min: 0 })
    num(o, "turns", p, r, { min: 0 })
    num(o, "costUsd", p, r, { min: 0 })
    const u = obj(o, "usage", p, r)
    if (u) checkUsage(u, `${p}.usage`, r)
    extraKeys(o, ["kind", "ts", "isError", "errorText", "durationMs", "turns", "costUsd", "usage"], p, r)
  },
  error: (o, p, r) => {
    str(o, "text", p, r)
    num(o, "ts", p, r)
    extraKeys(o, ["kind", "text", "ts"], p, r)
  },
  system: (o, p, r) => {
    str(o, "text", p, r)
    num(o, "ts", p, r)
    extraKeys(o, ["kind", "text", "ts"], p, r)
  },
}

export function checkChatItem(v: unknown, path: string, r: ShapeReport): void {
  if (!isObj(v)) return void r.errors.push(`${path} must be an object`)
  const kind = v.kind
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(CHAT_ITEM_CHECKS, kind)) {
    return void r.errors.push(`${path}.kind unknown ChatItem kind ${JSON.stringify(kind)}`)
  }
  CHAT_ITEM_CHECKS[kind as ChatItem["kind"]](v, `${path}<${kind}>`, r)
}

// ---------------------------------------------------------------------------
// LiveEvent
// ---------------------------------------------------------------------------
const LIVE_EVENT_CHECKS: { [K in LiveEvent["kind"]]: Checker } = {
  item: (o, p, r) => {
    checkChatItem(req(o, "item", p, r), `${p}.item`, r)
    extraKeys(o, ["kind", "item"], p, r)
  },
  text_delta: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    extraKeys(o, ["kind", "id", "text"], p, r)
  },
  thinking_delta: (o, p, r) => {
    str(o, "id", p, r, { nonEmpty: true })
    str(o, "text", p, r)
    extraKeys(o, ["kind", "id", "text"], p, r)
  },
  status: (o, p, r) => {
    oneOf(o, "state", new Set(["starting", "running", "idle"]), p, r)
    extraKeys(o, ["kind", "state"], p, r)
  },
  permission_request: (o, p, r) => checkPermissionRequest(o, p, r),
  permission_resolved: (o, p, r) => {
    str(o, "requestId", p, r, { nonEmpty: true })
    oneOf(o, "behavior", new Set(["allow", "deny"]), p, r)
    extraKeys(o, ["kind", "requestId", "behavior"], p, r)
  },
}

export function checkLiveEvent(v: unknown, path: string, r: ShapeReport): void {
  if (!isObj(v)) return void r.errors.push(`${path} must be an object`)
  const kind = v.kind
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(LIVE_EVENT_CHECKS, kind)) {
    return void r.errors.push(`${path}.kind unknown LiveEvent kind ${JSON.stringify(kind)}`)
  }
  LIVE_EVENT_CHECKS[kind as LiveEvent["kind"]](v, `${path}<${kind}>`, r)
}

// ---------------------------------------------------------------------------
// ServerMessage
// ---------------------------------------------------------------------------
const SERVER_MESSAGE_CHECKS: { [K in ServerMessage["type"]]: Checker } = {
  hello: (o, p, r) => {
    str(o, "serverVersion", p, r, { nonEmpty: true })
    num(o, "protocol", p, r, { int: true })
    str(o, "projectDir", p, r, { nonEmpty: true })
    extraKeys(o, ["type", "serverVersion", "protocol", "projectDir"], p, r)
  },
  pong: (o, p, r) => extraKeys(o, ["type"], p, r),
  config_state: (o, p, r) => {
    const c = obj(o, "config", p, r)
    if (c) checkStudioConfig(c, `${p}.config`, r)
    arr(o, "models", p, r)?.forEach((m, i) => {
      const mp = `${p}.models[${i}]`
      if (!isObj(m)) return void r.errors.push(`${mp} must be an object`)
      str(m, "value", mp, r)
      str(m, "displayName", mp, r)
      str(m, "description", mp, r)
      extraKeys(m, ["value", "displayName", "description"], mp, r)
    })
    arr(o, "commands", p, r)?.forEach((c2, i) => {
      const cp = `${p}.commands[${i}]`
      if (!isObj(c2)) return void r.errors.push(`${cp} must be an object`)
      str(c2, "name", cp, r, { nonEmpty: true })
      str(c2, "description", cp, r)
      str(c2, "argumentHint", cp, r)
      extraKeys(c2, ["name", "description", "argumentHint"], cp, r)
    })
    arr(o, "permissionModes", p, r)?.forEach((m, i) => {
      if (typeof m !== "string" || !Object.prototype.hasOwnProperty.call(PERMISSION_MODES, m)) r.errors.push(`${p}.permissionModes[${i}] unexpected ${JSON.stringify(m)}`)
    })
    extraKeys(o, ["type", "config", "models", "commands", "permissionModes"], p, r)
  },
  config_error: (o, p, r) => {
    str(o, "error", p, r, { nonEmpty: true })
    extraKeys(o, ["type", "error"], p, r)
  },
  session_list: (o, p, r) => {
    arr(o, "sessions", p, r)?.forEach((s, i) => {
      if (!isObj(s)) return void r.errors.push(`${p}.sessions[${i}] must be an object`)
      checkSessionSummary(s, `${p}.sessions[${i}]`, r)
    })
    num(o, "offset", p, r, { int: true, min: 0 })
    bool(o, "hasMore", p, r)
    extraKeys(o, ["type", "sessions", "offset", "hasMore"], p, r)
  },
  session_history: (o, p, r) => {
    uuid(o, "sessionId", p, r)
    arr(o, "items", p, r)?.forEach((it, i) => checkChatItem(it, `${p}.items[${i}]`, r))
    bool(o, "running", p, r)
    arr(o, "pending", p, r)?.forEach((ev, i) => {
      const ep = `${p}.pending[${i}]`
      if (!isObj(ev)) return void r.errors.push(`${ep} must be an object`)
      if (ev.kind !== "permission_request") r.errors.push(`${ep}.kind must be "permission_request", got ${JSON.stringify(ev.kind)}`)
      checkPermissionRequest(ev, ep, r)
    })
    extraKeys(o, ["type", "sessionId", "items", "running", "pending"], p, r)
  },
  event: (o, p, r) => {
    uuid(o, "sessionId", p, r)
    checkLiveEvent(req(o, "event", p, r), `${p}.event`, r)
    extraKeys(o, ["type", "sessionId", "event"], p, r)
  },
  error: (o, p, r) => {
    str(o, "error", p, r, { nonEmpty: true })
    if ("sessionId" in o && o.sessionId !== undefined) uuid(o, "sessionId", p, r)
    extraKeys(o, ["type", "error", "sessionId"], p, r)
  },
}

/** Validate one decoded server frame. Never throws. */
export function validateServerMessage(v: unknown): ShapeReport {
  const r: ShapeReport = { errors: [], warnings: [] }
  if (!isObj(v)) {
    r.errors.push("message must be a JSON object")
    return r
  }
  const type = v.type
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(SERVER_MESSAGE_CHECKS, type)) {
    r.errors.push(`unknown ServerMessage type ${JSON.stringify(type)}`)
    return r
  }
  SERVER_MESSAGE_CHECKS[type as ServerMessage["type"]](v, type, r)
  return r
}
