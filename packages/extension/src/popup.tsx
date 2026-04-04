import React, { useEffect, useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"

const DEFAULT_URL = "ws://localhost:7281"
const STORAGE_KEY = "serverUrl"
const PICKER_MODE_KEY = "pickerMode"

function Popup() {
  const [status, setStatus] = useState<"unknown" | "connected" | "disconnected">("unknown")
  const [serverUrl, setServerUrl] = useState(DEFAULT_URL)
  const [saved, setSaved] = useState(false)
  const [pickerMode, setPickerMode] = useState<"toggle" | "hold">("toggle")

  useEffect(() => {
    chrome.storage.sync.get([STORAGE_KEY, PICKER_MODE_KEY], (result) => {
      if (result[STORAGE_KEY]) setServerUrl(result[STORAGE_KEY] as string)
      if (result[PICKER_MODE_KEY]) setPickerMode(result[PICKER_MODE_KEY] as "toggle" | "hold")
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

  const dotColor = status === "connected" ? "#22c55e" : status === "disconnected" ? "#ef4444" : "#666"

  return (
    <div style={{
      width: 300, padding: 20, background: "#000",
      color: "#fff", fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap');
        body { margin: 0; background: #000; }
        * { box-sizing: border-box; }
        ::selection { background: rgba(201,168,76,0.3); color: #fff; }
        :focus-visible { outline: 2px solid #c9a84c; outline-offset: 2px; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #c9a84c; }
        .cs-input:focus { border-color: #c9a84c !important; box-shadow: 0 0 0 1px rgba(201,168,76,0.3); }
        .cs-btn-primary:hover { background: #d4b65e !important; box-shadow: 0 0 24px rgba(201,168,76,0.4); }
        .cs-btn-primary:active { transform: scale(0.98); }
        .cs-btn-outline:hover { background: rgba(201,168,76,0.08) !important; box-shadow: 0 0 16px rgba(201,168,76,0.2); }
        .cs-btn-outline:active { transform: scale(0.98); }
        .cs-btn-ghost:hover { background: #1a1a1a !important; color: #fff !important; }
        .cs-btn-ghost:active { transform: scale(0.98); }
      `}</style>

      <h1 style={{
        fontSize: 20, margin: 0, color: "#c9a84c", fontWeight: 700,
        fontFamily: '"Playfair Display", Georgia, serif', letterSpacing: "-0.02em",
      }}>Claude Studio</h1>
      <p style={{ fontSize: 13, color: "#a0a0a0", marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
        Select elements on any page and describe changes in natural language.
      </p>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
        <label style={{
          fontSize: 11, color: "#a0a0a0", display: "block", marginBottom: 6,
          textTransform: "uppercase" as const, letterSpacing: "0.05em", fontWeight: 500,
        }}>Server URL</label>
        <input
          type="text"
          className="cs-input"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box" as const, padding: "8px 10px",
            background: "#111", color: "#fff", border: "1px solid #1a1a1a",
            borderRadius: 8, fontSize: 12, fontFamily: "ui-monospace, monospace",
            outline: "none", transition: "all 200ms",
          }}
          placeholder="ws://localhost:7281"
        />
        <button
          className={saved ? "" : "cs-btn-ghost"}
          onClick={saveUrl}
          style={{
            marginTop: 8, width: "100%", padding: "8px 0",
            background: saved ? "#22c55e" : "transparent",
            color: saved ? "#fff" : "#a0a0a0",
            border: saved ? "none" : "1px solid #1a1a1a",
            borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12,
            transition: "all 200ms",
          }}
        >
          {saved ? "Saved — reconnecting" : "Save & Reconnect"}
        </button>
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1a1a1a" }}>
        <label style={{
          fontSize: 11, color: "#a0a0a0", display: "block", marginBottom: 8,
          textTransform: "uppercase" as const, letterSpacing: "0.05em", fontWeight: 500,
        }}>Picker Activation</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["toggle", "hold"] as const).map((mode) => (
            <button
              key={mode}
              className={pickerMode === mode ? "" : "cs-btn-ghost"}
              onClick={() => {
                setPickerMode(mode)
                chrome.storage.sync.set({ [PICKER_MODE_KEY]: mode })
              }}
              style={{
                flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600, cursor: "pointer",
                borderRadius: 6, transition: "all 200ms",
                background: pickerMode === mode ? "rgba(201,168,76,0.15)" : "transparent",
                color: pickerMode === mode ? "#c9a84c" : "#a0a0a0",
                border: pickerMode === mode ? "1px solid rgba(201,168,76,0.3)" : "1px solid #1a1a1a",
              }}
            >
              {mode === "toggle" ? "Ctrl+Shift+E" : "Hold Shift"}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 12, display: "flex", alignItems: "center", gap: 8,
        paddingTop: 12, borderTop: "1px solid #1a1a1a",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
        <span style={{ fontSize: 12, color: "#a0a0a0" }}>
          {status === "unknown" ? "Not tested" : status === "connected" ? "Server connected" : "Server disconnected"}
        </span>
      </div>

      <button
        className="cs-btn-primary"
        onClick={openSidePanel}
        style={{
          marginTop: 12, width: "100%", padding: "10px 0", background: "#c9a84c",
          color: "#000", border: "none", borderRadius: 6, fontWeight: 600,
          cursor: "pointer", fontSize: 13, transition: "all 200ms",
        }}
      >
        Open Side Panel
      </button>
      <button
        className="cs-btn-outline"
        onClick={testConnection}
        style={{
          marginTop: 8, width: "100%", padding: "10px 0", background: "transparent",
          color: "#c9a84c", border: "1px solid #c9a84c", borderRadius: 6, fontWeight: 600,
          cursor: "pointer", fontSize: 13, transition: "all 200ms",
        }}
      >
        Test Connection
      </button>
      <p style={{ fontSize: 11, color: "#666", marginTop: 10, marginBottom: 0, textAlign: "center" as const }}>
        {pickerMode === "hold" ? "Hold Shift to activate picker" : "Ctrl+Shift+E to activate picker"}
      </p>
    </div>
  )
}

export default Popup
