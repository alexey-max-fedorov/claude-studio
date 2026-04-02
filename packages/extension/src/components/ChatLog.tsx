import React, { useEffect, useRef } from "react"
import { ChatMessage, type Message } from "./ChatMessage"

export function ChatLog({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div style={{
      flex: 1, overflowY: "auto", display: "flex", flexDirection: "column",
      gap: 8, padding: "8px 12px",
    }}>
      {messages.length === 0 && (
        <div style={{ textAlign: "center", color: "#4b5563", fontSize: 13, marginTop: 40 }}>
          Select an element on the page and describe a change.
        </div>
      )}
      {messages.map((msg, i) => (
        <ChatMessage key={i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
