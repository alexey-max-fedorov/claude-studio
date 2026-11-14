import { afterEach, describe, expect, it, vi } from "vitest"
import { captureAttachment, MSG } from "../lib/capture"

function event<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    addListener: (listener: (...args: T) => void) => { listeners.add(listener) },
    removeListener: (listener: (...args: T) => void) => { listeners.delete(listener) },
    emit: (...args: T) => { for (const listener of listeners) listener(...args) },
    get size() { return listeners.size },
  }
}

function setup() {
  const activated = event<[{ tabId: number; windowId: number }]>()
  const updated = event<[number, { url?: string; status?: string; discarded?: boolean }, object]>()
  const removed = event<[number, { windowId: number; isWindowClosing: boolean }]>()
  const replaced = event<[number, number]>()
  let active = { id: 7, windowId: 1, url: "https://example.com/expected", title: "Expected page", status: "complete" }
  const query = vi.fn(async () => [{ ...active }])
  const capture = vi.fn(async () => "data:image/jpeg;base64,ZmFrZQ==")
  const execute = vi.fn()
  vi.stubGlobal("chrome", { tabs: { query, captureVisibleTab: capture, onActivated: activated, onUpdated: updated, onRemoved: removed, onReplaced: replaced }, scripting: { executeScript: execute } })
  return {
    activated, updated, removed, replaced, query, capture, execute,
    active: () => active,
    switchTab: (id: number, windowId = 1) => {
      if (windowId === 1) active = { ...active, id, url: `https://example.com/tab-${id}` }
      activated.emit({ tabId: id, windowId })
    },
    listenersRemoved: () => expect([activated.size, updated.size, removed.size, replaced.size]).toEqual([0, 0, 0, 0]),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("screenshot source identity", () => {
  it("captures a stable tab and removes every temporary listener", async () => {
    const t = setup()
    expect(await captureAttachment("screenshot", 1)).toMatchObject({ type: "screenshot", url: t.active().url, title: "Expected page", dataUrl: "data:image/jpeg;base64,ZmFrZQ==" })
    expect(t.capture).toHaveBeenCalledWith(1, { format: "jpeg", quality: 80 })
    t.listenersRemoved()
  })

  it("rejects a tab switch during the initial asynchronous lookup", async () => {
    const t = setup()
    t.query.mockImplementationOnce(async () => {
      const before = { ...t.active() }
      t.switchTab(8)
      return [before]
    })
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.changed)
    expect(t.capture).not.toHaveBeenCalled()
    t.listenersRemoved()
  })

  it("discards another tab's pixels when activation changes during capture", async () => {
    const t = setup()
    t.capture.mockImplementation(async () => { t.switchTab(8); return "data:image/jpeg;base64,T1RIRVI=" })
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.changed)
    t.listenersRemoved()
  })

  it("rejects switching away and back even when the final tab ID and URL match", async () => {
    const t = setup()
    t.capture.mockImplementation(async () => {
      t.activated.emit({ tabId: 8, windowId: 1 })
      t.activated.emit({ tabId: 7, windowId: 1 })
      return "data:image/jpeg;base64,T1RIRVI="
    })
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.changed)
    t.listenersRemoved()
  })

  it.each(["navigation", "reload", "discard", "remove", "replace"])("rejects source %s while capturing", async (kind) => {
    const t = setup()
    t.capture.mockImplementation(async () => {
      if (kind === "navigation") t.updated.emit(7, { url: "https://example.com/private" }, {})
      if (kind === "reload") t.updated.emit(7, { status: "loading" }, {})
      if (kind === "discard") t.updated.emit(7, { discarded: true }, {})
      if (kind === "remove") t.removed.emit(7, { windowId: 1, isWindowClosing: false })
      if (kind === "replace") t.replaced.emit(8, 7)
      return "data:image/jpeg;base64,ZmFrZQ=="
    })
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.changed)
    t.listenersRemoved()
  })

  it("rechecks the final active tab even if an activation event was delayed", async () => {
    const t = setup()
    t.query.mockResolvedValueOnce([{ ...t.active() }]).mockResolvedValueOnce([{ ...t.active() }]).mockResolvedValueOnce([{ ...t.active(), id: 8 }])
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.changed)
    t.listenersRemoved()
  })

  it("ignores activity in other windows and background tabs", async () => {
    const t = setup()
    t.capture.mockImplementation(async () => { t.switchTab(30, 2); t.updated.emit(31, { status: "loading" }, {}); return "data:image/jpeg;base64,ZmFrZQ==" })
    await expect(captureAttachment("screenshot", 1)).resolves.toMatchObject({ type: "screenshot", url: t.active().url })
    t.listenersRemoved()
  })

  it("maps capture failures safely and still unregisters listeners", async () => {
    const t = setup()
    t.capture.mockRejectedValue(new Error("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND"))
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.rate)
    t.listenersRemoved()
  })

  it("rejects a page that is already navigating before taking a screenshot", async () => {
    const t = setup()
    t.query.mockResolvedValue([{ ...t.active(), status: "loading" }])
    await expect(captureAttachment("screenshot", 1)).rejects.toThrow(MSG.loading)
    expect(t.capture).not.toHaveBeenCalled()
    t.listenersRemoved()
  })

  it.each(["page_text", "selection"] as const)("rejects navigation while reading %s", async (kind) => {
    const t = setup()
    t.execute.mockImplementation(async () => {
      t.updated.emit(7, { status: "loading" }, {})
      return [{ frameId: 0, result: kind === "selection" ? { text: "selected", focused: true } : "page text" }]
    })
    await expect(captureAttachment(kind, 1)).rejects.toThrow(MSG.changed)
    t.listenersRemoved()
  })

})
