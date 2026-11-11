import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "./render"

const capture = vi.hoisted(() => ({
  captureAttachment: vi.fn(async () => ({ type: "page", url: "https://example.com/", title: "Example" })),
  startPicker: vi.fn(async () => true),
  stopPicker: vi.fn(async () => {}),
}))
vi.mock("../lib/capture", () => capture)

class FakeWS {
  static last: FakeWS | null = null
  readyState = 0
  sent: any[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWS.last = this
  }
  send(s: string) {
    this.sent.push(JSON.parse(s))
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
}

type Listener = (...a: any[]) => any

function fakeChrome(opts: { pending?: any[]; local?: Record<string, unknown> } = {}) {
  const local: Record<string, unknown> = { ...(opts.local ?? {}) }
  const runtimeListeners: Listener[] = []
  const area = (store: Record<string, unknown>) => ({
    get: async (k: string | string[]) => {
      const keys = Array.isArray(k) ? k : [k]
      return Object.fromEntries(keys.filter((x) => x in store).map((x) => [x, store[x]]))
    },
    set: async (v: Record<string, unknown>) => void Object.assign(store, v),
    remove: async (k: string | string[]) => void (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]),
  })
  const sendMessage = vi.fn(async (m: any) => (m.action === "take-pending" ? (opts.pending ?? []) : undefined))
  return {
    local,
    sendMessage,
    runtimeListeners,
    api: {
      storage: { local: area(local), session: area({}), onChanged: { addListener() {}, removeListener() {} } },
      windows: { getCurrent: async () => ({ id: 1 }) },
      runtime: {
        sendMessage,
        onMessage: { addListener: (l: Listener) => runtimeListeners.push(l), removeListener() {} },
      },
    },
  }
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
const P = "/Users/me/Projects/webapp"
const CONFIG = {
  type: "config_state",
  config: { projectDir: P, model: "", effort: "", permissionMode: "acceptEdits", systemPromptAppend: "", maxBudgetUsd: null, maxTurns: null },
  models: [{ value: "", displayName: "Default", description: "" }],
  commands: [],
  permissionModes: ["default", "acceptEdits", "bypassPermissions"],
}

function typeInto(ta: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, value)
    ta.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
function pressEnter(ta: HTMLTextAreaElement) {
  act(() => void ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
}
const button = (root: Element, text: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement

async function mount(opts: Parameters<typeof fakeChrome>[0] = {}) {
  const c = fakeChrome(opts)
  ;(globalThis as any).chrome = c.api
  const { SidePanel } = await import("../sidepanel")
  const r = render(<SidePanel />)
  await flush()
  await flush()
  const ws = FakeWS.last!
  act(() => ws.open())
  act(() => {
    ws.push({ type: "hello", serverVersion: "3.0.0", protocol: 3, projectDir: P })
    ws.push(CONFIG)
  })
  const ta = r.container.querySelector("textarea")!
  return { ...r, ws, ta, chrome: c }
}

function sendText(m: Awaited<ReturnType<typeof mount>>, text: string) {
  typeInto(m.ta, text)
  pressEnter(m.ta)
  return m.ws.sent.filter((x) => x.type === "send").at(-1)
}

describe("SidePanel", () => {
  beforeEach(() => {
    ;(globalThis as any).WebSocket = FakeWS
    capture.startPicker.mockReset().mockResolvedValue(true)
    capture.stopPicker.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).chrome
    document.body.innerHTML = ""
  })

  it("connects, renders state, streams a reply and answers a permission", async () => {
    const m = await mount()
    const { container, ws } = m
    expect(ws.url).toBe("ws://127.0.0.1:7281")
    expect(ws.sent[0]).toEqual({ type: "get_state" })
    expect(container.querySelector(".proj-name")?.textContent).toBe("webapp")

    const sendMsg = sendText(m, "hello there")
    expect(sendMsg).toMatchObject({ text: "hello there", attachments: [] })
    expect(sendMsg.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    const sid = sendMsg.sessionId
    expect(container.querySelector(".msg-user.is-local")?.textContent).toContain("hello there")

    act(() => {
      ws.push({ type: "event", sessionId: sid, event: { kind: "status", state: "starting" } })
      ws.push({ type: "event", sessionId: sid, event: { kind: "item", item: { kind: "user", id: "agent-u1", text: "hello there", attachments: [], ts: Date.now() } } })
      ws.push({ type: "event", sessionId: sid, event: { kind: "status", state: "running" } })
      ws.push({ type: "event", sessionId: sid, event: { kind: "text_delta", id: "m1:0", text: "Hi **Ada**" } })
    })
    expect(container.querySelectorAll(".msg-user")).toHaveLength(1)
    expect(container.querySelector(".msg-user.is-local")).toBeNull()
    expect(container.querySelector(".md-streaming strong")?.textContent).toBe("Ada")

    act(() => ws.push({ type: "event", sessionId: sid, event: { kind: "permission_request", requestId: "r1", toolName: "Bash", input: { command: "ls" }, canAlwaysAllow: false } }))
    act(() => button(container.querySelector(".perm")!, "Allow").click())
    expect(ws.sent.at(-1)).toEqual({ type: "permission_response", sessionId: sid, requestId: "r1", behavior: "allow" })
    act(() => ws.push({ type: "event", sessionId: sid, event: { kind: "permission_resolved", requestId: "r1", behavior: "allow" } }))
    expect(container.querySelector(".perm")).toBeNull()

    act(() => (container.querySelector(".btn-stop") as HTMLButtonElement).click())
    expect(ws.sent.at(-1)).toEqual({ type: "interrupt", sessionId: sid })

    act(() => {
      ws.push({ type: "event", sessionId: sid, event: { kind: "item", item: { kind: "assistant", id: "m1:0", text: "Hi **Ada**, done.", ts: 1 } } })
      ws.push({ type: "event", sessionId: sid, event: { kind: "status", state: "idle" } })
    })
    expect(container.querySelector(".md-streaming")).toBeNull()
    expect(m.chrome.local["currentSessionId:1"]).toBe(sid)
    expect(m.chrome.local.currentSessionId).toBe(sid)
    expect(m.chrome.local["currentSessionStarted:1"]).toBe(true)
  })

  it("validates locally and keeps the draft when the agent would reject the message", async () => {
    const m = await mount()
    const huge = "x".repeat(200_001)
    sendText(m, huge)
    expect(m.ws.sent.some((x) => x.type === "send")).toBe(false)
    expect(m.ta.value).toBe(huge)
    expect(m.container.querySelector(".notice-error")?.textContent).toMatch(/Can't send/)
    expect(m.container.querySelector(".msg-user")).toBeNull()
  })

  it("restores the message to the box when the socket drops before the echo", async () => {
    const m = await mount()
    sendText(m, "please do it")
    expect(m.ta.value).toBe("")
    act(() => m.ws.drop())
    expect(m.ta.value).toBe("please do it")
    expect(m.container.querySelector(".msg-user")).toBeNull()
    expect(m.container.querySelector(".notice-error")?.textContent).toMatch(/Connection dropped/)
  })

  it("restores the message on a session-less error right after sending", async () => {
    const m = await mount()
    sendText(m, "bad one")
    act(() => m.ws.push({ type: "error", error: "Invalid message: attachments[0].url must be a string" }))
    expect(m.ta.value).toBe("bad one")
    expect(m.container.querySelector(".msg-user")).toBeNull()
    expect(m.container.querySelector(".notice-error")?.textContent).toMatch(/Not delivered/)
  })

  it("marks the bubble failed after the echo timeout and retries it", async () => {
    const m = await mount()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const first = sendText(m, "anyone there")
    act(() => void vi.advanceTimersByTime(15_500))
    const bubble = m.container.querySelector(".msg-user.is-failed")!
    expect(bubble).not.toBeNull()
    act(() => button(bubble, "Retry").click())
    const sends = m.ws.sent.filter((x) => x.type === "send")
    expect(sends).toHaveLength(2)
    expect(sends[1]).toEqual(first)
    expect(m.container.querySelector(".msg-user.is-failed")).toBeNull()
    // the echo resolves it for good
    act(() => m.ws.push({ type: "event", sessionId: first.sessionId, event: { kind: "item", item: { kind: "user", id: "e1", text: "anyone there", attachments: [], ts: Date.now() } } }))
    act(() => void vi.advanceTimersByTime(20_000))
    expect(m.container.querySelector(".msg-user.is-failed")).toBeNull()
    expect(m.container.querySelectorAll(".msg-user")).toHaveLength(1)
  })

  it("does not fail a queued send while the session is busy", async () => {
    const m = await mount()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const first = sendText(m, "first")
    act(() => m.ws.push({ type: "event", sessionId: first.sessionId, event: { kind: "status", state: "running" } }))
    act(() => void vi.advanceTimersByTime(40_000))
    expect(m.container.querySelector(".msg-user.is-failed")).toBeNull()
  })

  it("takes pending attachments for its own window from the background", async () => {
    const m = await mount({ pending: [{ type: "page", url: "https://a.example/", title: "A page" }] })
    expect(m.chrome.sendMessage).toHaveBeenCalledWith({ action: "take-pending", windowId: 1 })
    expect(m.container.querySelector(".chips-pending")?.textContent).toContain("A page")
  })

  it("picker button starts, shows the hint only when active, and stops", async () => {
    const m = await mount()
    const pick = () => m.container.querySelector('button[aria-label="Pick an element on the page"], button[aria-label="Stop picking"]') as HTMLButtonElement
    capture.startPicker.mockResolvedValueOnce(false)
    await act(async () => pick().click())
    expect(m.container.querySelector(".notice-info")).toBeNull()
    await act(async () => pick().click())
    expect(m.container.querySelector(".notice-info")?.textContent).toMatch(/Click an element/)
    expect(pick().getAttribute("aria-pressed")).toBe("true")
    await act(async () => pick().click())
    expect(capture.stopPicker).toHaveBeenCalledWith(1)
    expect(m.container.querySelector(".notice-info")).toBeNull()
    // Esc in the page is announced by the content script
    await act(async () => pick().click())
    act(() => m.chrome.runtimeListeners.forEach((l) => l({ action: "picker-state", active: false }, { tab: { windowId: 1 } })))
    expect(pick().getAttribute("aria-pressed")).toBe("false")
  })

  it("flushes the draft to storage when the panel is hidden", async () => {
    const m = await mount()
    typeInto(m.ta, "half written")
    const sid = m.chrome.local["currentSessionId:1"] as string
    expect(m.chrome.local[`draft:${sid}`]).toBeUndefined()
    act(() => void window.dispatchEvent(new Event("pagehide")))
    await flush()
    expect(m.chrome.local[`draft:${sid}`]).toBe("half written")
  })

  it("restores the per-window session on reopen", async () => {
    const sid = "11111111-1111-4111-8111-111111111111"
    const m = await mount({ local: { "currentSessionId:1": sid, "currentSessionStarted:1": true, currentSessionId: "22222222-2222-4222-8222-222222222222" } })
    expect(m.ws.sent).toContainEqual({ type: "open_session", sessionId: sid })
  })

  it("surfaces another chat waiting for approval and switches to it", async () => {
    const m = await mount()
    const other = "33333333-3333-4333-8333-333333333333"
    act(() => m.ws.push({ type: "event", sessionId: other, event: { kind: "permission_request", requestId: "x1", toolName: "Bash", input: {}, canAlwaysAllow: false } }))
    expect(m.container.querySelector(".badge")?.textContent).toBe("1")
    const banner = m.container.querySelector(".waiting") as HTMLButtonElement
    expect(banner.textContent).toMatch(/Another chat is waiting for approval/)
    act(() => banner.click())
    expect(m.ws.sent).toContainEqual({ type: "open_session", sessionId: other })
    expect(m.container.querySelector(".waiting")).toBeNull()
    act(() => m.ws.push({ type: "event", sessionId: other, event: { kind: "permission_resolved", requestId: "x1", behavior: "allow" } }))
    expect(m.container.querySelector(".badge")).toBeNull()
  })
})
