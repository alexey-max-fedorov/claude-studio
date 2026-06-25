import { BASE_ALLOWED_TOOLS, effortLevelsForModel, EFFORT_LEVELS, type StudioConfig, type EffortLevel } from "@claude-studio/protocol"
import { pluginPathByName } from "./discovery.js"

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
    // "ultracode" is Studio's top tier: xHigh effort PLUS a dynamic-workflow
    // directive (applied in the session layer). The SDK effort itself is xhigh.
    return { effort: "xhigh" }
  }
  return { effort: chosen }
}

export function buildQueryOptions(
  config: StudioConfig,
  resumeSessionId: string | undefined,
  extraTools: string[] = [],
): Record<string, unknown> {
  const allowedTools: string[] = [...BASE_ALLOWED_TOOLS]
  if (config.allowBash) allowedTools.push("Bash")
  for (const t of extraTools) if (!allowedTools.includes(t)) allowedTools.push(t)

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

/**
 * Directive appended to a prompt when the user selects the "ultracode" tier:
 * it asks the agent to author and run a dynamic multi-agent workflow for the turn.
 */
export const ULTRACODE_DIRECTIVE = `

---
ultracode: For this turn, run a dynamic multi-agent workflow — use the Task tool to spawn subagents for the independent parts, verify the results, and synthesize. Assign the right model per subtask by difficulty: opus for hard reasoning or design, sonnet for standard implementation, haiku for mechanical edits.`

/** Tools enabled for an ultracode turn so the agent can actually orchestrate. */
export const ULTRACODE_TOOLS = ["Task"]

/** True when the active model offers the ultracode tier AND it is selected. */
export function isUltracodeActive(config: StudioConfig): boolean {
  return config.effort === "ultracode" && effortLevelsForModel(config.model).includes("ultracode")
}

/** Augment a prompt + tool list for an ultracode turn (no-op otherwise). */
export function ultracodeAugment(
  prompt: string,
  config: StudioConfig,
  extraTools: string[],
): { prompt: string; tools: string[] } {
  if (!isUltracodeActive(config)) return { prompt, tools: extraTools }
  const tools = [...extraTools]
  for (const t of ULTRACODE_TOOLS) if (!tools.includes(t)) tools.push(t)
  return { prompt: prompt + ULTRACODE_DIRECTIVE, tools }
}
