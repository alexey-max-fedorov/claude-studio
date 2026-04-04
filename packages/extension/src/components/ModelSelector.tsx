import React, { useState, useRef, useEffect } from "react"

interface ModelInfo {
  id: string
  name: string
}

interface Props {
  models: ModelInfo[]
  current: string
  onSelect: (modelId: string) => void
  disabled?: boolean
}

export function ModelSelector({ models, current, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const currentName = models.find((m) => m.id === current)?.name || current

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          background: "transparent", border: "1px solid #1a1a1a", borderRadius: 6,
          color: "#c9a84c", cursor: disabled ? "default" : "pointer",
          fontSize: 11, padding: "4px 8px", fontWeight: 600,
          transition: "all 200ms", display: "flex", alignItems: "center", gap: 4,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {currentName}
        <span style={{
          fontSize: 8, transition: "transform 200ms",
          transform: open ? "rotate(180deg)" : "rotate(0)",
          display: "inline-block",
        }}>&#9660;</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          background: "#111", border: "1px solid #1a1a1a", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 20,
          minWidth: 120, overflow: "hidden",
        }}>
          {models.map((m) => (
            <div
              key={m.id}
              onClick={() => { onSelect(m.id); setOpen(false) }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 12,
                color: m.id === current ? "#c9a84c" : "#a0a0a0",
                background: m.id === current ? "#1a1a1a" : "transparent",
                fontWeight: m.id === current ? 600 : 400,
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = m.id === current ? "#1a1a1a" : "transparent")}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { ModelInfo }
