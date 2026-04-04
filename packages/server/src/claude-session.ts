import { query } from "@anthropic-ai/claude-agent-sdk"
import type { ElementSelection } from "@claude-studio/shared"
import { buildPrompt } from "./prompt-builder.js"
import { config } from "./config.js"
import { log } from "./logger.js"

export interface CompletionData {
  result: string
  sessionId: string
  cost: number
  turns: number
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
  duration_ms: number
  model: string
}

export interface StreamCallbacks {
  onStreaming: (chunk: string) => void
  onToolUse: (tool: string, input: Record<string, unknown>) => void
  onComplete: (data: CompletionData) => void
  onError: (error: string) => void
}

interface SessionStats {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  turnCount: number
}

export class ClaudeSessionManager {
  private sessions = new Map<string, string>() // clientId → sessionId
  private sessionStats = new Map<string, SessionStats>()
  private cachedCommands: Array<{ name: string; description: string; argumentHint: string }> = []

  async executePrompt(
    clientId: string,
    params: { route: string; element: ElementSelection; prompt: string },
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const fullPrompt = buildPrompt(params)
    await this.runQuery(clientId, fullPrompt, callbacks)
  }

  async executeRawPrompt(
    clientId: string,
    prompt: string,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    await this.runQuery(clientId, prompt, callbacks)
  }

  resetSession(clientId: string): void {
    this.sessions.delete(clientId)
    this.sessionStats.delete(clientId)
  }

  getSessionStats(clientId: string): SessionStats | null {
    return this.sessionStats.get(clientId) || null
  }

  getCapabilities(): { commands: Array<{ name: string; description: string; argumentHint: string }> } {
    return { commands: this.cachedCommands }
  }

  private async runQuery(
    clientId: string,
    prompt: string,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const options: Record<string, unknown> = {
      allowedTools: ["Read", "Edit", "MultiEdit", "Glob", "Grep", "Bash"],
      permissionMode: "acceptEdits",
      cwd: config.projectDir,
      model: config.model,
      maxTurns: config.maxTurns,
    }

    const existingSession = this.sessions.get(clientId)
    if (existingSession) {
      options.resume = existingSession
    }

    log.dim("AI", `[${clientId.slice(0, 8)}] Query started${existingSession ? " (resuming)" : ""}`)

    const TIMEOUT_MS = 300_000 // 5 minutes
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true }, TIMEOUT_MS)

    try {
      for await (const msg of query({ prompt, options })) {
        if (timedOut) {
          log.error("AI", `[${clientId.slice(0, 8)}] Timed out after 5 minutes`)
          callbacks.onError("Session timed out after 5 minutes")
          break
        }

        // Capture slash commands from SDK system init message
        if (msg.type === "system") {
          const sys = msg as any
          log.dim("AI", `[${clientId.slice(0, 8)}] System message: subtype=${sys.subtype}, model=${sys.model || "?"}, slash_commands=${Array.isArray(sys.slash_commands) ? sys.slash_commands.length : "none"}, skills=${Array.isArray(sys.skills) ? sys.skills.length : "none"}`)
          if (sys.subtype === "init" && this.cachedCommands.length === 0) {
            // Combine slash_commands and skills arrays
            const commands: string[] = []
            if (Array.isArray(sys.slash_commands)) commands.push(...sys.slash_commands)
            if (Array.isArray(sys.skills)) {
              for (const s of sys.skills) {
                if (typeof s === "string" && !commands.includes(s)) commands.push(s)
              }
            }
            if (commands.length > 0) {
              this.cachedCommands = commands.map((name: string) => ({
                name,
                description: "",
                argumentHint: "",
              }))
              log.dim("AI", `Cached ${this.cachedCommands.length} commands: ${commands.slice(0, 10).join(", ")}`)
            }
          }
        }

        if (msg.type === "assistant") {
          for (const block of (msg as any).message?.content || []) {
            if (block.type === "text") {
              callbacks.onStreaming(block.text)
            }
            if (block.type === "tool_use") {
              callbacks.onToolUse(block.name, block.input as Record<string, unknown>)
            }
          }
        }

        if (msg.type === "result") {
          const result = msg as any
          this.sessions.set(clientId, result.session_id)

          // Update cumulative stats
          const prev = this.sessionStats.get(clientId) || { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, turnCount: 0 }
          const usage = result.usage || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
          this.sessionStats.set(clientId, {
            totalCost: prev.totalCost + (result.total_cost_usd || 0),
            totalInputTokens: prev.totalInputTokens + (usage.input_tokens || 0),
            totalOutputTokens: prev.totalOutputTokens + (usage.output_tokens || 0),
            turnCount: prev.turnCount + (result.num_turns || 0),
          })

          callbacks.onComplete({
            result: result.result_text || result.result || "",
            sessionId: result.session_id,
            cost: result.total_cost_usd || 0,
            turns: result.num_turns || 0,
            usage: {
              input_tokens: usage.input_tokens || 0,
              output_tokens: usage.output_tokens || 0,
              cache_read_input_tokens: usage.cache_read_input_tokens || 0,
              cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            },
            duration_ms: result.duration_ms || 0,
            model: config.model,
          })
        }
      }
    } catch (err) {
      log.error("AI", `[${clientId.slice(0, 8)}] Query failed: ${err instanceof Error ? err.message : String(err)}`)
      callbacks.onError(err instanceof Error ? err.message : String(err))
    } finally {
      clearTimeout(timer)
    }
  }
}
