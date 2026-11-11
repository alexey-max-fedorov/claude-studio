import { describe, it, expect, beforeEach } from "vitest"
import { captureElement, MAX_OUTER_HTML, MAX_TEXT, MAX_ATTR_VALUE, truncate } from "../lib/element-capture"

describe("captureElement", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("captures basic fields", () => {
    document.body.innerHTML = '<main><div id="card" class="a b" data-x="1" style="color:red"><p>Hi</p></div></main>'
    const el = document.getElementById("card")!
    const s = captureElement(el)
    expect(s.tagName).toBe("div")
    expect(s.id).toBe("card")
    expect(s.classList).toEqual(["a", "b"])
    expect(s.cssSelector).toBe("#card")
    expect(s.attributes).toEqual({ "data-x": "1" })
    expect(s.parentChain).toEqual(["main"])
    expect(s.childCount).toBe(1)
    expect(s.textContent).toBe("Hi")
  })

  it("caps outerHTML at 8000 and text at 2000", () => {
    const big = "x".repeat(20_000)
    document.body.innerHTML = `<div id="big">${big}</div>`
    const s = captureElement(document.getElementById("big")!)
    expect(s.outerHTML.length).toBeLessThanOrEqual(MAX_OUTER_HTML)
    expect(s.outerHTML.endsWith("<!-- truncated -->")).toBe(true)
    expect(s.textContent.length).toBeLessThanOrEqual(MAX_TEXT)
    expect(s.textContent.endsWith("[truncated]")).toBe(true)
  })

  it("leaves small content untouched", () => {
    document.body.innerHTML = '<span id="s">short</span>'
    const s = captureElement(document.getElementById("s")!)
    expect(s.outerHTML).toBe('<span id="s">short</span>')
  })

  it("caps long attribute values", () => {
    const el = document.createElement("img")
    el.setAttribute("src", "data:image/png;base64," + "A".repeat(5000))
    document.body.appendChild(el)
    const s = captureElement(el)
    expect(s.attributes.src.length).toBeLessThanOrEqual(MAX_ATTR_VALUE)
  })

  it("collapses whitespace in text", () => {
    document.body.innerHTML = '<div id="w">  a   b \n\n\n\n c  </div>'
    expect(captureElement(document.getElementById("w")!).textContent).toBe("a b\n\nc")
  })

  it("truncate respects the max including marker", () => {
    expect(truncate("abcdef", 10, "..")).toBe("abcdef")
    expect(truncate("abcdefghijkl", 6, "..")).toBe("abcd..")
  })
})
