import React, { useEffect, useRef, useState } from "react"
import { ConnectionStatus } from "./components/ConnectionStatus"
import { ChatLog } from "./components/ChatLog"
import type { Message } from "./components/ChatMessage"
import { SessionControls } from "./components/SessionControls"
import { PromptInput } from "./components/PromptInput"
import { SessionInfoBar, type SessionInfo } from "./components/SessionInfoBar"
import type { SlashCommandInfo } from "./components/CommandAutocomplete"
import { ModelSelector, type ModelInfo } from "./components/ModelSelector"

function SidePanel() {
  const [connectionState, setConnectionState] = useState("disconnected")
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [commands, setCommands] = useState<SlashCommandInfo[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [currentModel, setCurrentModel] = useState("")
  const portRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "stream" })
    portRef.current = port

    const onMessage = (msg: any) => {
      switch (msg.type) {
        case "connection_state":
          setConnectionState(msg.state)
          break

        case "connected":
          portRef.current?.postMessage({ type: "query_capabilities" })
          portRef.current?.postMessage({ type: "query_models" })
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
          setSessionInfo((prev) => ({
            model: msg.model || prev?.model || "sonnet",
            cumulativeCost: (prev?.cumulativeCost || 0) + (msg.cost || 0),
            cumulativeInputTokens: (prev?.cumulativeInputTokens || 0) + (msg.usage?.input_tokens || 0),
            cumulativeOutputTokens: (prev?.cumulativeOutputTokens || 0) + (msg.usage?.output_tokens || 0),
            turnCount: (prev?.turnCount || 0) + (msg.turns || 0),
            lastDuration: msg.duration_ms,
          }))
          setMessages((prev) => [
            ...prev,
            { role: "system" as const, content: `Done (${msg.turns} turns, $${(msg.cost || 0).toFixed(4)})`, timestamp: Date.now() },
          ])
          // Re-request capabilities and models after query (commands get cached server-side)
          portRef.current?.postMessage({ type: "query_capabilities" })
          portRef.current?.postMessage({ type: "query_models" })
          break

        case "session_info":
          // Authoritative update from server — overwrites client-side estimate
          setSessionInfo((prev) => ({
            model: msg.model,
            cumulativeCost: msg.cumulativeCost,
            cumulativeInputTokens: msg.cumulativeInputTokens,
            cumulativeOutputTokens: msg.cumulativeOutputTokens,
            turnCount: msg.turnCount,
            lastDuration: prev?.lastDuration,
          }))
          break

        case "capabilities":
          setCommands(msg.commands || [])
          break

        case "command_output":
          setMessages((prev) => [
            ...prev,
            { role: "system" as const, content: msg.content, timestamp: Date.now() },
          ])
          break

        case "available_models":
          setModels(msg.models || [])
          setCurrentModel(msg.current || "")
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

  const togglePicker = () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggle-picker" }, () => {
          void chrome.runtime.lastError
        })
      }
    })
  }

  const handleModelSelect = (modelId: string) => {
    setMessages((prev) => [...prev, { role: "user", content: `/model ${modelId}`, timestamp: Date.now() }])
    portRef.current?.postMessage({ type: "raw_prompt", prompt: `/model ${modelId}` })
  }

  const handleSendPrompt = (prompt: string) => {
    setMessages((prev) => [...prev, { role: "user", content: prompt, timestamp: Date.now() }])
    portRef.current?.postMessage({ type: "raw_prompt", prompt })
  }

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex", flexDirection: "column",
      background: "#000", color: "#fff",
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
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
        .cs-prompt-input:focus { border-color: #c9a84c !important; box-shadow: 0 0 0 1px rgba(201,168,76,0.3); }
        .cs-btn-session:hover { background: #1a1a1a !important; color: #fff !important; }
        .cs-btn-outline:hover { background: rgba(201,168,76,0.08) !important; box-shadow: 0 0 16px rgba(201,168,76,0.2); }
        .cs-btn-outline:active { transform: scale(0.98); }
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
        padding: "14px 16px", borderBottom: "1px solid #1a1a1a",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{
          fontSize: 17, fontWeight: 700, color: "#c9a84c",
          fontFamily: '"Playfair Display", Georgia, serif',
          letterSpacing: "-0.02em",
        }}>Claude Studio</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {models.length > 0 && (
            <ModelSelector
              models={models}
              current={currentModel}
              onSelect={handleModelSelect}
              disabled={isStreaming || connectionState !== "connected"}
            />
          )}
          <button
            className="cs-btn-outline"
            onClick={togglePicker}
            title="Toggle element picker (Ctrl+Shift+E)"
            style={{
              background: "transparent", border: "1px solid #c9a84c", borderRadius: 6,
              color: "#c9a84c", cursor: "pointer", fontSize: 11, padding: "4px 10px",
              fontWeight: 600, transition: "all 200ms",
            }}
          >
            Pick
          </button>
          <ConnectionStatus state={connectionState} />
        </div>
      </div>

      <SessionInfoBar info={sessionInfo} />

      <ChatLog messages={messages} />

      {isStreaming && (
        <div style={{
          padding: "10px 16px", borderTop: "1px solid #1a1a1a",
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
        commands={commands}
      />

      <SessionControls onClearChat={() => { setMessages([]); setSessionInfo(null) }} />
    </div>
  )
}

export default SidePanel
