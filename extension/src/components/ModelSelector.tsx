import { useState } from "react"
import type { ModelInfo } from "@claude-studio/protocol"

export function ModelSelector({
  models, current, disabled, onSelect,
}: {
  models: ModelInfo[]
  current: string
  disabled?: boolean
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = models.find((m) => m.id === current)
  return (
    <div style={{ position: "relative" }}>
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "#111", color: "#fff", border: "1px solid #1a1a1a",
          borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: disabled ? "default" : "pointer",
        }}
      >
        {active?.name ?? current} ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 4px)", left: 0, minWidth: 160,
            background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.5)", zIndex: 10, overflow: "hidden",
          }}
        >
          {models.map((m) => (
            <div
              key={m.id}
              onClick={() => { onSelect(m.id); setOpen(false) }}
              style={{
                padding: "8px 10px", fontSize: 12, cursor: "pointer",
                color: m.id === current ? "#c9a84c" : "#fff",
                background: m.id === current ? "rgba(201,168,76,0.08)" : "transparent",
              }}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
