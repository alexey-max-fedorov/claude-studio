import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import SidePanel from "../sidepanel"

// React's createRoot/act needs this flag set in a non-browser test env.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
// jsdom doesn't implement scrollIntoView (used by ChatLog's auto-scroll).
if (!(Element.prototype as any).scrollIntoView) {
  ;(Element.prototype as any).scrollIntoView = () => {}
}

interface FakePort {
  name: string
  postMessage: (m: any) => void
  onMessage: { addListener: (fn: (m: any) => void) => void; removeListener: (fn: (m: any) => void) => void }
  onDisconnect: { addListener: (fn: () => void) => void; removeListener: (fn: () => void) => void }
  disconnect: () => void
}

function installChromeMock() {
  const listeners: ((m: any) => void)[] = []
  const posted: any[] = []
  const port: FakePort = {
    name: "stream",
    postMessage: (m) => posted.push(m),
    onMessage: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      },
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    disconnect: () => {},
  }
  ;(globalThis as any).chrome = {
    runtime: { connect: () => port },
    storage: {
      local: {
        get: (_keys: any, cb: (r: any) => void) => cb({}),
        set: () => {},
        remove: () => {},
      },
    },
  }
  return { posted, emit: (m: any) => listeners.forEach((fn) => fn(m)) }
}

describe("SidePanel config bootstrap", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
  })

  it("requests config when the connection is reported connected, without a `connected` message", async () => {
    const chrome = installChromeMock()
    const root = createRoot(container)
    await act(async () => {
      root.render(<SidePanel />)
    })

    // Reproduce the real-world timing: the agent already emitted its one-shot
    // `connected`/`config_state` before this panel opened, so all the panel ever
    // sees on mount is the background-synthesized connection_state.
    await act(async () => {
      chrome.emit({ type: "connection_state", state: "connected" })
    })

    const askedForConfig = chrome.posted.some((m) => m.type === "get_config")
    expect(askedForConfig).toBe(true)

    await act(async () => {
      root.unmount()
    })
  })
})
