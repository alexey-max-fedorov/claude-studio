import type { ElementSelection } from "./element-selection.js"
import type {
  StudioConfig,
  Usage,
  ModelInfo,
  PluginInfo,
  SkillInfo,
  SlashCommand,
} from "./config.js"

// --- Client → Server (extension / TUI → agent) ---
export type ClientMessage =
  | { type: "ping" }
  | { type: "prompt"; route: string; element: ElementSelection; prompt: string }
  | { type: "raw_prompt"; prompt: string }
  | { type: "reset_session" }
  | { type: "interrupt" }
  | { type: "get_config" }
  | { type: "set_config"; patch: Partial<StudioConfig> }
  | { type: "query_capabilities" }

// --- Server → Client (agent → extension / TUI) ---
export type ServerMessage =
  | { type: "connected"; clientId: string; serverVersion: string }
  | { type: "pong" }
  | { type: "ai_streaming"; chunk: string }
  | { type: "ai_thinking"; chunk: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | {
      type: "ai_complete"
      result: string
      sessionId: string
      cost: number
      turns: number
      usage: Usage
      duration_ms: number
      model: string
    }
  | { type: "ai_error"; error: string }
  | { type: "session_reset"; newSessionId: string }
  | {
      type: "session_info"
      model: string
      cumulativeCost: number
      cumulativeInputTokens: number
      cumulativeOutputTokens: number
      turnCount: number
    }
  | { type: "capabilities"; commands: SlashCommand[] }
  | { type: "command_output"; content: string }
  | {
      type: "config_state"
      config: StudioConfig
      availableModels: ModelInfo[]
      availablePlugins: PluginInfo[]
      availableSkills: SkillInfo[]
    }
  | { type: "config_error"; error: string }
