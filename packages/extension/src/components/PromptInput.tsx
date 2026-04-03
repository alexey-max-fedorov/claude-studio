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

  return (
    <div style={{
      padding: "8px 16px", borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      display: "flex", gap: 8, alignItems: "flex-end",
    }}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Claude..."
        disabled={disabled}
        rows={1}
        style={{
          flex: 1, padding: "6px 10px", background: "rgba(255, 255, 255, 0.06)",
          color: "#fff", border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: 6, fontSize: 13, fontFamily: "inherit",
          resize: "none", outline: "none", lineHeight: 1.4,
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        style={{
          padding: "6px 12px", background: value.trim() && !disabled ? "#c9a84c" : "rgba(255, 255, 255, 0.06)",
          color: value.trim() && !disabled ? "#0a0f1a" : "#6b7280",
          border: "none", borderRadius: 6, fontSize: 12,
          cursor: value.trim() && !disabled ? "pointer" : "default",
          fontWeight: 600,
        }}
      >
        Send
      </button>
    </div>
  )
}
