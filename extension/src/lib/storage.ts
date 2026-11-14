import type { Attachment } from "@claude-studio/protocol"

/*
 * chrome.storage helpers. local = durable panel state; session = pending attachments
 * queued by the background (context menu, element picker) for a window's panel.
 */

export const DEFAULT_SERVER_URL = "ws://127.0.0.1:7281"

export const KEYS = {
  serverUrl: "serverUrl",
  /** Global fallback; the per-window key is `${currentSession}:${windowId}`. */
  currentSession: "currentSessionId",
  sessionStarted: "currentSessionStarted",
  sentHistory: "sentHistory",
  draftPrefix: "draft:",
  pending: "pendingAttachments",
} as const

/** Pending attachments (background writes, panel consumes): protocol Attachment plus an optional target window. */
export type PendingAttachment = Attachment & { windowId?: number }

function hasChrome(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage
}

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  if (!hasChrome()) return fallback
  try {
    const r = await chrome.storage.local.get(key)
    return (r[key] as T) ?? fallback
  } catch {
    return fallback
  }
}

export async function setLocal(values: Record<string, unknown>): Promise<void> {
  if (!hasChrome()) return
  try {
    await chrome.storage.local.set(values)
  } catch {
    /* quota or context gone */
  }
}

export async function removeLocal(keys: string | string[]): Promise<void> {
  if (!hasChrome()) return
  try {
    await chrome.storage.local.remove(keys)
  } catch {
    /* ignore */
  }
}

/**
 * Take this window's pending attachments (targeted at it, or untargeted). The background
 * is the only writer of the queue, so this asks it to remove and return them.
 */
export async function takePending(windowId: number): Promise<Attachment[]> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return []
  try {
    const res = await chrome.runtime.sendMessage({ action: "take-pending", windowId })
    return Array.isArray(res) ? (res as Attachment[]) : []
  } catch {
    return []
  }
}

/** Per-window key with the global key as fallback for windows that have none yet. */
export function windowKey(base: string, windowId: number | null): string {
  return windowId == null ? base : `${base}:${windowId}`
}

export async function getWindowScoped<T>(base: string, windowId: number | null, fallback: T): Promise<T> {
  if (windowId != null) {
    const v = await getLocal<T | undefined>(windowKey(base, windowId), undefined)
    if (v !== undefined) return v
  }
  return getLocal<T>(base, fallback)
}

export function windowScoped(base: string, windowId: number | null, value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { [base]: value }
  if (windowId != null) out[windowKey(base, windowId)] = value
  return out
}
