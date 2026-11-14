import { describe, it, expect, vi, beforeAll } from "vitest"

type Listener = (m: unknown, s: unknown, r: (x: unknown) => void) => void
const listeners: Listener[] = []
const sendMessage = vi.fn(() => Promise.resolve({ ok: true }))

beforeAll(async () => {
  ;(globalThis as any).chrome = {
    runtime: {
      onMessage: { addListener: (l: Listener) => listeners.push(l), removeListener: vi.fn() },
      sendMessage,
    },
  }
  document.body.innerHTML = '<div id="app"><button id="btn" class="primary">Go</button></div>'
  await import("../contents/element-picker")
})

function send(action: string): { active: boolean } {
  let resp: any
  for (const l of listeners) l({ action }, {}, (r) => (resp = r))
  return resp
}
const toggle = () => send("toggle-picker")

/** Real user clicks are trusted; jsdom marks script-dispatched events untrusted, so flip the impl flag. */
async function trustedClick(el: Element) {
  // @ts-expect-error jsdom internals have no type declarations
  const utils: any = await import("jsdom/lib/jsdom/living/generated/utils.js")
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true })
  const impl = utils.implForWrapper(ev)
  impl.isTrusted = true
  // dispatchEvent() would reset isTrusted to false; dispatch on the impl directly like the UA does.
  utils.implForWrapper(el)._dispatch(impl)
}

const pickedCalls = () => sendMessage.mock.calls.map((c: any[]) => c[0]).filter((m: any) => m.action === "element-picked")

const overlay = () => document.querySelector("claude-studio-picker")

describe("element picker content script", () => {
  it("toggles the overlay on and off", () => {
    expect(toggle()).toEqual({ active: true })
    expect(overlay()).not.toBeNull()
    expect(toggle()).toEqual({ active: false })
    expect(overlay()).toBeNull()
  })

  it("explicit start/stop are idempotent and announce state", () => {
    sendMessage.mockClear()
    expect(send("picker-start")).toEqual({ active: true })
    expect(send("picker-start")).toEqual({ active: true })
    expect(send("picker-stop")).toEqual({ active: false })
    expect(send("picker-stop")).toEqual({ active: false })
    const states = sendMessage.mock.calls.map((c: any[]) => c[0]).filter((m: any) => m.action === "picker-state")
    expect(states).toEqual([
      { action: "picker-state", active: true },
      { action: "picker-state", active: false },
    ])
  })

  it("ignores synthetic (untrusted) clicks from the page", () => {
    sendMessage.mockClear()
    const pageClick = vi.fn()
    const btn = document.getElementById("btn")!
    btn.addEventListener("click", pageClick)
    send("picker-start")
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }))
    expect(pickedCalls()).toHaveLength(0)
    expect(pageClick).not.toHaveBeenCalled() // still swallowed
    expect(overlay()).not.toBeNull() // still picking
    send("picker-stop")
    btn.removeEventListener("click", pageClick)
  })

  it("Esc cancels", () => {
    toggle()
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    expect(overlay()).toBeNull()
  })

  it("click picks the element, the page never sees the click, and sends an element attachment", async () => {
    const pageClick = vi.fn()
    const btn = document.getElementById("btn")!
    btn.addEventListener("click", pageClick)
    sendMessage.mockClear()
    toggle()
    await trustedClick(btn)
    expect(pageClick).not.toHaveBeenCalled()
    expect(pickedCalls()).toHaveLength(1)
    const msg = pickedCalls()[0]
    expect(msg.action).toBe("element-picked")
    expect(msg.attachment.type).toBe("element")
    expect(msg.attachment.url).toBe(location.href)
    expect(msg.attachment.element.cssSelector).toBe("#btn")
    // auto-exit after the short confirmation
    await new Promise((r) => setTimeout(r, 700))
    expect(overlay()).toBeNull()
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(pageClick).toHaveBeenCalledTimes(1)
  })
})
