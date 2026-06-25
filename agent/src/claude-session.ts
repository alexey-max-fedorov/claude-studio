import { query } from "@anthropic-ai/claude-agent-sdk"
import type { ElementSelection, StudioConfig, Usage, SlashCommand } from "@claude-studio/protocol"
import { buildQueryOptions, ultracodeAugment } from "./query-options.js"
import { buildPrompt } from "./prompt-builder.js"
import { log } from "./logger.js"
import { activityBuffer } from "./activity.js"

export interface SessionCallbacks {
  onStreaming(chunk: string): void
  onThinking(chunk: string): void
  onToolUse(tool: string, input: Record<string, unknown>): void
  onComplete(c: {
    result: string; sessionId: string; cost: number; turns: number
    usage: Usage; duration_ms: number; model: string
  }): void
  onError(error: string): void
}

interface Stats {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  turnCount: number
}

function resultErrorMessage(msg: any): string {
  switch (msg.subtype) {
    case "error_max_budget_usd": return `Stopped: reached the max budget cap${typeof msg.total_cost_usd === "number" ? ` ($${msg.total_cost_usd.toFixed(4)})` : ""}.`
    case "error_max_turns": return `Stopped: reached the max turns limit${typeof msg.num_turns === "number" ? ` (${msg.num_turns} turns)` : ""}.`
    case "error_during_execution": return "The agent stopped due to an error during execution."
    default: return (typeof msg.result === "string" && msg.result) ? msg.result : `The agent stopped with an error (${msg.subtype ?? "unknown"}).`
  }
}

export class ClaudeSession {
  private sessions = new Map<string, string>()          // clientId → sessionId
  private stats = new Map<string, Stats>()
  private active = new Map<string, { interrupt: () => Promise<void> }>()
  private cachedCommands: SlashCommand[] = []

  constructor(private getConfig: () => StudioConfig) {}

  getCapabilities(): SlashCommand[] {
    return this.cachedCommands
  }

  getStats(clientId: string): Stats {
    return this.stats.get(clientId) ?? { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, turnCount: 0 }
  }

  resetSession(clientId: string): void {
    this.sessions.delete(clientId)
    this.stats.delete(clientId)
    this.active.delete(clientId)
  }

  async interrupt(clientId: string): Promise<void> {
    const q = this.active.get(clientId)
    if (q) {
      try { await q.interrupt() } catch (err) { log.error("SDK", `interrupt failed: ${String(err)}`) }
    }
  }

  executePrompt(clientId: string, input: { route: string; element: ElementSelection; prompt: string }, cb: SessionCallbacks): void {
    const cfg = this.getConfig()
    const prompt = buildPrompt({ route: input.route, element: input.element, prompt: input.prompt, routeHints: cfg.routeHints })
    void this.run(clientId, prompt, cb, cfg)
  }

  executeRawPrompt(clientId: string, text: string, cb: SessionCallbacks): void {
    void this.run(clientId, text, cb, this.getConfig())
  }

  private async run(clientId: string, prompt: string, cb: SessionCallbacks, cfg: StudioConfig, extraTools: string[] = []): Promise<void> {
    const start = Date.now()
    const existing = this.sessions.get(clientId)
    const { prompt: finalPrompt, tools } = ultracodeAugment(prompt, cfg, extraTools)
    const options = buildQueryOptions(cfg, existing, tools)
    try {
      // buildQueryOptions returns Record<string, unknown> (model is authoritative
      // on every call); the SDK types `options` strictly as `Options`, so cast at
      // the call boundary. The result handle is iterated/inspected dynamically.
      const q = query({ prompt: finalPrompt, options: options as never }) as any
      if (typeof q.interrupt === "function") this.active.set(clientId, { interrupt: () => q.interrupt() })

      for await (const msg of q) {
        if (msg.type === "system") {
          // Capture available slash commands advertised at init, if present.
          const cmds = msg.slash_commands ?? msg.commands
          if (Array.isArray(cmds)) {
            this.cachedCommands = cmds.map((c: any) =>
              typeof c === "string"
                ? { name: c, description: "", argumentHint: "" }
                : { name: String(c.name ?? ""), description: String(c.description ?? ""), argumentHint: String(c.argumentHint ?? c.argument_hint ?? "") },
            )
          }
        } else if (msg.type === "stream_event") {
          // Token-level deltas drive live text + thinking.
          const ev = msg.event
          if (ev?.type === "content_block_delta") {
            const d = ev.delta
            if (d?.type === "text_delta" && d.text) {
              cb.onStreaming(d.text)
              activityBuffer.append("text", d.text)
            } else if (d?.type === "thinking_delta" && d.thinking) {
              cb.onThinking(d.thinking)
              activityBuffer.append("thinking", d.thinking)
            }
          }
        } else if (msg.type === "assistant") {
          // Text + thinking already streamed via stream_event deltas; here we only
          // pick up tool_use blocks (their inputs aren't streamed as usable deltas).
          for (const block of msg.message?.content ?? []) {
            if (block.type === "tool_use") {
              cb.onToolUse(block.name, block.input ?? {})
              activityBuffer.append("tool", `${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 80)}`)
            }
          }
        } else if (msg.type === "result") {
          const sessionId = msg.session_id ?? existing ?? ""
          if (sessionId) this.sessions.set(clientId, sessionId)
          const usage: Usage = {
            input_tokens: msg.usage?.input_tokens ?? 0,
            output_tokens: msg.usage?.output_tokens ?? 0,
            cache_read_input_tokens: msg.usage?.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: msg.usage?.cache_creation_input_tokens ?? 0,
          }
          const prev = this.getStats(clientId)
          this.stats.set(clientId, {
            totalCost: prev.totalCost + (msg.total_cost_usd ?? 0),
            totalInputTokens: prev.totalInputTokens + usage.input_tokens,
            totalOutputTokens: prev.totalOutputTokens + usage.output_tokens,
            turnCount: prev.turnCount + (msg.num_turns ?? 0),
          })
          if (msg.is_error === true || msg.subtype !== "success") {
            cb.onError(resultErrorMessage(msg))
          } else {
            cb.onComplete({
              result: msg.result ?? "",
              sessionId,
              cost: msg.total_cost_usd ?? 0,
              turns: msg.num_turns ?? 0,
              usage,
              duration_ms: Date.now() - start,
              model: cfg.model,
            })
          }
        }
      }
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : String(err))
    } finally {
      this.active.delete(clientId)
    }
  }
}
