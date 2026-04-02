import React from "react"

export interface Message {
  role: "user" | "assistant" | "tool" | "error" | "system"
  content: string
  tool?: string
  timestamp: number
}

export function ChatMessage({ message }: { message: Message }) {
  if (message.role === "tool") {
    return (
      <div style={{
        padding: "4px 8px", fontSize: 11, fontFamily: "ui-monospace, monospace",
        color: "#6b7280", borderLeft: "2px solid rgba(201, 168, 76, 0.3)", marginLeft: 8,
      }}>
        {message.tool} {message.content}
      </div>
    )
  }

  if (message.role === "error") {
    return (
      <div style={{
        padding: "8px 12px", fontSize: 13, color: "#ef4444",
        background: "rgba(239, 68, 68, 0.08)", borderRadius: 8,
        border: "1px solid rgba(239, 68, 68, 0.2)",
      }}>
        {message.content}
      </div>
    )
  }

  if (message.role === "system") {
    return (
      <div style={{ padding: "4px 0", fontSize: 11, color: "#6b7280", textAlign: "center" }}>
        {message.content}
      </div>
    )
  }

  const isUser = message.role === "user"
  return (
    <div style={{
      padding: "8px 12px", fontSize: 13,
      color: isUser ? "#fff" : "#d1d5db",
      background: isUser ? "rgba(201, 168, 76, 0.12)" : "rgba(255, 255, 255, 0.04)",
      borderRadius: 8, alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "90%", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5,
    }}>
      {message.content}
    </div>
  )
}
