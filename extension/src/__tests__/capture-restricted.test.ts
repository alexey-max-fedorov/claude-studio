import { describe, it, expect } from "vitest"
import { restrictedReason, friendlyError, normalizePageText, clampMeta, pickSelection, MSG, CaptureError, MAX_URL } from "../lib/capture"

describe("restrictedReason", () => {
  it("allows normal web pages", () => {
    for (const k of ["page", "selection", "page_text", "screenshot", "picker"] as const) {
      expect(restrictedReason("https://example.com/a?b=1", k)).toBeNull()
      expect(restrictedReason("http://localhost:3000/", k)).toBeNull()
    }
  })

  it("blocks browser internal pages for every kind", () => {
    const urls = [
      "brave://settings",
      "brave://newtab/",
      "chrome://extensions",
      "chrome-extension://abc/sidepanel.html",
      "view-source:https://example.com",
      "about:blank",
      "devtools://devtools/bundled/inspector.html",
      "chrome-search://local-ntp",
      "",
      undefined,
      "not a url",
    ]
    for (const u of urls) {
      for (const k of ["page", "selection", "page_text", "screenshot", "picker"] as const) {
        expect(restrictedReason(u, k), `${u} ${k}`).toBe(MSG.internal)
      }
    }
  })

  it("blocks the web store except for a plain page link", () => {
    expect(restrictedReason("https://chromewebstore.google.com/detail/x", "page_text")).toBe(MSG.store)
    expect(restrictedReason("https://chrome.google.com/webstore/detail/x", "picker")).toBe(MSG.store)
    expect(restrictedReason("https://chromewebstore.google.com/detail/x", "page")).toBeNull()
  })

  it("handles file URLs by access setting", () => {
    expect(restrictedReason("file:///tmp/a.html", "page_text", { fileAccess: false })).toBe(MSG.file)
    expect(restrictedReason("file:///tmp/a.html", "page_text", { fileAccess: true })).toBeNull()
    expect(restrictedReason("file:///tmp/a.html", "page", { fileAccess: false })).toBeNull()
  })

  it("blocks scripting the PDF viewer but allows screenshots", () => {
    expect(restrictedReason("https://x.com/doc.PDF", "selection")).toBe(MSG.pdf)
    expect(restrictedReason("https://x.com/doc.pdf", "screenshot")).toBeNull()
    expect(restrictedReason("https://x.com/doc.pdf", "page")).toBeNull()
  })
})

describe("friendlyError", () => {
  it("never returns raw chrome errors", () => {
    expect(friendlyError(new Error("Cannot access contents of url \"chrome://newtab/\". Extension manifest must request permission"))).toBe(MSG.internal)
    expect(friendlyError(new Error("The extensions gallery cannot be scripted."))).toBe(MSG.store)
    expect(friendlyError(new Error("No tab with id: 5."))).toBe(MSG.noTab)
    expect(friendlyError(new Error("Frame with ID 0 is showing error page"))).toBe(MSG.loading)
    expect(friendlyError(new Error("This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota."))).toBe(MSG.rate)
    expect(friendlyError(new Error("something odd"))).toBe(MSG.generic)
    expect(friendlyError(new CaptureError("custom"))).toBe("custom")
  })
})

describe("normalizePageText", () => {
  it("trims and collapses 3+ newlines", () => {
    expect(normalizePageText("  a\n\n\n\nb \n\n c\r\n\r\n\r\nd  ")).toBe("a\n\nb\n\n c\n\nd")
  })
  it("caps at the limit with a marker", () => {
    const t = normalizePageText("y".repeat(200_000))
    expect(t.length).toBe(150_000 + "\n[truncated]".length)
    expect(t.endsWith("\n[truncated]")).toBe(true)
  })
})

describe("clampMeta", () => {
  it("clamps url and title", () => {
    const m = clampMeta("https://x.com/" + "a".repeat(10_000), "  Hello \n  world ")
    expect(m.url.length).toBe(MAX_URL)
    expect(m.title).toBe("Hello world")
    expect(clampMeta(undefined, undefined)).toEqual({ url: "", title: "" })
  })
})

describe("pickSelection", () => {
  it("prefers the focused frame, then main, then any", () => {
    expect(pickSelection([
      { frameId: 0, result: { text: "main", focused: false } },
      { frameId: 3, result: { text: "iframe", focused: true } },
    ])).toBe("iframe")
    expect(pickSelection([
      { frameId: 2, result: { text: "sub", focused: false } },
      { frameId: 0, result: { text: "main", focused: false } },
    ])).toBe("main")
    expect(pickSelection([
      { frameId: 0, result: { text: "  ", focused: true } },
      { frameId: 2, result: { text: "sub", focused: false } },
    ])).toBe("sub")
    expect(pickSelection([{ frameId: 0 }])).toBe("")
  })
})
