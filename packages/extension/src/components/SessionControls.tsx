import React from "react"
import { sendToBackground } from "@plasmohq/messaging"

export function SessionControls({ onClearChat }: { onClearChat: () => void }) {
  const handleNewSession = async () => {
    await sendToBackground({ name: "reset-session" })
    onClearChat()
  }

  return (
    <div style={{
      padding: "10px 16px", borderTop: "1px solid #1a1a1a",
      display: "flex", gap: 8,
    }}>
      <button
        className="cs-btn-session"
        onClick={handleNewSession}
        style={{
          flex: 1, padding: "8px 0", background: "transparent",
          color: "#a0a0a0", border: "1px solid #1a1a1a",
          borderRadius: 6, fontSize: 12, cursor: "pointer",
          fontWeight: 500, transition: "all 200ms",
        }}
      >
        New Session
      </button>
    </div>
  )
}
