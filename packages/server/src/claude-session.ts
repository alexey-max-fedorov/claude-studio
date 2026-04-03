import { query } from "@anthropic-ai/claude-agent-sdk"
import type { ElementSelection } from "@canvas-code/shared"
import { buildPrompt } from "./prompt-builder.js"
import { config } from "./config.js"
import { log } from "./logger.js"

interface StreamCallbacks {
  onStreaming: (chunk: string) => void
  onToolUse: (tool: string, input: Record<string, unknown>) => void
  onComplete: (result: string, sessionId: string, cost: number, turns: number) => void
  onError: (error: string) => void
}

export class ClaudeSessionManager {
  private sessions = new Map<string, string>() // clientId → sessionId

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
          callbacks.onComplete(
            result.result_text || result.result || "",
            result.session_id,
            result.total_cost_usd || 0,
            result.num_turns || 0,
          )
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
