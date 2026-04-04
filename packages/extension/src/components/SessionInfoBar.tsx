import React, { useState } from "react"

export interface SessionInfo {
  model: string
  cumulativeCost: number
  cumulativeInputTokens: number
  cumulativeOutputTokens: number
  turnCount: number
  lastDuration?: number
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function SessionInfoBar({ info }: { info: SessionInfo | null }) {
  const [expanded, setExpanded] = useState(false)

  if (!info) return null

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        padding: expanded ? "10px 16px" : "6px 16px",
        borderBottom: "1px solid #1a1a1a", cursor: "pointer",
        background: expanded ? "#0a0a0a" : "transparent",
        transition: "all 200ms", userSelect: "none" as const,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#c9a84c", fontWeight: 600 }}>
          {info.model}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#a0a0a0" }}>
            ${info.cumulativeCost.toFixed(4)}
          </span>
          <span style={{
            fontSize: 9, color: "#666", transition: "transform 200ms",
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
            display: "inline-block",
          }}>
            &#9660;
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" as const }}>
          <div style={{ fontSize: 11, color: "#666" }}>
            <span style={{ color: "#a0a0a0" }}>In:</span> {formatTokens(info.cumulativeInputTokens)}
            {" / "}
            <span style={{ color: "#a0a0a0" }}>Out:</span> {formatTokens(info.cumulativeOutputTokens)}
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {info.turnCount} {info.turnCount === 1 ? "turn" : "turns"}
          </div>
          {info.lastDuration != null && info.lastDuration > 0 && (
            <div style={{ fontSize: 11, color: "#666" }}>
              {(info.lastDuration / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      )}
    </div>
  )
}
