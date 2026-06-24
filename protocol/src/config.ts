/** Token usage for a single completed turn. */
export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** A model the agent can run. `id` is a Claude model alias or full id. */
export interface ModelInfo {
  id: string
  name: string
}

/** A Claude Code plugin discovered on disk. */
export interface PluginInfo {
  name: string
  description: string
  path: string
}

/** A Claude Code skill discovered on disk. */
export interface SkillInfo {
  name: string
  description: string
  source: string
}

/** A slash command the agent exposes. */
export interface SlashCommand {
  name: string
  description: string
  argumentHint: string
}

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions"

/**
 * The single source of truth for agent behavior. Held by the agent's ConfigStore,
 * persisted to claude-studio.config.json, broadcast to all clients as `config_state`.
 */
export interface StudioConfig {
  /** Claude model alias ("sonnet"|"opus"|"haiku"|"fable") or full model id. */
  model: string
  /** Absolute working directory Claude Code operates in (display/info). */
  projectDir: string
  /** Max agentic turns per prompt. */
  maxTurns: number
  /** Max spend (USD) per session. */
  maxBudgetUsd: number
  /** SDK permission mode. */
  permissionMode: PermissionMode
  /** Convenience toggle: when true, "Bash" is added to the allowed tools. */
  allowBash: boolean
  /** Extra instructions appended to the agent's system prompt. */
  systemPromptAppend: string
  /** Include framework route→file hints in element-edit prompts. */
  routeHints: boolean
  /** Names of discovered plugins that are enabled. */
  enabledPlugins: string[]
  /** Names of discovered skills that are enabled. */
  enabledSkills: string[]
}

/** Base tools always available to the agent (Bash is added when allowBash). */
export const BASE_ALLOWED_TOOLS = ["Read", "Edit", "MultiEdit", "Glob", "Grep"] as const

export const DEFAULT_CONFIG: StudioConfig = {
  model: "sonnet",
  projectDir: "",
  maxTurns: 20,
  maxBudgetUsd: 2,
  permissionMode: "acceptEdits",
  allowBash: false,
  systemPromptAppend: "",
  routeHints: true,
  enabledPlugins: [],
  enabledSkills: [],
}

/** Curated default model list, refined at runtime by discovery. */
export const KNOWN_MODELS: ModelInfo[] = [
  { id: "sonnet", name: "Claude Sonnet 4.6" },
  { id: "opus", name: "Claude Opus 4.8" },
  { id: "haiku", name: "Claude Haiku 4.5" },
  { id: "fable", name: "Claude Fable 5" },
]
