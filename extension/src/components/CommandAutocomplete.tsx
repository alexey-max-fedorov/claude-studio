import React, { useEffect, useRef } from "react"

export interface SlashCommandInfo {
  name: string
  description: string
  argumentHint: string
}

interface Props {
  commands: SlashCommandInfo[]
  filter: string
  selectedIndex: number
  onSelect: (command: SlashCommandInfo) => void
}

export function CommandAutocomplete({ commands, filter, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = commands.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 8)

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (filtered.length === 0) return null

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute", bottom: "100%", left: 0, right: 0,
        background: "#111", border: "1px solid #1a1a1a", borderRadius: 8,
        boxShadow: "0 -4px 16px rgba(0,0,0,0.5)", maxHeight: 200,
        overflowY: "auto" as const, marginBottom: 4, zIndex: 10,
      }}
    >
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          style={{
            padding: "8px 12px", cursor: "pointer",
            background: i === selectedIndex ? "#1a1a1a" : "transparent",
            borderBottom: i < filtered.length - 1 ? "1px solid rgba(26,26,26,0.5)" : "none",
            transition: "background 100ms",
          }}
        >
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
            /{cmd.name}
            {cmd.argumentHint && (
              <span style={{ color: "#666", fontWeight: 400, marginLeft: 6 }}>
                {cmd.argumentHint}
              </span>
            )}
          </div>
          {cmd.description && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {cmd.description}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
