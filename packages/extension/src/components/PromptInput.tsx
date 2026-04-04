import React, { useRef, useState } from "react"

interface PromptInputProps {
  onSubmit: (prompt: string) => void
  disabled?: boolean
}

export function PromptInput({ onSubmit, disabled }: PromptInputProps) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const canSend = value.trim() && !disabled

  return (
    <div style={{
      padding: "10px 16px", borderTop: "1px solid #1a1a1a",
      display: "flex", gap: 8, alignItems: "flex-end",
    }}>
      <textarea
        ref={inputRef}
        className="cs-prompt-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Claude..."
        disabled={disabled}
        rows={1}
        style={{
          flex: 1, padding: "10px 12px", background: "#111",
          color: "#fff", border: "1px solid #1a1a1a",
          borderRadius: 8, fontSize: 13, fontFamily: "inherit",
          resize: "none", outline: "none", lineHeight: 1.5,
          transition: "all 200ms",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!canSend}
        style={{
          padding: "10px 14px",
          background: canSend ? "#c9a84c" : "#111",
          color: canSend ? "#000" : "#666",
          border: canSend ? "none" : "1px solid #1a1a1a",
          borderRadius: 6, fontSize: 12,
          cursor: canSend ? "pointer" : "default",
          fontWeight: 600, transition: "all 200ms",
        }}
      >
        Send
      </button>
    </div>
  )
}
