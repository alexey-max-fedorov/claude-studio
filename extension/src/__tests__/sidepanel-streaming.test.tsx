import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import SidePanel from "../sidepanel"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (!(Element.prototype as any).scrollIntoView) (Element.prototype as any).scrollIntoView = () => {}

function installChromeMock() {
  const listeners: ((m: any) => void)[] = []
  const port = {
    name: "stream",
    postMessage: () => {},
    onMessage: { addListener: (fn: any) => listeners.push(fn), removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    disconnect: () => {},
  }
  ;(globalThis as any).chrome = {
    runtime: { connect: () => port },
    storage: { local: { get: (_k: any, cb: any) => cb({}), set: () => {}, remove: () => {} } },
  }
  return { emit: (m: any) => listeners.forEach((fn) => fn(m)) }
}

describe("SidePanel live streaming + thinking", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("concatenates streamed text deltas and shows thinking", async () => {
    const chrome = installChromeMock()
    const root = createRoot(container)
    await act(async () => { root.render(<SidePanel />) })
    await act(async () => {
      chrome.emit({ type: "ai_thinking", chunk: "pondering" })
      chrome.emit({ type: "ai_streaming", chunk: "Hel" })
      chrome.emit({ type: "ai_streaming", chunk: "lo" })
    })
    expect(container.textContent).toContain("pondering")
    expect(container.textContent).toContain("Hello")
    await act(async () => { root.unmount() })
  })
})
