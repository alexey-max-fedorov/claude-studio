import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import React, { useEffect, useRef, useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"
import { captureElement } from "../lib/element-capture"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    .cc-highlight {
      position: fixed;
      pointer-events: none;
      border: 2px solid #c9a84c;
      background: rgba(201, 168, 76, 0.08);
      z-index: 2147483646;
      transition: top 0.08s ease, left 0.08s ease, width 0.08s ease, height 0.08s ease;
      border-radius: 2px;
    }
    .cc-highlight-selected {
      position: fixed;
      pointer-events: none;
      border: 2px solid #c9a84c;
      background: transparent;
      z-index: 2147483646;
      border-radius: 2px;
    }
    .cc-highlight-working {
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border-radius: 4px;
      padding: 2px;
      background: linear-gradient(90deg, #c9a84c 0%, #000 25%, #c9a84c 50%, #000 75%, #c9a84c 100%);
      background-size: 200% 100%;
      animation: cc-border-flow 1.5s linear infinite;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
    }
    @keyframes cc-border-flow {
      from { background-position: 0% 0%; }
      to { background-position: -200% 0%; }
    }
    .cc-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      background: #000;
      color: #c9a84c;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      white-space: nowrap;
      border: 1px solid rgba(201, 168, 76, 0.25);
    }
  `
  return style
}

// ---------------------------------------------------------------------------
// Module-level listeners — fire as soon as Chrome loads this content script,
// BEFORE Plasmo mounts the React component into the shadow DOM.
// We bridge to React via a custom window event.
// ---------------------------------------------------------------------------
const TOGGLE_EVENT = "__claude_studio_toggle_picker__"
const WORKING_EVENT = "__claude_studio_highlight_working__"
const CLEAR_EVENT = "__claude_studio_highlight_clear__"
const TEXTAREA_FOCUS_EVENT = "__claude_studio_textarea_focus__"

// Picker activation mode: "toggle" (Ctrl+Shift+E) or "hold" (Hold Shift)
let pickerMode: "toggle" | "hold" = "toggle"
let textareaFocused = false

// Load saved picker mode
chrome.storage.sync.get("pickerMode", (result) => {
  if (result.pickerMode) pickerMode = result.pickerMode
})

// Track textarea focus from prompt widget (suppresses shift-hold in textarea)
window.addEventListener(TEXTAREA_FOCUS_EVENT, ((e: CustomEvent) => {
  textareaFocused = e.detail.focused
}) as EventListener)

// 1. chrome.runtime.onMessage — receives from background / side panel / other content scripts
chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === "toggle-picker") {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))
  }
  if (message.action === "highlight-working") {
    window.dispatchEvent(new CustomEvent(WORKING_EVENT))
  }
  if (message.action === "highlight-clear") {
    window.dispatchEvent(new CustomEvent(CLEAR_EVENT))
  }
  if (message.action === "picker-mode-changed") {
    pickerMode = message.mode
  }
})

// 2. Direct keyboard shortcut — Ctrl+Shift+E toggle (works in both modes)
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))
  }
}, true)

// 3. Hold Shift mode — activate picker on shift press, deactivate on release
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (pickerMode === "hold" && e.key === "Shift" && !e.ctrlKey && !e.metaKey && !e.altKey && !textareaFocused) {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: "activate" }))
  }
}, true)

document.addEventListener("keyup", (e: KeyboardEvent) => {
  if (pickerMode === "hold" && e.key === "Shift") {
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: "deactivate" }))
  }
}, true)

// ---------------------------------------------------------------------------

type PickerMode = "off" | "picking" | "selected" | "working"

function ElementPicker() {
  const [mode, setMode] = useState<PickerMode>("off")
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [selectedRect, setSelectedRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const hoveredRef = useRef<Element | null>(null)

  // Subscribe to module-level events
  useEffect(() => {
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === "activate") {
        setMode("picking")
      } else if (detail === "deactivate") {
        setMode("off")
        setHighlight(null)
        setTooltip(null)
        setSelectedRect(null)
        hoveredRef.current = null
      } else {
        // Original toggle behavior (Ctrl+Shift+E or chrome.commands)
        setMode((prev) => prev === "off" ? "picking" : "off")
        setHighlight(null)
        setTooltip(null)
        setSelectedRect(null)
        hoveredRef.current = null
      }
    }

    const onWorking = () => {
      setMode("working")
    }

    const onClear = () => {
      setMode("off")
      setHighlight(null)
      setTooltip(null)
      setSelectedRect(null)
      hoveredRef.current = null
    }

    window.addEventListener(TOGGLE_EVENT, onToggle)
    window.addEventListener(WORKING_EVENT, onWorking)
    window.addEventListener(CLEAR_EVENT, onClear)
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onToggle)
      window.removeEventListener(WORKING_EVENT, onWorking)
      window.removeEventListener(CLEAR_EVENT, onClear)
    }
  }, [])

  // Picking mode — hover tracking and click to select
  useEffect(() => {
    if (mode !== "picking") return

    const isExtensionEl = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      return tag.startsWith("plasmo-") ||
        tag.startsWith("nextjs-") ||
        el.closest("nextjs-portal") !== null
    }

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el === hoveredRef.current || isExtensionEl(el)) return
      hoveredRef.current = el

      const rect = el.getBoundingClientRect()
      setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })

      const tag = el.tagName.toLowerCase()
      const cls = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 2).join(".")}` : ""
      const id = el.id ? `#${el.id}` : ""
      setTooltip({ x: e.clientX + 12, y: e.clientY + 12, text: `${tag}${id}${cls}` })
    }

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || isExtensionEl(el)) return

      const selection = captureElement(el)
      const rect = el.getBoundingClientRect()
      const rectData = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }

      // Switch to selected mode — keep highlight visible
      setSelectedRect(rectData)
      setHighlight(null)
      setTooltip(null)
      setMode("selected")

      sendToBackground({
        name: "element-selected",
        body: {
          selection,
          position: {
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
          },
        },
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("off")
        setHighlight(null)
        setTooltip(null)
        setSelectedRect(null)
      }
    }

    document.addEventListener("mousemove", onMouseMove, true)
    document.addEventListener("click", onClick, true)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [mode])

  if (mode === "off") return null

  return (
    <>
      {/* Picking mode — hover highlight with fill */}
      {mode === "picking" && highlight && (
        <div
          className="cc-highlight"
          style={{ top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height }}
        />
      )}
      {mode === "picking" && tooltip && (
        <div className="cc-tooltip" style={{ top: tooltip.y, left: tooltip.x }}>
          {tooltip.text}
        </div>
      )}

      {/* Selected mode — solid gold outline, no fill */}
      {mode === "selected" && selectedRect && (
        <div
          className="cc-highlight-selected"
          style={{ top: selectedRect.top, left: selectedRect.left, width: selectedRect.width, height: selectedRect.height }}
        />
      )}

      {/* Working mode — animated gradient outline */}
      {mode === "working" && selectedRect && (
        <div
          className="cc-highlight-working"
          style={{ top: selectedRect.top, left: selectedRect.left, width: selectedRect.width, height: selectedRect.height }}
        />
      )}
    </>
  )
}

export default ElementPicker
