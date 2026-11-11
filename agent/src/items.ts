import type { ChatItem, Usage } from "@claude-studio/protocol"

/*
 * Helpers shared by the live stream mapper and the history converter, so live
 * events and reloaded history produce identical ChatItems.
 *
 * Id rules:
 *   assistant / thinking items: `${message.id}:${n}` where n is the position of
 *     the block within that API message (same as the stream content_block index).
 *   tool_use items: the real tool_use block id (toolu_...).
 *   tool_result items: toolUseId = that same toolu id.
 */

export const TOOL_RESULT_MAX = 20_000

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n[truncated, ${s.length - max} more chars]`
}

/** Flatten tool_result content (string or block array) to display text. */
export function flattenToolResultContent(content: unknown): string {
  if (typeof content === "string") return truncate(content, TOOL_RESULT_MAX)
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const b of content) {
    if (!b || typeof b !== "object") continue
    const blk = b as Record<string, unknown>
    if (blk.type === "text" && typeof blk.text === "string") parts.push(blk.text)
    else if (blk.type === "image") parts.push("[image]")
    else if (blk.type === "document") parts.push("[document]")
    else if (typeof blk.type === "string") parts.push(`[${blk.type}]`)
  }
  return truncate(parts.join("\n"), TOOL_RESULT_MAX)
}

/** tool_result items from a user message's content (empty for anything else). */
export function toolResultItems(content: unknown, ts: number): ChatItem[] {
  if (!Array.isArray(content)) return []
  const out: ChatItem[] = []
  for (const b of content) {
    if (b && typeof b === "object" && (b as any).type === "tool_result") {
      out.push({
        kind: "tool_result",
        toolUseId: String((b as any).tool_use_id ?? ""),
        text: flattenToolResultContent((b as any).content),
        isError: (b as any).is_error === true,
        ts,
      })
    }
  }
  return out
}

/**
 * One assistant content block to a ChatItem. `blockId` is used for text and
 * thinking; tool_use uses its own id. Returns null for block types we do not render.
 * Subagent (parentToolUseId != null) text/thinking is skipped.
 */
export function assistantBlockToItem(block: any, blockId: string, parentToolUseId: string | null, ts: number): ChatItem | null {
  if (!block || typeof block !== "object") return null
  switch (block.type) {
    case "text":
      if (parentToolUseId) return null
      return { kind: "assistant", id: blockId, text: String(block.text ?? ""), ts }
    case "thinking":
      // Empty thinking text = the model's thinking display is omitted; nothing to show.
      if (parentToolUseId || !block.thinking) return null
      return { kind: "thinking", id: blockId, text: String(block.thinking), ts }
    case "redacted_thinking":
      if (parentToolUseId) return null
      return { kind: "thinking", id: blockId, text: "[redacted thinking]", ts }
    case "tool_use":
    case "server_tool_use":
    case "mcp_tool_use":
      return {
        kind: "tool_use",
        id: String(block.id ?? blockId),
        name: String(block.name ?? "tool"),
        input: block.input && typeof block.input === "object" && !Array.isArray(block.input) ? block.input : {},
        ts,
        parentToolUseId,
      }
    default:
      return null
  }
}

export function toUsage(u: any): Usage {
  return {
    input_tokens: Number(u?.input_tokens ?? 0),
    output_tokens: Number(u?.output_tokens ?? 0),
    cache_read_input_tokens: Number(u?.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: Number(u?.cache_creation_input_tokens ?? 0),
  }
}

export function resultErrorText(msg: any): string | undefined {
  // "[ede_diagnostic] ..." entries are internal CLI diagnostics, not user-facing errors.
  const errors = Array.isArray(msg?.errors)
    ? msg.errors.filter((e: unknown) => typeof e === "string" && e && !e.startsWith("[ede_diagnostic]")).join("; ")
    : ""
  switch (msg?.subtype) {
    case "success":
      return msg.is_error === true ? (typeof msg.result === "string" && msg.result) || "The turn ended with an API error." : undefined
    case "error_max_budget_usd":
      return "Stopped: reached the max budget cap for this turn."
    case "error_max_turns":
      return `Stopped: reached the max turns limit${typeof msg.num_turns === "number" ? ` (${msg.num_turns} turns)` : ""}.`
    case "error_max_structured_output_retries":
      return "Stopped: structured output retries exhausted."
    case "error_during_execution":
      return errors ? `Stopped: ${errors}` : "Stopped (interrupted or an error occurred during execution)."
    default:
      return errors || `The turn ended with an error (${String(msg?.subtype ?? "unknown")}).`
  }
}

/** Parse an ISO timestamp, falling back to `fallback`. */
export function tsOf(iso: unknown, fallback: number): number {
  if (typeof iso !== "string") return fallback
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : fallback
}
