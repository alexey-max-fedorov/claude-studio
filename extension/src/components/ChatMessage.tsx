import React from "react"
import { MarkdownLite } from "./MarkdownLite"

export interface Message {
  role: "user" | "assistant" | "tool" | "error" | "system" | "command_output"
  content: string
  tool?: string
  timestamp: number
}

export function ChatMessage({ message }: { message: Message }) {
  if (message.role === "tool") {
    return (
      <div style={{
        padding: "4px 8px", fontSize: 11, fontFamily: "ui-monospace, monospace",
        color: "#666", borderLeft: "2px solid rgba(201, 168, 76, 0.3)", marginLeft: 8,
      }}>
        {message.tool} {message.content}
      </div>
    )
  }

  if (message.role === "error") {
    return (
      <div style={{
        padding: "10px 14px", fontSize: 13, color: "#ef4444",
        background: "rgba(239, 68, 68, 0.08)", borderRadius: 8,
        border: "1px solid rgba(239, 68, 68, 0.2)",
      }}>
        {message.content}
      </div>
    )
  }

  if (message.role === "system") {
    return (
      <div style={{ padding: "4px 0", fontSize: 11, color: "#666", textAlign: "center" }}>
        {message.content}
      </div>
    )
  }

  if (message.role === "command_output") {
    return (
      <div style={{
        padding: "10px 14px", fontSize: 13, color: "#a0a0a0",
        background: "#0a0a0a", border: "1px solid #1a1a1a",
        borderRadius: 8, alignSelf: "flex-start" as const,
        maxWidth: "90%", lineHeight: 1.5,
        overflowWrap: "anywhere" as const,
      }}>
        <MarkdownLite text={message.content} />
      </div>
    )
  }

  const isUser = message.role === "user"
  return (
    <div style={{
      padding: "10px 14px", fontSize: 13,
      color: isUser ? "#fff" : "#a0a0a0",
      background: isUser ? "rgba(201, 168, 76, 0.1)" : "#111",
      border: isUser ? "1px solid rgba(201,168,76,0.15)" : "1px solid #1a1a1a",
      borderRadius: 8, alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "90%", whiteSpace: "pre-wrap", wordBreak: "break-word",
      overflowWrap: "anywhere" as const, lineHeight: 1.5,
    }}>
      {isUser ? message.content : <MarkdownLite text={message.content} />}
    </div>
  )
}
