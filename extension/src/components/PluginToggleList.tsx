import type { PluginInfo, SkillInfo } from "@claude-studio/protocol"

export function PluginToggleList({
  title, items, enabled, onToggle,
}: {
  title: string
  items: Array<PluginInfo | SkillInfo>
  enabled: string[]
  onToggle: (name: string, on: boolean) => void
}) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "8px 0" }}>
        <div style={{ color: "#a0a0a0", fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>None found in .claude/</div>
      </div>
    )
  }
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ color: "#a0a0a0", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {items.map((it) => {
        const on = enabled.includes(it.name)
        return (
          <div
            key={it.name}
            onClick={() => onToggle(it.name, !on)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}
          >
            <span style={{ color: on ? "#c9a84c" : "#666", fontSize: 13 }}>{on ? "◉" : "○"}</span>
            <span style={{ color: "#fff", fontSize: 13 }}>{it.name}</span>
            {it.description ? <span style={{ color: "#666", fontSize: 11 }}>— {it.description}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
