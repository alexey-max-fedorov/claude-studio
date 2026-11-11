/** Token usage for a completed turn. */
export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** A model the agent can run, as reported live by the Agent SDK (supportedModels()). */
export interface ModelOption {
  /** Value passed as options.model ("" means the Claude Code default). */
  value: string
  displayName: string
  description: string
}

/** A slash command the session exposes (supportedCommands()). */
export interface SlashCommand {
  name: string
  description: string
  argumentHint: string
}

/** Mirrors the Agent SDK PermissionMode. */
export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions" | "auto" | "dontAsk"
export const PERMISSION_MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "auto", "bypassPermissions", "dontAsk"]

/** Mirrors the Agent SDK EffortLevel. "" means "let Claude Code pick". */
export type EffortLevel = "" | "low" | "medium" | "high" | "xhigh" | "max"
export const EFFORT_LEVELS: EffortLevel[] = ["", "low", "medium", "high", "xhigh", "max"]

/**
 * Agent-wide settings. Held by the agent's ConfigStore, persisted to
 * ~/.claude-studio/config.json (never inside the project), broadcast as config_state.
 * Applies to the NEXT turn of every conversation (live sessions get setModel /
 * setPermissionMode pushed immediately where the SDK allows it).
 */
export interface StudioConfig {
  /** Absolute project dir Claude Code runs in (cwd). Set by the agent at boot; read-only for clients. */
  projectDir: string
  /** Model alias/id; "" = Claude Code default from user settings. */
  model: string
  effort: EffortLevel
  permissionMode: PermissionMode
  /** Extra text appended to the claude_code system prompt preset. */
  systemPromptAppend: string
  /** Optional USD cap per turn; null = no cap. */
  maxBudgetUsd: number | null
  /** Optional max agentic turns per prompt; null = no cap. */
  maxTurns: number | null
}

export const DEFAULT_CONFIG: StudioConfig = {
  projectDir: "",
  model: "",
  effort: "",
  permissionMode: "acceptEdits",
  systemPromptAppend: "",
  maxBudgetUsd: null,
  maxTurns: null,
}
