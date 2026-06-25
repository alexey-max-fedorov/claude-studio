import { BASE_ALLOWED_TOOLS, effortLevelsForModel, EFFORT_LEVELS, type StudioConfig, type EffortLevel } from "@claude-studio/protocol"
import { pluginPathByName } from "./discovery.js"

/**
 * Forced thinking budget (tokens) for the "ultracode" tier. The SDK effort
 * ladder tops out at "max", so "ultracode" = max effort PLUS this explicit
 * large thinking budget, making it strictly stronger than plain "max".
 */
const ULTRACODE_THINKING_BUDGET = 32_000

/**
 * Translate a Studio effort tier into SDK query options, clamped to what the
 * active model actually supports. Models with no effort ladder (Haiku) get
 * nothing. If the configured tier isn't offered by the model, fall back to the
 * strongest supported tier at or below it (e.g. xhigh → high on Sonnet).
 */
export function effortToSdk(model: string, effort: EffortLevel): Record<string, unknown> {
  const ladder = effortLevelsForModel(model)
  if (ladder.length === 0) return {} // e.g. Haiku — no effort control

  let chosen = effort
  if (!ladder.includes(chosen)) {
    const wantIdx = EFFORT_LEVELS.indexOf(chosen)
    chosen = [...ladder].reverse().find((l) => EFFORT_LEVELS.indexOf(l) <= wantIdx) ?? ladder[0]
  }

  if (chosen === "ultracode") {
    return { effort: "max", thinking: { type: "enabled", budgetTokens: ULTRACODE_THINKING_BUDGET } }
  }
  return { effort: chosen }
}

export function buildQueryOptions(
  config: StudioConfig,
  resumeSessionId: string | undefined,
): Record<string, unknown> {
  const allowedTools: string[] = [...BASE_ALLOWED_TOOLS]
  if (config.allowBash) allowedTools.push("Bash")

  const options: Record<string, unknown> = {
    // Reliability fix: model is authoritative on EVERY call. The SDK writes
    // options.model to the flag-settings layer, which overrides a resumed
    // session's original model — so switching model in config takes effect
    // on the next turn without slash-command flakiness.
    model: config.model,
    cwd: config.projectDir,
    maxTurns: config.maxTurns,
    maxBudgetUsd: config.maxBudgetUsd,
    permissionMode: config.permissionMode,
    allowedTools,
    settingSources: ["user", "project", "local"],
    // Stream token-level deltas (text + thinking) so clients render live.
    includePartialMessages: true,
    // Reasoning effort, clamped to the model's ladder (omitted for Haiku).
    ...effortToSdk(config.model, config.effort),
  }

  if (config.permissionMode === "bypassPermissions") {
    options.allowDangerouslySkipPermissions = true
  }

  if (resumeSessionId) options.resume = resumeSessionId

  if (config.enabledSkills.length > 0) options.skills = [...config.enabledSkills]

  if (config.enabledPlugins.length > 0) {
    const plugins = config.enabledPlugins
      .map((name) => pluginPathByName(config.projectDir, name))
      .filter((p): p is string => Boolean(p))
      .map((path) => ({ type: "local" as const, path }))
    if (plugins.length > 0) options.plugins = plugins
  }

  if (config.systemPromptAppend.trim().length > 0) {
    options.systemPrompt = { type: "preset", preset: "claude_code", append: config.systemPromptAppend }
  }

  return options
}
