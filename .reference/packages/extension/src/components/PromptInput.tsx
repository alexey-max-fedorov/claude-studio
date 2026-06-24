import React, { useRef, useState } from "react"
import { CommandAutocomplete, type SlashCommandInfo } from "./CommandAutocomplete"

interface PromptInputProps {
  onSubmit: (prompt: string) => void
  disabled?: boolean
  commands?: SlashCommandInfo[]
}

export function PromptInput({ onSubmit, disabled, commands = [] }: PromptInputProps) {
  const [value, setValue] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const autocompleteFilter = value.startsWith("/") && !value.includes(" ")
    ? value.slice(1)
    : ""

  const filteredCommands = commands.filter((c) =>
    c.name.toLowerCase().includes(autocompleteFilter.toLowerCase())
  ).slice(0, 8)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)
    const shouldShow = v.startsWith("/") && !v.includes(" ") && commands.length > 0
    setShowAutocomplete(shouldShow)
    if (shouldShow) setSelectedIndex(0)
  }

  const handleSelectCommand = (cmd: SlashCommandInfo) => {
    setValue(`/${cmd.name} `)
    setShowAutocomplete(false)
    inputRef.current?.focus()
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue("")
    setShowAutocomplete(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutocomplete && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        handleSelectCommand(filteredCommands[selectedIndex])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setShowAutocomplete(false)
        return
      }
    }

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
      position: "relative" as const,
    }}>
      {showAutocomplete && (
        <CommandAutocomplete
          commands={commands}
          filter={autocompleteFilter}
          selectedIndex={selectedIndex}
          onSelect={handleSelectCommand}
        />
      )}
      <textarea
        ref={inputRef}
        className="cs-prompt-input"
        value={value}
        onChange={handleChange}
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
