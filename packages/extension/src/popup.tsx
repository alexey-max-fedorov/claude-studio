import React from "react"

function Popup() {
  return (
    <div style={{ width: 300, padding: 16, background: "#0a0f1a", color: "#fff", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18, margin: 0, color: "#c9a84c" }}>Canvas Code</h1>
      <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
        Select elements on any page and describe changes in natural language.
      </p>
      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 12 }}>
        Press Ctrl+Shift+E to activate the element picker.
      </p>
    </div>
  )
}

export default Popup
