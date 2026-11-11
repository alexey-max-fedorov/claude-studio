import type { ChatItem, LiveEvent } from "@claude-studio/protocol"
import { assistantBlockToItem, resultErrorText, toolResultItems, toUsage, tsOf } from "./items.js"

type BlockKind = "text" | "thinking" | "tool" | "other"

function kindOf(type: unknown): BlockKind {
  if (type === "text") return "text"
  if (type === "thinking" || type === "redacted_thinking") return "thinking"
  if (type === "tool_use" || type === "server_tool_use" || type === "mcp_tool_use") return "tool"
  return "other"
}

interface MessageState {
  /** Blocks seen in the stream (content_block_start), in index order. */
  stream: { index: number; kind: BlockKind }[]
  claimed: Set<number>
  /** Blocks seen in final assistant messages (fallback position counter). */
  count: number
}

/**
 * Converts one live Claude Code process's SDK message stream into protocol
 * LiveEvents. Stateful (one instance per live query). Pure apart from Date.now().
 */
export class StreamMapper {
  private messages = new Map<string, MessageState>()
  private currentMessageId: string | null = null
  /** Streamed-but-not-finalized text/thinking blocks, so a reopened panel can catch up. */
  private partial = new Map<string, { kind: "text" | "thinking"; text: string }>()
  private lastTotalCost: number | null
  private interrupted = false

  /**
   * @param baseline the process's cumulative cost before this mapper's first
   *   result: 0 for a new session, the last known total for a session resumed
   *   in this daemon, null when unknown (resumed from elsewhere), in which case
   *   the first result reports 0 instead of the whole session's spend.
   */
  constructor(private now: () => number = Date.now, baseline: number | null = 0) {
    this.lastTotalCost = baseline
  }

  /** Latest cumulative cost reported by the process (null before any result when unknown). */
  get totalCost(): number | null {
    return this.lastTotalCost
  }

  private state(id: string): MessageState {
    let s = this.messages.get(id)
    if (!s) {
      s = { stream: [], claimed: new Set(), count: 0 }
      this.messages.set(id, s)
    }
    return s
  }

  /** The user asked to interrupt: the next error result reads "Interrupted by the user." */
  noteInterrupt(): void {
    this.interrupted = true
  }

  /** Text accumulated for blocks still streaming (id, kind, text so far). */
  inFlight(): { id: string; kind: "text" | "thinking"; text: string }[] {
    return [...this.partial].map(([id, v]) => ({ id, ...v }))
  }

  map(msg: any): LiveEvent[] {
    if (!msg || typeof msg !== "object") return []
    switch (msg.type) {
      case "stream_event":
        return msg.parent_tool_use_id ? [] : this.mapStreamEvent(msg.event)
      case "assistant":
        return this.mapAssistant(msg)
      case "user":
        return toolResultItems(msg.message?.content, this.now()).map((item) => ({ kind: "item" as const, item }))
      case "result":
        return [{ kind: "item", item: this.mapResult(msg) }]
      case "system":
        return this.mapSystem(msg)
      default:
        return []
    }
  }

  private mapStreamEvent(ev: any): LiveEvent[] {
    if (!ev || typeof ev !== "object") return []
    if (ev.type === "message_start") {
      const id = ev.message?.id
      if (typeof id === "string") {
        this.currentMessageId = id
        this.state(id)
      }
      return []
    }
    const mid = this.currentMessageId
    if (!mid || typeof ev.index !== "number") return []
    const blockId = `${mid}:${ev.index}`
    if (ev.type === "content_block_start") {
      const kind = kindOf(ev.content_block?.type)
      this.state(mid).stream.push({ index: ev.index, kind })
      if (kind === "text") {
        const t = String(ev.content_block?.text ?? "")
        this.partial.set(blockId, { kind: "text", text: t })
        return t ? [{ kind: "text_delta", id: blockId, text: t }] : []
      }
      if (kind === "thinking") {
        const t = String(ev.content_block?.thinking ?? "")
        this.partial.set(blockId, { kind: "thinking", text: t })
        return t ? [{ kind: "thinking_delta", id: blockId, text: t }] : []
      }
      return []
    }
    if (ev.type === "content_block_delta") {
      const d = ev.delta
      if (d?.type === "text_delta" && typeof d.text === "string" && d.text) {
        this.append(blockId, "text", d.text)
        return [{ kind: "text_delta", id: blockId, text: d.text }]
      }
      if (d?.type === "thinking_delta" && typeof d.thinking === "string" && d.thinking) {
        this.append(blockId, "thinking", d.thinking)
        return [{ kind: "thinking_delta", id: blockId, text: d.thinking }]
      }
    }
    return []
  }

  private append(id: string, kind: "text" | "thinking", text: string): void {
    const p = this.partial.get(id)
    if (p) p.text += text
    else this.partial.set(id, { kind, text })
  }

  /** Stream index for the next final block of this kind in message `mid`. */
  private resolveIndex(mid: string, kind: BlockKind): number {
    const s = this.state(mid)
    const pos = s.count++
    const hit = s.stream.find((b) => b.kind === kind && !s.claimed.has(b.index))
    if (hit) {
      s.claimed.add(hit.index)
      return hit.index
    }
    return pos
  }

  private mapAssistant(msg: any): LiveEvent[] {
    const parent: string | null = msg.parent_tool_use_id ?? null
    const mid = String(msg.message?.id ?? msg.uuid ?? "msg")
    const content = Array.isArray(msg.message?.content) ? msg.message.content : []
    const ts = tsOf(msg.timestamp, this.now())
    const out: LiveEvent[] = []
    for (const block of content) {
      const index = parent ? 0 : this.resolveIndex(mid, kindOf(block?.type))
      const blockId = `${mid}:${index}`
      const item = assistantBlockToItem(block, blockId, parent, ts)
      if (!item) continue
      if (item.kind === "assistant" || item.kind === "thinking") this.partial.delete(blockId)
      out.push({ kind: "item", item })
    }
    return out
  }

  private mapResult(msg: any): ChatItem {
    const total = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : 0
    // total_cost_usd is cumulative (and a resumed process continues from the
    // transcript's saved total); report the per-turn delta. A drop means the
    // total was reset (/clear), so the new total is this turn's cost.
    const cost = this.lastTotalCost === null ? 0 : total < this.lastTotalCost ? total : total - this.lastTotalCost
    this.lastTotalCost = total
    this.partial.clear()
    this.messages.clear()
    this.currentMessageId = null
    let errorText = resultErrorText(msg)
    if (errorText !== undefined && this.interrupted && msg.subtype === "error_during_execution") errorText = "Interrupted by the user."
    this.interrupted = false
    return {
      kind: "result",
      ts: this.now(),
      isError: errorText !== undefined,
      ...(errorText !== undefined ? { errorText } : {}),
      durationMs: Number(msg.duration_ms ?? 0),
      turns: Number(msg.num_turns ?? 0),
      costUsd: cost,
      usage: toUsage(msg.usage),
    }
  }

  private mapSystem(msg: any): LiveEvent[] {
    const sys = (text: string): LiveEvent[] => [{ kind: "item", item: { kind: "system", text, ts: this.now() } }]
    switch (msg.subtype) {
      case "local_command_output":
        return typeof msg.content === "string" && msg.content ? sys(msg.content) : []
      case "compact_boundary":
        return sys("Conversation compacted.")
      case "api_retry":
        return sys(
          `API error${msg.error_status ? ` ${msg.error_status}` : ""} (${String(msg.error ?? "unknown")}), retrying (attempt ${msg.attempt}/${msg.max_retries}).`,
        )
      case "informational":
        return (msg.level === "warning" || msg.level === "suggestion") && typeof msg.content === "string" ? sys(msg.content) : []
      default:
        return []
    }
  }
}
