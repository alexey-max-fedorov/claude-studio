import { describe, it, expect, beforeEach } from "vitest"
import { generateSelector } from "../lib/selector-generator"

function expectUnique(el: Element, root: Document | ShadowRoot = document) {
  const sel = generateSelector(el)
  const all = root.querySelectorAll(sel)
  expect(all.length, sel).toBe(1)
  expect(all[0]).toBe(el)
  return sel
}

describe("generateSelector (picker)", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("skips a non-unique data-testid", () => {
    document.body.innerHTML = '<button data-testid="x">A</button><button data-testid="x">B</button>'
    const el = document.querySelectorAll("button")[1]
    const sel = expectUnique(el)
    expect(sel).not.toBe('[data-testid="x"]')
  })

  it("quotes data-testid values with quotes", () => {
    document.body.innerHTML = '<div data-testid=\'say "hi"\'>A</div>'
    expectUnique(document.querySelector("div")!)
  })

  it("skips duplicate ids", () => {
    document.body.innerHTML = '<p id="dup">A</p><p id="dup">B</p>'
    expectUnique(document.querySelectorAll("p")[1])
  })

  it("anchors paths at body so nested look-alikes don't match", () => {
    document.body.innerHTML =
      "<div><div><span>inner</span></div></div><div><span>target</span></div>"
    const target = Array.from(document.querySelectorAll("span")).find((s) => s.textContent === "target")!
    expectUnique(target)
  })

  it("handles body and html", () => {
    expect(generateSelector(document.body)).toBe("body")
    expect(generateSelector(document.documentElement)).toBe("html")
  })

  it("handles weird class names and ids", () => {
    document.body.innerHTML = '<div class="md:flex w-1/2"><a id="1abc" class="x[y]">l</a><a class="x[y]">m</a></div>'
    expectUnique(document.querySelectorAll("a")[0])
    expectUnique(document.querySelectorAll("a")[1])
  })

  it("is unique for deep repeated structures", () => {
    document.body.innerHTML = Array.from({ length: 5 }, () => '<ul class="list"><li class="item"><b>x</b></li><li class="item"><b>y</b></li></ul>').join("")
    for (const b of Array.from(document.querySelectorAll("b"))) expectUnique(b)
  })

  it("works inside an open shadow root", () => {
    const hostEl = document.createElement("div")
    document.body.appendChild(hostEl)
    const shadow = hostEl.attachShadow({ mode: "open" })
    shadow.innerHTML = "<section><p>a</p><p>b</p></section>"
    expectUnique(shadow.querySelectorAll("p")[1], shadow)
  })
})
