import React from "react"

export function ConnectionStatus({ state }: { state: string }) {
  const color = state === "connected" ? "#22c55e" : state === "reconnecting" ? "#eab308" : "#ef4444"
  const label = state === "connected" ? "Connected" : state === "reconnecting" ? "Reconnecting..." : "Disconnected"

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 11, color: "#a0a0a0" }}>{label}</span>
    </div>
  )
}
