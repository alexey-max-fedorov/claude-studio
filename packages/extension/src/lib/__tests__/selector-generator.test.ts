import { describe, it, expect, beforeEach } from "vitest"
import { generateSelector, getElementDescription } from "../selector-generator"

describe("generateSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("returns #id when element has unique id", () => {
    document.body.innerHTML = '<div id="hero"><h1 id="title">Hello</h1></div>'
    const el = document.getElementById("title")!
    expect(generateSelector(el)).toBe("#title")
  })

  it("returns tag.class for unique class combination", () => {
    document.body.innerHTML = '<div class="hero-section"><h1 class="main-title">Hi</h1></div>'
    const el = document.querySelector("h1.main-title")!
    expect(generateSelector(el)).toBe("h1.main-title")
  })

  it("uses nth-of-type for ambiguous elements", () => {
    document.body.innerHTML = '<ul><li>A</li><li>B</li><li>C</li></ul>'
    const el = document.querySelectorAll("li")[1]
    const selector = generateSelector(el)
    expect(document.querySelector(selector)).toBe(el)
  })

  it("uses data-testid when present", () => {
    document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>'
    const el = document.querySelector("button")!
    expect(generateSelector(el)).toBe('[data-testid="submit-btn"]')
  })

  it("generates a selector that uniquely identifies the element", () => {
    document.body.innerHTML = '<div class="container"><div class="card"><p>First</p></div><div class="card"><p>Second</p></div></div>'
    const el = document.querySelectorAll("p")[1]
    const selector = generateSelector(el)
    expect(document.querySelectorAll(selector).length).toBe(1)
    expect(document.querySelector(selector)).toBe(el)
  })
})

describe("getElementDescription", () => {
  it("returns tag#id.classes", () => {
    document.body.innerHTML = '<div id="hero" class="big bold">test</div>'
    const el = document.getElementById("hero")!
    expect(getElementDescription(el)).toBe("div#hero.big.bold")
  })

  it("returns just tag when no id or classes", () => {
    document.body.innerHTML = "<p>hello</p>"
    const el = document.querySelector("p")!
    expect(getElementDescription(el)).toBe("p")
  })
})
