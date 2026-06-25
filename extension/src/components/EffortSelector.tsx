import { useState } from "react"
import type { EffortLevel } from "@claude-studio/protocol"

const LABELS: Record<EffortLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "xHigh",
  max: "Max",
  ultracode: "ultracode",
}

/**
 * Reasoning-effort picker. Renders nothing when the active model exposes no
 * effort ladder (e.g. Haiku), so the header stays clean.
 */
export function EffortSelector({
  levels, current, disabled, onSelect,
}: {
  levels: EffortLevel[]
  current: EffortLevel
  disabled?: boolean
  onSelect: (level: EffortLevel) => void
}) {
  const [open, setOpen] = useState(false)
  if (levels.length === 0) return null

  return (
    <div style={{ position: "relative" }}>
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Reasoning effort"
        style={{
          background: "#111", color: "#fff", border: "1px solid #1a1a1a",
          borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: disabled ? "default" : "pointer",
        }}
      >
        {LABELS[current] ?? current} ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 130,
            background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 10, overflow: "hidden",
          }}
        >
          {levels.map((l) => (
            <div
              key={l}
              onClick={() => { onSelect(l); setOpen(false) }}
              style={{
                padding: "8px 10px", fontSize: 12, cursor: "pointer",
                color: l === current ? "#c9a84c" : "#fff",
                background: l === current ? "rgba(201,168,76,0.08)" : "transparent",
              }}
            >
              {LABELS[l] ?? l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
