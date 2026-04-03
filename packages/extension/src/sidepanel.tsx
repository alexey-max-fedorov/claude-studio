import React, { useEffect, useRef, useState } from "react"
import { ConnectionStatus } from "./components/ConnectionStatus"
import { ChatLog } from "./components/ChatLog"
import type { Message } from "./components/ChatMessage"
import { SessionControls } from "./components/SessionControls"
import { PromptInput } from "./components/PromptInput"

function SidePanel() {
  const [connectionState, setConnectionState] = useState("disconnected")
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "stream" })
    portRef.current = port

    const onMessage = (msg: any) => {
      switch (msg.type) {
        case "connection_state":
          setConnectionState(msg.state)
          break

        case "ai_streaming":
          setIsStreaming(true)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, content: last.content + msg.chunk }]
            }
            return [...prev, { role: "assistant", content: msg.chunk, timestamp: Date.now() }]
          })
          break

        case "tool_use":
          setMessages((prev) => [
            ...prev,
            { role: "tool" as const, content: JSON.stringify(msg.input).slice(0, 100), tool: msg.tool, timestamp: Date.now() },
          ])
          break

        case "ai_complete":
          setIsStreaming(false)
          setMessages((prev) => [
            ...prev,
            { role: "system" as const, content: `Done (${msg.turns} turns, $${(msg.cost || 0).toFixed(4)})`, timestamp: Date.now() },
          ])
          break

        case "ai_error":
          setIsStreaming(false)
          setMessages((prev) => [
            ...prev,
            { role: "error" as const, content: msg.error, timestamp: Date.now() },
          ])
          break
      }
    }
    port.onMessage.addListener(onMessage)

    return () => {
      port.onMessage.removeListener(onMessage)
      port.disconnect()
      portRef.current = null
    }
  }, [])

  const handleSendPrompt = (prompt: string) => {
    setMessages((prev) => [...prev, { role: "user", content: prompt, timestamp: Date.now() }])
    portRef.current?.postMessage({ type: "raw_prompt", prompt })
  }

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex", flexDirection: "column",
      background: "#0a0f1a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes cc-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .cc-working-dot {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #c9a84c;
          margin: 0 2px;
        }
        .cc-working-dot:nth-child(1) { animation: cc-pulse 1.2s ease infinite 0s; }
        .cc-working-dot:nth-child(2) { animation: cc-pulse 1.2s ease infinite 0.2s; }
        .cc-working-dot:nth-child(3) { animation: cc-pulse 1.2s ease infinite 0.4s; }
      `}</style>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#c9a84c" }}>Claude Studio</span>
        <ConnectionStatus state={connectionState} />
      </div>

      <ChatLog messages={messages} />

      {isStreaming && (
        <div style={{
          padding: "8px 16px", borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          fontSize: 12, color: "#c9a84c",
        }}>
          <span style={{ marginRight: 8 }}>Claude is working</span>
          <span className="cc-working-dot" />
          <span className="cc-working-dot" />
          <span className="cc-working-dot" />
        </div>
      )}

      <PromptInput
        onSubmit={handleSendPrompt}
        disabled={isStreaming || connectionState !== "connected"}
      />

      <SessionControls onClearChat={() => setMessages([])} />
    </div>
  )
}

export default SidePanel
