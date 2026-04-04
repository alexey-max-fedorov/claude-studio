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

// 1. chrome.runtime.onMessage — receives from background / side panel
chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === "toggle-picker") {
    console.log("[Claude Studio] toggle-picker message received")
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))
  }
})

// 2. Direct keyboard shortcut — catches Ctrl+Shift+E in the page even if
//    chrome.commands doesn't deliver it. Note: Chrome may intercept this
//    for the registered command, in which case the background handler fires
//    instead and sends a message that hits listener #1 above.
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
    e.preventDefault()
    console.log("[Claude Studio] Ctrl+Shift+E caught directly")
    window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))
  }
}, true)

console.log("[Claude Studio] element-picker content script loaded")

// ---------------------------------------------------------------------------

function ElementPicker() {
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const hoveredRef = useRef<Element | null>(null)

  // Subscribe to the module-level toggle event
  useEffect(() => {
    console.log("[Claude Studio] ElementPicker component mounted")
    const onToggle = () => {
      console.log("[Claude Studio] toggle event received by React")
      setActive((prev) => !prev)
    }
    window.addEventListener(TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle)
  }, [])

  useEffect(() => {
    if (!active) {
      setHighlight(null)
      setTooltip(null)
      hoveredRef.current = null
      return
    }

    console.log("[Claude Studio] picker activated")

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

      sendToBackground({
        name: "element-selected",
        body: {
          selection,
          position: {
            top: el.getBoundingClientRect().bottom + window.scrollY,
            left: el.getBoundingClientRect().left + window.scrollX,
          },
        },
      })

      // Deactivate picker so prompt widget buttons are clickable
      setTimeout(() => setActive(false), 50)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false)
    }

    document.addEventListener("mousemove", onMouseMove, true)
    document.addEventListener("click", onClick, true)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [active])

  if (!active) return null

  return (
    <>
      {highlight && (
        <div
          className="cc-highlight"
          style={{ top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height }}
        />
      )}
      {tooltip && (
        <div className="cc-tooltip" style={{ top: tooltip.y, left: tooltip.x }}>
          {tooltip.text}
        </div>
      )}
    </>
  )
}

export default ElementPicker
