import type { WebSocket } from "ws"
import { parseClientMessage } from "@claude-studio/shared"
import type { ConnectionManager } from "./connection-manager.js"
import type { ClaudeSessionManager, StreamCallbacks, CompletionData } from "./claude-session.js"
import { log } from "./logger.js"
import { config } from "./config.js"

function withLogging(clientId: string, callbacks: StreamCallbacks): StreamCallbacks {
  let streamStarted = false
  return {
    onStreaming(chunk) {
      if (!streamStarted) {
        streamStarted = true
        log.dim("AI", `[${clientId.slice(0, 8)}] Streaming started`)
      }
      callbacks.onStreaming(chunk)
    },
    onToolUse(tool, input) {
      log.event("AI", `[${clientId.slice(0, 8)}] Tool: ${tool} ${JSON.stringify(input).slice(0, 100)}`)
      callbacks.onToolUse(tool, input)
    },
    onComplete(data) {
      log.success("AI", `[${clientId.slice(0, 8)}] Complete (${data.turns} turns, $${data.cost.toFixed(4)}, ${data.usage.input_tokens}in/${data.usage.output_tokens}out)`)
      callbacks.onComplete(data)
    },
    onError(error) {
      log.error("AI", `[${clientId.slice(0, 8)}] Error: ${error}`)
      callbacks.onError(error)
    },
    onCommandOutput(content) {
      log.dim("AI", `[${clientId.slice(0, 8)}] Command output: ${content.slice(0, 100)}`)
      callbacks.onCommandOutput(content)
    },
  }
}

function makeCallbacks(clientId: string, connections: ConnectionManager, claude: ClaudeSessionManager): StreamCallbacks {
  return {
    onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
    onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
    onComplete: (data: CompletionData) => {
      connections.send(clientId, {
        type: "ai_complete",
        result: data.result, sessionId: data.sessionId,
        cost: data.cost, turns: data.turns,
        usage: data.usage, duration_ms: data.duration_ms, model: data.model,
      })
      const stats = claude.getSessionStats(clientId)
      if (stats) {
        connections.send(clientId, {
          type: "session_info",
          model: data.model,
          cumulativeCost: stats.totalCost,
          cumulativeInputTokens: stats.totalInputTokens,
          cumulativeOutputTokens: stats.totalOutputTokens,
          turnCount: stats.turnCount,
        })
      }
    },
    onError: (error) => connections.send(clientId, { type: "ai_error", error }),
    onCommandOutput: (content) => connections.send(clientId, { type: "command_output", content }),
  }
}

export function handleConnection(ws: WebSocket, connections: ConnectionManager, claude: ClaudeSessionManager): void {
  const clientId = connections.add(ws)
  const short = clientId.slice(0, 8)
  log.info("WS", `Client connected: ${short}`)
  connections.send(clientId, { type: "connected", clientId })

  let alive = true
  ws.on("pong", () => { alive = true })
  const heartbeat = setInterval(() => {
    if (!alive) {
      log.dim("WS", `Heartbeat timeout, terminating: ${short}`)
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
  }, 30_000)

  ws.on("message", (data) => {
    try {
      const msg = parseClientMessage(data.toString())
      switch (msg.type) {
        case "ping":
          connections.send(clientId, { type: "pong" })
          break

        case "prompt":
          log.event("AI", `[${short}] Prompt: "${msg.prompt}" → ${msg.element.cssSelector} on ${msg.route}`)
          claude.executePrompt(clientId, {
            route: msg.route,
            element: msg.element,
            prompt: msg.prompt,
          }, withLogging(clientId, makeCallbacks(clientId, connections, claude)))
          break

        case "raw_prompt":
          log.event("AI", `[${short}] Raw prompt: "${msg.prompt}"`)
          claude.executeRawPrompt(clientId, msg.prompt,
            withLogging(clientId, makeCallbacks(clientId, connections, claude)))
          break

        case "query_capabilities": {
          const caps = claude.getCapabilities()
          connections.send(clientId, {
            type: "capabilities",
            commands: caps.commands,
          })
          break
        }

        case "query_models": {
          const models = claude.getAvailableModels()
          connections.send(clientId, {
            type: "available_models",
            models: models.models,
            current: models.current,
          })
          break
        }

        case "reset_session":
          log.info("WS", `[${short}] Session reset`)
          claude.resetSession(clientId)
          connections.send(clientId, { type: "session_reset", newSessionId: "reset" })
          break
      }
    } catch (err) {
      log.error("WS", `[${short}] Message error: ${err}`)
      connections.send(clientId, { type: "ai_error", error: String(err) })
    }
  })

  ws.on("close", () => {
    log.info("WS", `Client disconnected: ${short}`)
    clearInterval(heartbeat)
    connections.remove(clientId)
  })
}
