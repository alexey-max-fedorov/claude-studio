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
  onCommandOutput: (content: string) => void
}

interface SessionStats {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  turnCount: number
}

const KNOWN_COMMANDS: Record<string, { description: string; argumentHint: string }> = {
  model: { description: "Switch the AI model", argumentHint: "<model-name>" },
  cost: { description: "Show session cost breakdown", argumentHint: "" },
  compact: { description: "Compact conversation context", argumentHint: "[instructions]" },
  config: { description: "View or update settings", argumentHint: "[key] [value]" },
  doctor: { description: "Run diagnostic checks", argumentHint: "" },
  memory: { description: "View or edit CLAUDE.md memory", argumentHint: "" },
  clear: { description: "Clear conversation history", argumentHint: "" },
  help: { description: "Show available commands", argumentHint: "" },
  permissions: { description: "Manage tool permissions", argumentHint: "" },
  vim: { description: "Toggle vim mode", argumentHint: "" },
  bug: { description: "Report a bug", argumentHint: "" },
  init: { description: "Initialize project memory", argumentHint: "" },
  review: { description: "Review code changes", argumentHint: "" },
  login: { description: "Authenticate with Anthropic", argumentHint: "" },
  logout: { description: "Sign out", argumentHint: "" },
  mcp: { description: "Manage MCP servers", argumentHint: "" },
  "approved-tools": { description: "View approved tools", argumentHint: "" },
  terminal: { description: "Set up terminal integration", argumentHint: "" },
}

const KNOWN_MODELS: Array<{ id: string; name: string }> = [
  { id: "sonnet", name: "Sonnet" },
  { id: "opus", name: "Opus" },
  { id: "haiku", name: "Haiku" },
]

export class ClaudeSessionManager {
  private sessions = new Map<string, string>() // clientId → sessionId
  private sessionStats = new Map<string, SessionStats>()
  private cachedCommands: Array<{ name: string; description: string; argumentHint: string }> = []
  private currentModel: string = config.model

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

  getAvailableModels(): { models: Array<{ id: string; name: string }>; current: string } {
    return { models: KNOWN_MODELS, current: this.currentModel }
  }

  private async runQuery(
    clientId: string,
    prompt: string,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const existingSession = this.sessions.get(clientId)

    const allowedTools = ["Read", "Edit", "MultiEdit", "Glob", "Grep"]
    if (config.allowBash) allowedTools.push("Bash")

    const options: Record<string, unknown> = {
      allowedTools,
      permissionMode: "acceptEdits",
      cwd: config.projectDir,
      maxTurns: config.maxTurns,
    }

    // Only set model for new sessions — resuming sessions inherit the model
    // (which /model may have changed)
    if (!existingSession) {
      options.model = config.model
    }

    if (existingSession) {
      options.resume = existingSession
    }

    log.dim("AI", `[${clientId.slice(0, 8)}] Query started${existingSession ? " (resuming)" : ""}`)

    const TIMEOUT_MS = config.timeoutMs
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true }, TIMEOUT_MS)

    try {
      for await (const msg of query({ prompt, options })) {
        if (timedOut) {
          const mins = Math.round(TIMEOUT_MS / 60_000)
          log.error("AI", `[${clientId.slice(0, 8)}] Timed out after ${mins} minutes`)
          callbacks.onError(`Session timed out after ${mins} minutes`)
          break
        }

        // Capture slash commands from SDK system init message
        if (msg.type === "system") {
          const sys = msg as any
          log.dim("AI", `[${clientId.slice(0, 8)}] System message: subtype=${sys.subtype}, model=${sys.model || "?"}, slash_commands=${Array.isArray(sys.slash_commands) ? sys.slash_commands.length : "none"}, skills=${Array.isArray(sys.skills) ? sys.skills.length : "none"}`)

          if (sys.subtype === "local_command_output") {
            callbacks.onCommandOutput(sys.content || "")
          }

          if (sys.subtype === "init") {
            if (sys.model) {
              this.currentModel = sys.model
            }
          }
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
                description: KNOWN_COMMANDS[name]?.description || "",
                argumentHint: KNOWN_COMMANDS[name]?.argumentHint || "",
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
