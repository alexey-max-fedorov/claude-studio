import type { Attachment, ClientMessage } from "@claude-studio/protocol"
import { parseClientMessage } from "@claude-studio/protocol"
import { formatBytes } from "./format"

/*
 * Outgoing messages: validate locally with the same validator the agent uses, and keep each
 * WebSocket frame under the agent's payload limit (16 MiB; the socket closes above it).
 */

export const MAX_FRAME_BYTES = 15 * 1024 * 1024
/** How long to wait for the agent to echo a sent user message before offering Retry. */
export const ECHO_TIMEOUT_MS = 15_000

export type Prepared = { ok: true; json: string; bytes: number } | { ok: false; error: string }

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function prepareMessage(msg: ClientMessage): Prepared {
  const json = JSON.stringify(msg)
  try {
    parseClientMessage(json)
  } catch (e) {
    const why = (e instanceof Error ? e.message : String(e)).replace(/^Invalid message:\s*/, "")
    return { ok: false, error: `Can't send this message: ${why}.` }
  }
  const bytes = byteLength(json)
  if (bytes > MAX_FRAME_BYTES) {
    return {
      ok: false,
      error: `Message is too large to send (${formatBytes(bytes)}, limit ${formatBytes(MAX_FRAME_BYTES)}). Remove a screenshot or the page text.`,
    }
  }
  return { ok: true, json, bytes }
}

export function prepareSend(sessionId: string, text: string, attachments: Attachment[]): Prepared {
  return prepareMessage({ type: "send", sessionId, text, attachments })
}

/** Put undelivered message texts back in front of whatever is in the composer. */
export function restoreDraft(current: string, texts: string[]): string {
  return [...texts, current].map((t) => t.trim()).filter(Boolean).join("\n\n")
}
