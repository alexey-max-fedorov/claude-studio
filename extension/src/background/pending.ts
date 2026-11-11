import type { Attachment } from "@claude-studio/protocol"

/*
 * Pure helpers for the "pendingAttachments" queue in chrome.storage.session.
 * The background appends (context menu, element picker); the side panel takes the
 * entries for its window (see lib/storage.ts takePending).
 */

export const PENDING_KEY = "pendingAttachments"
export const MAX_PENDING = 20

export type PendingAttachment = Attachment & { windowId?: number }

const TYPES = new Set(["page", "selection", "page_text", "screenshot", "element"])

export function isAttachmentLike(v: unknown): v is Attachment {
  if (!v || typeof v !== "object") return false
  const a = v as Record<string, unknown>
  if (typeof a.type !== "string" || !TYPES.has(a.type)) return false
  if (typeof a.url !== "string") return false
  if (a.title !== undefined && typeof a.title !== "string") return false
  switch (a.type) {
    case "selection":
    case "page_text":
      return typeof a.text === "string"
    case "screenshot":
      return typeof a.dataUrl === "string"
    case "element":
      return !!a.element && typeof a.element === "object" && typeof (a.element as Record<string, unknown>).tagName === "string"
    default:
      return true
  }
}

function sameAttachment(a: PendingAttachment, b: PendingAttachment): boolean {
  if (a.type !== b.type || a.url !== b.url || a.windowId !== b.windowId) return false
  switch (a.type) {
    case "selection":
    case "page_text":
      return a.text === (b as typeof a).text
    case "screenshot":
      return a.dataUrl === (b as typeof a).dataUrl
    case "element":
      return a.element.cssSelector === (b as typeof a).element.cssSelector
    default:
      return true
  }
}

/**
 * Return a new queue with `item` appended. Drops malformed entries already stored,
 * removes an identical earlier entry (double clicks), and keeps the newest `max`.
 */
export function appendPending(current: unknown, item: PendingAttachment, max = MAX_PENDING): PendingAttachment[] {
  const list = Array.isArray(current) ? (current.filter(isAttachmentLike) as PendingAttachment[]) : []
  const next = list.filter((p) => !sameAttachment(p, item))
  next.push(item)
  return next.slice(-max)
}

/**
 * Split the queue for a panel: entries targeted at `windowId` plus untargeted ones go to the
 * panel (windowId stripped), the rest stay queued.
 */
export function takeForWindow(current: unknown, windowId: number): { mine: Attachment[]; rest: PendingAttachment[] } {
  const list = Array.isArray(current) ? (current.filter(isAttachmentLike) as PendingAttachment[]) : []
  const mine: Attachment[] = []
  const rest: PendingAttachment[] = []
  for (const p of list) {
    if (p.windowId === undefined || p.windowId === windowId) {
      const { windowId: _w, ...a } = p
      mine.push(a as Attachment)
    } else rest.push(p)
  }
  return { mine, rest }
}

/** Attach the target window (if known) to an attachment. */
export function withWindow(a: Attachment, windowId: number | undefined): PendingAttachment {
  return typeof windowId === "number" && windowId >= 0 ? { ...a, windowId } : { ...a }
}
