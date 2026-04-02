import React, { useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"

function Popup() {
  const [status, setStatus] = useState<"unknown" | "connected" | "disconnected">("unknown")

  const testConnection = async () => {
    try {
      const resp = await sendToBackground({ name: "ping" })
      setStatus(resp.connected ? "connected" : "disconnected")
    } catch {
      setStatus("disconnected")
    }
  }

  const dotColor = status === "connected" ? "#22c55e" : status === "disconnected" ? "#ef4444" : "#6b7280"

  return (
    <div style={{ width: 300, padding: 16, background: "#0a0f1a", color: "#fff", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18, margin: 0, color: "#c9a84c" }}>Canvas Code</h1>
      <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
        Select elements on any page and describe changes in natural language.
      </p>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {status === "unknown" ? "Not tested" : status === "connected" ? "Server connected" : "Server disconnected"}
        </span>
      </div>
      <button
        onClick={testConnection}
        style={{
          marginTop: 12, width: "100%", padding: "8px 0", background: "#c9a84c",
          color: "#0a0f1a", border: "none", borderRadius: 6, fontWeight: 600,
          cursor: "pointer", fontSize: 13
        }}
      >
        Test Connection
      </button>
      <p style={{ fontSize: 11, color: "#4b5563", marginTop: 8, textAlign: "center" }}>
        Ctrl+Shift+E to activate picker
      </p>
    </div>
  )
}

export default Popup
