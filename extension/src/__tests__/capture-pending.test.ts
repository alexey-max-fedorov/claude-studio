import { describe, it, expect } from "vitest"
import { appendPending, isAttachmentLike, takeForWindow, withWindow, MAX_PENDING, type PendingAttachment } from "../background/pending"

const page = (url: string, windowId?: number): PendingAttachment => withWindow({ type: "page", url, title: "T" }, windowId)

describe("appendPending", () => {
  it("starts a list from nothing or garbage", () => {
    expect(appendPending(undefined, page("https://a"))).toEqual([{ type: "page", url: "https://a", title: "T" }])
    expect(appendPending("junk", page("https://a", 1))).toEqual([{ type: "page", url: "https://a", title: "T", windowId: 1 }])
  })

  it("appends in order and drops malformed stored entries", () => {
    const out = appendPending([page("https://a", 1), { nope: true }, null], page("https://b", 1))
    expect(out.map((p) => p.url)).toEqual(["https://a", "https://b"])
  })

  it("dedupes an identical earlier entry, moving it to the end", () => {
    const out = appendPending([page("https://a", 1), page("https://b", 1)], page("https://a", 1))
    expect(out.map((p) => p.url)).toEqual(["https://b", "https://a"])
  })

  it("keeps the same page for different windows", () => {
    expect(appendPending([page("https://a", 1)], page("https://a", 2))).toHaveLength(2)
  })

  it("caps the queue at MAX_PENDING, newest kept", () => {
    let list: PendingAttachment[] = []
    for (let i = 0; i < MAX_PENDING + 5; i++) list = appendPending(list, page(`https://p${i}`))
    expect(list).toHaveLength(MAX_PENDING)
    expect(list[list.length - 1].url).toBe(`https://p${MAX_PENDING + 4}`)
    expect(list[0].url).toBe("https://p5")
  })

  it("treats selections with different text as different", () => {
    const s = (text: string) => withWindow({ type: "selection", url: "https://a", title: "", text }, 1)
    expect(appendPending([s("one")], s("two"))).toHaveLength(2)
    expect(appendPending([s("one")], s("one"))).toHaveLength(1)
  })
})

describe("isAttachmentLike / withWindow", () => {
  it("validates shapes", () => {
    expect(isAttachmentLike({ type: "page", url: "u", title: "t" })).toBe(true)
    expect(isAttachmentLike({ type: "selection", url: "u", title: "t" })).toBe(false)
    expect(isAttachmentLike({ type: "element", url: "u", title: "t", element: { tagName: "div" } })).toBe(true)
    expect(isAttachmentLike({ type: "element", url: "u", title: "t" })).toBe(false)
    expect(isAttachmentLike({ type: "bogus", url: "u" })).toBe(false)
  })
  it("only attaches valid window ids", () => {
    expect(withWindow({ type: "page", url: "u", title: "t" }, undefined)).not.toHaveProperty("windowId")
    expect(withWindow({ type: "page", url: "u", title: "t" }, -1)).not.toHaveProperty("windowId")
    expect(withWindow({ type: "page", url: "u", title: "t" }, 7)).toHaveProperty("windowId", 7)
  })
})

describe("takeForWindow", () => {
  it("gives a window its own and untargeted items, keeps other windows' items queued", () => {
    const list = [page("https://w1", 1), page("https://any"), page("https://w2", 2), { junk: 1 }]
    const { mine, rest } = takeForWindow(list, 1)
    expect(mine).toEqual([
      { type: "page", url: "https://w1", title: "T" },
      { type: "page", url: "https://any", title: "T" },
    ])
    expect(rest.map((p) => p.url)).toEqual(["https://w2"])
    expect(takeForWindow(rest, 1).mine).toEqual([])
    expect(takeForWindow(undefined, 1)).toEqual({ mine: [], rest: [] })
  })
})
