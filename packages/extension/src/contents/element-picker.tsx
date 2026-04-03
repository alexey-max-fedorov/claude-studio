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
      background: #0a0f1a;
      color: #c9a84c;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      white-space: nowrap;
      border: 1px solid rgba(201, 168, 76, 0.3);
    }
  `
  return style
}

function ElementPicker() {
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const hoveredRef = useRef<Element | null>(null)

  useEffect(() => {
    const listener = (message: any) => {
      if (message.action === "toggle-picker") {
        setActive((prev) => !prev)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  useEffect(() => {
    if (!active) {
      setHighlight(null)
      setTooltip(null)
      hoveredRef.current = null
      return
    }

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el === hoveredRef.current) return
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
      if (!el) return

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
