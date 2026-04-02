import React from "react"
import { sendToBackground } from "@plasmohq/messaging"

export function SessionControls({ onClearChat }: { onClearChat: () => void }) {
  const handleNewSession = async () => {
    await sendToBackground({ name: "reset-session" })
    onClearChat()
  }

  return (
    <div style={{
      padding: "8px 16px", borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      display: "flex", gap: 8,
    }}>
      <button
        onClick={handleNewSession}
        style={{
          flex: 1, padding: "6px 0", background: "rgba(255, 255, 255, 0.06)",
          color: "#9ca3af", border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: 6, fontSize: 12, cursor: "pointer",
        }}
      >
        New Session
      </button>
    </div>
  )
}
