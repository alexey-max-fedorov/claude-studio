import type { AttachmentSummary, ChatItem, LiveEvent, ServerMessage, Usage } from "@claude-studio/protocol"

/*
 * Transcript view state for one conversation, plus a pure reducer that applies
 * protocol history / live events to it. No React, no chrome APIs: fully unit-tested.
 *
 * Id assumptions (agent contract):
 *   - assistant / thinking ids are `${messageId}:${index}`; text_delta / thinking_delta
 *     carry the same id, and the final `item` with that id replaces the streamed text.
 *   - items are upserted by id: session_history and live events overlap. On a mid-turn
 *     reopen, history carries the in-progress block as an item with partial text; later
 *     deltas for that id append to it (no catch-up deltas are sent). Only a final LIVE item
 *     closes a block for further deltas (tracked in `finalIds`).
 *   - the user item is echoed back to the sender; it replaces the optimistic bubble. A local
 *     bubble only matches a server user item with the same text that is not older than it
 *     (minus clock skew), so an earlier identical message never swallows a pending one.
 *   - tool_use ids are the real Anthropic `toolu_...` ids, so tool_result.toolUseId and
 *     subagent parentToolUseId match exactly. A result with no matching tool_use is shown
 *     as its own row (never guessed onto another call).
 */

export type PermissionRequest = Extract<LiveEvent, { kind: "permission_request" }>
export type RunStatus = "idle" | "starting" | "running"

export interface ToolResultView {
  text: string
  isError: boolean
  ts: number
}

export type Row =
  | {
      kind: "user"
      id: string
      text: string
      attachments: AttachmentSummary[]
      ts: number
      /** Optimistic bubble for a message this panel sent; cleared when the agent echoes it. */
      local?: boolean
      /** Client nonce of the pending send (local bubbles only). */
      nonce?: string
      /** No echo arrived in time; the panel offers Retry. */
      failed?: boolean
    }
  | { kind: "assistant"; id: string; text: string; ts: number; streaming: boolean }
  | { kind: "thinking"; id: string; text: string; ts: number; streaming: boolean }
  | {
      kind: "tool"
      id: string
      name: string
      input: Record<string, unknown>
      ts: number
      parentToolUseId: string | null
      result?: ToolResultView
    }
  /** A tool_result we could not attach to any tool_use. */
  | { kind: "orphan_result"; id: string; toolUseId: string; text: string; isError: boolean; ts: number }
  | {
      kind: "result"
      id: string
      ts: number
      isError: boolean
      errorText?: string
      durationMs: number
      turns: number
      costUsd: number
      usage: Usage
    }
  | { kind: "error"; id: string; text: string; ts: number }
  | { kind: "system"; id: string; text: string; ts: number }

export interface TranscriptState {
  sessionId: string | null
  rows: Row[]
  status: RunStatus
  permissions: PermissionRequest[]
  /** True once session_history arrived (or the conversation is known to be new). */
  loaded: boolean
  /** Monotonic counter for synthesized row ids. */
  seq: number
  /** assistant/thinking ids whose final text arrived as a live item; later deltas for them are ignored. */
  finalIds: string[]
  snapshotSequence: number
  historyPending: boolean
  pendingEvents: Extract<TranscriptAction, { type: "event" }>[]
}

export type TranscriptAction =
  | { type: "reset"; sessionId: string | null; loaded?: boolean }
  | { type: "history"; msg: Extract<ServerMessage, { type: "session_history" }> }
  | { type: "begin_history" }
  | { type: "event"; sessionId: string; event: LiveEvent; sequence?: number }
  | { type: "local_user"; nonce: string; text: string; attachments: AttachmentSummary[]; ts: number }
  /** Mark a local bubble failed (no echo) or pending again (retry). */
  | { type: "local_status"; nonce: string; failed: boolean; ts?: number }
  /** Remove a local bubble (its text went back into the composer). */
  | { type: "local_remove"; nonce: string }
  | { type: "local_error"; text: string; ts: number }

export function initialTranscript(sessionId: string | null = null): TranscriptState {
  return { sessionId, rows: [], status: "idle", permissions: [], loaded: false, seq: 0, finalIds: [], snapshotSequence: 0, historyPending: false, pendingEvents: [] }
}

// ---------------------------------------------------------------------------

function findIndexFromEnd<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i
  return -1
}

/** Find the tool row a tool_result belongs to: exact toolu_ id only, else -1. */
export function matchToolRow(rows: Row[], toolUseId: string): number {
  if (!toolUseId) return -1
  return findIndexFromEnd(rows, (r) => r.kind === "tool" && r.id === toolUseId)
}

/** Allowed clock skew between panel and agent timestamps (same machine, but be lenient). */
export const ECHO_SKEW_MS = 5_000

/** True if a server user item (text, ts) can be the echo of this local bubble. */
export function isEchoOf(local: { text: string; ts: number }, item: { text: string; ts: number }): boolean {
  return local.text.trim() === item.text.trim() && (!item.ts || item.ts >= local.ts - ECHO_SKEW_MS)
}

function finalizeStreaming(rows: Row[]): Row[] {
  let changed = false
  const out = rows.map((r) => {
    if ((r.kind === "assistant" || r.kind === "thinking") && r.streaming) {
      changed = true
      return { ...r, streaming: false }
    }
    return r
  })
  return changed ? out : rows
}

/** Apply one ChatItem to rows. Returns new rows and the next seq. */
function applyItem(rows: Row[], seq: number, item: ChatItem): { rows: Row[]; seq: number } {
  switch (item.kind) {
    case "user": {
      // Replace the oldest optimistic local bubble this item can be the echo of.
      const li = rows.findIndex((r) => r.kind === "user" && !!r.local && isEchoOf(r, item))
      const row: Row = { kind: "user", id: item.id, text: item.text, attachments: item.attachments ?? [], ts: item.ts }
      if (li >= 0) {
        const local = rows[li] as Extract<Row, { kind: "user" }>
        if (!item.attachments?.length && local.attachments.length) (row as any).attachments = local.attachments
        const next = rows.slice()
        next[li] = row
        return { rows: next, seq }
      }
      if (rows.some((r) => r.kind === "user" && r.id === item.id)) return { rows, seq }
      return { rows: [...rows, row], seq }
    }
    case "assistant":
    case "thinking": {
      const i = findIndexFromEnd(rows, (r) => r.kind === item.kind && r.id === item.id)
      const row: Row = { kind: item.kind, id: item.id, text: item.text, ts: item.ts, streaming: false }
      if (i >= 0) {
        const next = rows.slice()
        next[i] = row
        return { rows: next, seq }
      }
      return { rows: [...rows, row], seq }
    }
    case "tool_use": {
      const i = findIndexFromEnd(rows, (r) => r.kind === "tool" && r.id === item.id)
      const row: Row = {
        kind: "tool",
        id: item.id,
        name: item.name,
        input: item.input ?? {},
        ts: item.ts,
        parentToolUseId: item.parentToolUseId ?? null,
      }
      if (i >= 0) {
        const prev = rows[i] as Extract<Row, { kind: "tool" }>
        const next = rows.slice()
        next[i] = { ...row, result: prev.result }
        return { rows: next, seq }
      }
      return { rows: [...rows, row], seq }
    }
    case "tool_result": {
      const i = matchToolRow(rows, item.toolUseId)
      const result: ToolResultView = { text: item.text, isError: item.isError, ts: item.ts }
      if (i >= 0) {
        const next = rows.slice()
        next[i] = { ...(rows[i] as Extract<Row, { kind: "tool" }>), result }
        return { rows: next, seq }
      }
      return {
        rows: [...rows, { kind: "orphan_result", id: `r${seq}`, toolUseId: item.toolUseId, text: item.text, isError: item.isError, ts: item.ts }],
        seq: seq + 1,
      }
    }
    case "result":
    case "error":
    case "system": {
      const next = item.kind === "result" ? finalizeStreaming(rows) : rows
      const row: Row = { ...item, id: item.id ?? `r${seq}` }
      const i = item.id ? next.findIndex((r) => r.kind === item.kind && r.id === item.id) : -1
      if (i >= 0) {
        const updated = next.slice()
        updated[i] = row
        return { rows: updated, seq }
      }
      return { rows: [...next, row], seq: item.id ? seq : seq + 1 }
    }
    default:
      return { rows, seq }
  }
}

function applyDelta(rows: Row[], kind: "assistant" | "thinking", id: string, text: string, finalIds: string[]): Row[] {
  if (finalIds.includes(id)) return rows // final text already arrived live; late delta is ignored
  const i = findIndexFromEnd(rows, (r) => r.kind === kind && r.id === id)
  if (i >= 0) {
    // Streaming block, or a partial block from session_history that is still being written.
    const r = rows[i] as Extract<Row, { kind: "assistant" | "thinking" }>
    const next = rows.slice()
    next[i] = { ...r, text: r.text + text, streaming: true }
    return next
  }
  return [...rows, { kind, id, text, ts: Date.now(), streaming: true }]
}

export function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  switch (action.type) {
    case "reset":
      return { ...initialTranscript(action.sessionId), loaded: !!action.loaded }

    case "begin_history":
      return { ...state, snapshotSequence: 0, historyPending: true, pendingEvents: [] }

    case "history": {
      const { msg } = action
      if (state.sessionId && msg.sessionId !== state.sessionId) return state
      let rows: Row[] = []
      let seq = state.seq
      for (const item of msg.items) {
        const r = applyItem(rows, seq, item)
        rows = r.rows
        seq = r.seq
      }
      // Keep optimistic local messages the server has not echoed yet: a history user item only
      // counts as the echo if it is not older than the local bubble, and each item echoes one bubble.
      const used = new Set<string>()
      for (const r of state.rows) {
        if (r.kind !== "user" || !r.local) continue
        const echo = rows.find((x) => x.kind === "user" && !x.local && !used.has(x.id) && isEchoOf(r, x))
        if (echo) used.add(echo.id)
        else rows.push(r)
      }
      const snapshot: TranscriptState = {
        ...state,
        sessionId: msg.sessionId,
        rows,
        seq,
        status: msg.running ? "running" : "idle",
        permissions: msg.pending ?? [],
        loaded: true,
        snapshotSequence: msg.sequence ?? 0,
        historyPending: false,
        pendingEvents: [],
      }
      return state.pendingEvents.reduce((next, event) => transcriptReducer(next, event), snapshot)
    }

    case "event": {
      if (state.sessionId && action.sessionId !== state.sessionId) return state
      if (action.sequence !== undefined && action.sequence <= state.snapshotSequence) return state
      if (state.historyPending && action.sequence !== undefined) {
        const next = transcriptReducer({ ...state, historyPending: false }, action)
        return { ...next, historyPending: true, pendingEvents: [...state.pendingEvents, action] }
      }
      const ev = action.event
      switch (ev.kind) {
        case "item": {
          const r = applyItem(state.rows, state.seq, ev.item)
          const it = ev.item
          const finalIds =
            (it.kind === "assistant" || it.kind === "thinking") && !state.finalIds.includes(it.id) ? [...state.finalIds, it.id].slice(-500) : state.finalIds
          if (r.rows === state.rows && r.seq === state.seq && finalIds === state.finalIds) return state
          return { ...state, rows: r.rows, seq: r.seq, finalIds }
        }
        case "text_delta":
          return { ...state, rows: applyDelta(state.rows, "assistant", ev.id, ev.text, state.finalIds) }
        case "thinking_delta":
          return { ...state, rows: applyDelta(state.rows, "thinking", ev.id, ev.text, state.finalIds) }
        case "status":
          return {
            ...state,
            status: ev.state,
            rows: ev.state === "idle" ? finalizeStreaming(state.rows) : state.rows,
          }
        case "permission_request":
          if (state.permissions.some((p) => p.requestId === ev.requestId)) return state
          return { ...state, permissions: [...state.permissions, ev] }
        case "permission_resolved":
          return { ...state, permissions: state.permissions.filter((p) => p.requestId !== ev.requestId) }
        default:
          return state
      }
    }

    case "local_user":
      return {
        ...state,
        loaded: true,
        rows: [
          ...state.rows,
          { kind: "user", id: `local:${action.nonce}`, nonce: action.nonce, text: action.text, attachments: action.attachments, ts: action.ts, local: true },
        ],
      }

    case "local_status": {
      const i = state.rows.findIndex((r) => r.kind === "user" && r.local && r.nonce === action.nonce)
      if (i < 0) return state
      const rows = state.rows.slice()
      const r = rows[i] as Extract<Row, { kind: "user" }>
      rows[i] = { ...r, failed: action.failed, ts: action.ts ?? r.ts }
      return { ...state, rows }
    }

    case "local_remove": {
      const rows = state.rows.filter((r) => !(r.kind === "user" && r.local && r.nonce === action.nonce))
      return rows.length === state.rows.length ? state : { ...state, rows }
    }

    case "local_error":
      return { ...state, rows: [...state.rows, { kind: "error", id: `r${state.seq}`, text: action.text, ts: action.ts }], seq: state.seq + 1 }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// View helpers

export type ToolRow = Extract<Row, { kind: "tool" }>
export interface ToolNode extends ToolRow {
  children: ToolNode[]
}
export type ViewRow = Exclude<Row, ToolRow> | ToolNode

/**
 * Nest subagent tool calls (parentToolUseId set) under their parent tool row.
 * Tool rows whose parent is unknown stay at top level.
 */
export function buildView(rows: Row[]): ViewRow[] {
  const nodes = new Map<string, ToolNode>()
  const out: ViewRow[] = []
  for (const r of rows) {
    if (r.kind !== "tool") {
      out.push(r)
      continue
    }
    const node: ToolNode = { ...r, children: [] }
    nodes.set(r.id, node)
    const parent = r.parentToolUseId ? nodes.get(r.parentToolUseId) : undefined
    if (parent) parent.children.push(node)
    else out.push(node)
  }
  return out
}
