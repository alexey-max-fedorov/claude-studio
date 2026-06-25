import React, { useEffect, useRef, useState } from "react"
import type { StudioConfig, ModelInfo, PluginInfo, SkillInfo, EffortLevel } from "@claude-studio/protocol"
import { effortLevelsForModel } from "@claude-studio/protocol"
import { ConnectionStatus } from "./components/ConnectionStatus"
import { ChatLog } from "./components/ChatLog"
import type { Message } from "./components/ChatMessage"
import { SessionControls } from "./components/SessionControls"
import { PromptInput } from "./components/PromptInput"
import { SessionInfoBar, type SessionInfo } from "./components/SessionInfoBar"
import type { SlashCommandInfo } from "./components/CommandAutocomplete"
import { ModelSelector } from "./components/ModelSelector"
import { EffortSelector } from "./components/EffortSelector"
import { ConfigPanel } from "./components/ConfigPanel"

const STORAGE_KEY_MESSAGES = "cs_messages"
const STORAGE_KEY_SESSION_INFO = "cs_session_info"

function SidePanel() {
  const [connectionState, setConnectionState] = useState("disconnected")
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [commands, setCommands] = useState<SlashCommandInfo[]>([])
  const [tab, setTab] = useState<"chat" | "agent">("chat")
  const [studioConfig, setStudioConfig] = useState<StudioConfig | null>(null)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([])
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([])
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const restoredRef = useRef(false)

  // Restore persisted state on mount
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY_MESSAGES, STORAGE_KEY_SESSION_INFO], (result) => {
      const savedMessages = result[STORAGE_KEY_MESSAGES] as Message[] | undefined
      const savedSessionInfo = result[STORAGE_KEY_SESSION_INFO] as SessionInfo | undefined
      if (savedMessages?.length) {
        setMessages(savedMessages)
      }
      if (savedSessionInfo) {
        setSessionInfo(savedSessionInfo)
      }
      restoredRef.current = true
    })
  }, [])

  // Persist messages and sessionInfo on change
  useEffect(() => {
    if (!restoredRef.current) return
    chrome.storage.local.set({ [STORAGE_KEY_MESSAGES]: messages })
  }, [messages])

  useEffect(() => {
    if (!restoredRef.current) return
    chrome.storage.local.set({ [STORAGE_KEY_SESSION_INFO]: sessionInfo })
  }, [sessionInfo])

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "stream" })
    portRef.current = port

    const onMessage = (msg: any) => {
      switch (msg.type) {
        case "connection_state":
          setConnectionState(msg.state)
          // The agent emits `connected`/`config_state` only once per WS session —
          // which usually happens before this panel is open, so we can't rely on it.
          // connection_state is delivered to the panel on connect AND on every state
          // change, so (re)sync capabilities + config whenever we observe a live link.
          if (msg.state === "connected") {
            portRef.current?.postMessage({ type: "query_capabilities" })
            portRef.current?.postMessage({ type: "get_config" })
          }
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

        case "ai_thinking":
          setIsStreaming(true)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === "thinking") {
              return [...prev.slice(0, -1), { ...last, content: last.content + msg.chunk }]
            }
            return [...prev, { role: "thinking", content: msg.chunk, timestamp: Date.now() }]
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
          // Re-request capabilities after query (commands get cached server-side)
          portRef.current?.postMessage({ type: "query_capabilities" })
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
            { role: "command_output" as const, content: msg.content, timestamp: Date.now() },
          ])
          break

        case "config_state":
          // Realtime config sync — any change from the TUI or another client lands here.
          setStudioConfig(msg.config)
          setAvailableModels(msg.availableModels)
          setAvailablePlugins(msg.availablePlugins)
          setAvailableSkills(msg.availableSkills)
          break

        case "session_reset":
          // newSessionId is the hardcoded "reset" clear-signal, NOT a real id.
          // Clear the chat log and reset UI state; never store/display "reset".
          setIsStreaming(false)
          setMessages([])
          setSessionInfo(null)
          chrome.storage.local.remove([STORAGE_KEY_MESSAGES, STORAGE_KEY_SESSION_INFO])
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


  const patchConfig = (patch: Partial<StudioConfig>) => {
    portRef.current?.postMessage({ type: "set_config", patch })
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
          {availableModels.length > 0 && (
            <ModelSelector
              models={availableModels}
              current={studioConfig?.model ?? ""}
              onSelect={(model) => patchConfig({ model })}
              disabled={isStreaming || connectionState !== "connected"}
            />
          )}
          {studioConfig && (
            <EffortSelector
              levels={effortLevelsForModel(studioConfig.model)}
              current={studioConfig.effort ?? "high"}
              onSelect={(effort) => patchConfig({ effort })}
              disabled={isStreaming || connectionState !== "connected"}
            />
          )}
          <ConnectionStatus state={connectionState} />
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
        {(["chat", "agent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 0", background: "transparent", border: "none", cursor: "pointer",
              color: tab === t ? "#c9a84c" : "#a0a0a0", fontSize: 13, fontWeight: 600,
              borderBottom: tab === t ? "2px solid #c9a84c" : "2px solid transparent",
            }}
          >
            {t === "chat" ? "Chat" : "Agent"}
          </button>
        ))}
      </div>

      {tab === "agent" && studioConfig ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ConfigPanel
            config={studioConfig}
            models={availableModels}
            availablePlugins={availablePlugins}
            availableSkills={availableSkills}
            onPatch={patchConfig}
          />
        </div>
      ) : tab === "agent" ? (
        <div style={{ flex: 1, padding: 16, color: "#666", fontSize: 13 }}>
          Waiting for agent config…
        </div>
      ) : (
        <>
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

          <SessionControls onClearChat={() => {
            setMessages([])
            setSessionInfo(null)
            chrome.storage.local.remove([STORAGE_KEY_MESSAGES, STORAGE_KEY_SESSION_INFO])
          }} />
        </>
      )}
    </div>
  )
}

export default SidePanel
