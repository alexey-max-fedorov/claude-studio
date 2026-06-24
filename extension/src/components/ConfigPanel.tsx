import type { PermissionMode, PluginInfo, SkillInfo, StudioConfig, ModelInfo } from "@claude-studio/protocol"
import { ModelSelector } from "./ModelSelector"
import { Toggle } from "./Toggle"
import { NumberField } from "./NumberField"
import { PluginToggleList } from "./PluginToggleList"

const PERMISSION_MODES: PermissionMode[] = ["acceptEdits", "default", "plan", "bypassPermissions"]

export function ConfigPanel({
  config, models, availablePlugins, availableSkills, onPatch,
}: {
  config: StudioConfig
  models: ModelInfo[]
  availablePlugins: PluginInfo[]
  availableSkills: SkillInfo[]
  onPatch: (patch: Partial<StudioConfig>) => void
}) {
  const label = { color: "#a0a0a0", fontSize: 13 } as const
  const section = { borderTop: "1px solid #1a1a1a", marginTop: 8, paddingTop: 8 } as const

  function toggleIn(list: string[], name: string, on: boolean): string[] {
    return on ? [...new Set([...list, name])] : list.filter((n) => n !== name)
  }

  return (
    <div style={{ padding: 12, color: "#fff", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
        <span style={label}>Model</span>
        <ModelSelector models={models} current={config.model} onSelect={(model) => onPatch({ model })} />
      </div>

      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <span style={label}>Permission mode</span>
        <select
          value={config.permissionMode}
          onChange={(e) => onPatch({ permissionMode: e.target.value as PermissionMode })}
          style={{ background: "#111", color: "#fff", border: "1px solid #1a1a1a", borderRadius: 6, padding: "4px 8px", fontSize: 13 }}
        >
          {PERMISSION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>

      <NumberField label="Max turns" value={config.maxTurns} min={1} onChange={(maxTurns) => onPatch({ maxTurns })} />
      <NumberField label="Budget (USD)" value={config.maxBudgetUsd} step={0.5} min={0} onChange={(maxBudgetUsd) => onPatch({ maxBudgetUsd })} />
      <Toggle label="Allow Bash" value={config.allowBash} onChange={(allowBash) => onPatch({ allowBash })} />
      <Toggle label="Framework route hints" value={config.routeHints} onChange={(routeHints) => onPatch({ routeHints })} />

      <div style={section}>
        <span style={label}>System prompt append</span>
        <textarea
          value={config.systemPromptAppend}
          onChange={(e) => onPatch({ systemPromptAppend: e.target.value })}
          placeholder="Extra instructions for the agent…"
          style={{
            width: "100%", minHeight: 56, marginTop: 6, background: "#111", color: "#fff",
            border: "1px solid #1a1a1a", borderRadius: 6, padding: 8, fontSize: 12, resize: "vertical",
          }}
        />
      </div>

      <div style={section}>
        <PluginToggleList
          title="Plugins"
          items={availablePlugins}
          enabled={config.enabledPlugins}
          onToggle={(name, on) => onPatch({ enabledPlugins: toggleIn(config.enabledPlugins, name, on) })}
        />
        <PluginToggleList
          title="Skills"
          items={availableSkills}
          enabled={config.enabledSkills}
          onToggle={(name, on) => onPatch({ enabledSkills: toggleIn(config.enabledSkills, name, on) })}
        />
      </div>
    </div>
  )
}
