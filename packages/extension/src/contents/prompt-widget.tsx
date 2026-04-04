import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import React, { useEffect, useRef, useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"
import type { ElementSelection } from "@claude-studio/shared"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    ::selection { background: rgba(201,168,76,0.3); color: #fff; }
    .cc-prompt-overlay {
      position: fixed; inset: 0; z-index: 2147483646;
    }
    .cc-prompt-widget {
      position: absolute;
      z-index: 2147483647;
      width: 380px;
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(201, 168, 76, 0.25);
      border-radius: 12px;
      padding: 12px;
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      animation: cc-widget-appear 0.15s ease;
    }
    @keyframes cc-widget-appear {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .cc-element-badge {
      display: inline-block;
      background: rgba(201, 168, 76, 0.15);
      color: #c9a84c;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      margin-bottom: 8px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cc-prompt-input {
      width: 100%;
      background: #111;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      outline: none;
      min-height: 60px;
      box-sizing: border-box;
      transition: all 200ms;
    }
    .cc-prompt-input:focus {
      border-color: #c9a84c;
      box-shadow: 0 0 0 1px rgba(201,168,76,0.3);
    }
    .cc-prompt-input::placeholder {
      color: #666;
    }
    .cc-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .cc-btn {
      padding: 6px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 200ms;
    }
    .cc-btn-submit {
      background: #c9a84c;
      color: #000;
      border: none;
    }
    .cc-btn-submit:hover { background: #d4b65e; box-shadow: 0 0 24px rgba(201,168,76,0.4); }
    .cc-btn-submit:active { transform: scale(0.98); }
    .cc-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .cc-btn-cancel {
      background: transparent;
      color: #a0a0a0;
      border: 1px solid #1a1a1a;
    }
    .cc-btn-cancel:hover { background: #1a1a1a; color: #fff; }
    .cc-btn-cancel:active { transform: scale(0.98); }
    .cc-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.95);
      color: #c9a84c;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      border: 1px solid rgba(201, 168, 76, 0.25);
      animation: cc-fade-in 0.2s ease;
    }
    @keyframes cc-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `
  return style
}

interface WidgetState {
  selection: ElementSelection
  position: { top: number; left: number }
}

function PromptWidget() {
  const [widget, setWidget] = useState<WidgetState | null>(null)
  const [prompt, setPrompt] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const listener = (message: any) => {
      if (message.action === "show-prompt-widget") {
        setWidget({ selection: message.selection, position: message.position })
        setPrompt("")
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const handleSubmit = async () => {
    if (!widget || !prompt.trim() || submitting) return
    setSubmitting(true)
    try {
      await sendToBackground({
        name: "submit-prompt",
        body: {
          route: window.location.pathname,
          element: widget.selection,
          prompt: prompt.trim(),
        },
      })
      // Signal element picker to show working animation
      chrome.runtime.sendMessage({ action: "highlight-working" }).catch(() => {})
      setWidget(null)
      setToast(true)
      setTimeout(() => setToast(false), 2500)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Signal element picker to clear highlight
    chrome.runtime.sendMessage({ action: "highlight-clear" }).catch(() => {})
    setWidget(null)
    setPrompt("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  if (toast) {
    return <div className="cc-toast">Sent to Claude Code</div>
  }

  if (!widget) return null

  const { selection, position } = widget
  const badge = `${selection.tagName}${selection.id ? `#${selection.id}` : ""}${selection.classList.length ? `.${selection.classList.slice(0, 2).join(".")}` : ""}`

  const top = Math.min(position.top + 8, window.innerHeight - 250)
  const left = Math.min(Math.max(position.left, 8), window.innerWidth - 400)

  return (
    <div className="cc-prompt-overlay" onClick={handleCancel}>
      <div
        className="cc-prompt-widget"
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cc-element-badge">{badge}</div>
        <textarea
          ref={inputRef}
          className="cc-prompt-input"
          placeholder="What do you want to change?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="cc-actions">
          <button className="cc-btn cc-btn-cancel" onClick={handleCancel}>Cancel</button>
          <button
            className="cc-btn cc-btn-submit"
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting}
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromptWidget
