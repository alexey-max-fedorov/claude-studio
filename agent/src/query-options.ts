import { BASE_ALLOWED_TOOLS, type StudioConfig } from "@claude-studio/protocol"
import { pluginPathByName } from "./discovery.js"

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
