import React, { useEffect, useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"

const DEFAULT_URL = "ws://localhost:7281"
const STORAGE_KEY = "serverUrl"

function Popup() {
  const [status, setStatus] = useState<"unknown" | "connected" | "disconnected">("unknown")
  const [serverUrl, setServerUrl] = useState(DEFAULT_URL)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) setServerUrl(result[STORAGE_KEY] as string)
    })
  }, [])

  const testConnection = async () => {
    try {
      const resp = await sendToBackground({ name: "ping" })
      setStatus(resp.connected ? "connected" : "disconnected")
    } catch {
      setStatus("disconnected")
    }
  }

  const saveUrl = () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: serverUrl }, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const openSidePanel = () => {
    chrome.windows.getCurrent((win) => {
      if (win.id !== undefined) chrome.sidePanel.open({ windowId: win.id })
    })
  }

  const dotColor = status === "connected" ? "#22c55e" : status === "disconnected" ? "#ef4444" : "#6b7280"

  return (
    <div style={{ width: 300, padding: 16, background: "#0a0f1a", color: "#fff", fontFamily: "system-ui" }}>
      <style>{`body { margin: 0; }`}</style>
      <h1 style={{ fontSize: 18, margin: 0, color: "#c9a84c" }}>Claude Studio</h1>
      <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
        Select elements on any page and describe changes in natural language.
      </p>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 4 }}>Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "6px 8px",
            background: "#111827", color: "#fff", border: "1px solid #374151",
            borderRadius: 6, fontSize: 12, fontFamily: "monospace",
          }}
          placeholder="ws://localhost:7281"
        />
        <button
          onClick={saveUrl}
          style={{
            marginTop: 6, width: "100%", padding: "6px 0",
            background: saved ? "#22c55e" : "#1f2937",
            color: saved ? "#fff" : "#9ca3af", border: "1px solid #374151",
            borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12,
          }}
        >
          {saved ? "Saved — reconnecting" : "Save & Reconnect"}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {status === "unknown" ? "Not tested" : status === "connected" ? "Server connected" : "Server disconnected"}
        </span>
      </div>
      <button
        onClick={openSidePanel}
        style={{
          marginTop: 12, width: "100%", padding: "8px 0", background: "#c9a84c",
          color: "#0a0f1a", border: "none", borderRadius: 6, fontWeight: 600,
          cursor: "pointer", fontSize: 13
        }}
      >
        Open Side Panel
      </button>
      <button
        onClick={testConnection}
        style={{
          marginTop: 8, width: "100%", padding: "8px 0", background: "#1f2937",
          color: "#9ca3af", border: "1px solid #374151", borderRadius: 6, fontWeight: 600,
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
