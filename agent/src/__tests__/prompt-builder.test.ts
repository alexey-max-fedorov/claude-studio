import { describe, it, expect } from "vitest"
import { buildPrompt, isDevServer } from "../prompt-builder.js"
import type { ElementSelection } from "@claude-studio/protocol"

const element: ElementSelection = {
  tagName: "button", id: "cta", classList: ["btn", "primary"], cssSelector: "button.btn.primary",
  textContent: "Buy now", outerHTML: "<button class=\"btn primary\">Buy now</button>",
  attributes: { type: "submit" }, boundingRect: { top: 0, left: 0, width: 100, height: 40 },
  computedStyles: { color: "#fff", backgroundColor: "#c9a84c", fontSize: "16px", fontFamily: "Inter", padding: "8px", margin: "0" },
  parentChain: ["body", "main", "form"], siblingCount: 2, childCount: 0,
}

const base = { route: "/checkout", url: "http://localhost:3000/checkout", element, locations: [], prompt: "make it rounded", routeHints: true, external: false }

describe("buildPrompt", () => {
  it("includes the user instruction and element context", () => {
    const p = buildPrompt(base)
    expect(p).toContain("make it rounded")
    expect(p).toContain("button.btn.primary")
    expect(p).toContain("Buy now")
  })

  it("uses unique per-message nonce delimiters that wrap element/user content", () => {
    const p = buildPrompt({ ...base, route: "/", prompt: "x" })
    const m = p.match(/<user-instruction-([0-9a-f]{16})>/)
    expect(m).toBeTruthy()
    const nonce = m![1]
    expect(p).toContain(`</user-instruction-${nonce}>`)
    expect(p).toContain(`<element-context-${nonce}>`)
  })

  it("produces a different nonce each call", () => {
    const a = buildPrompt({ ...base, prompt: "x" })
    const b = buildPrompt({ ...base, prompt: "x" })
    const na = a.match(/<user-instruction-([0-9a-f]{16})>/)![1]
    const nb = b.match(/<user-instruction-([0-9a-f]{16})>/)![1]
    expect(na).not.toBe(nb)
  })

  it("omits framework route hints when routeHints is false", () => {
    const off = buildPrompt({ ...base, prompt: "x", routeHints: false })
    const on = buildPrompt({ ...base, prompt: "x", routeHints: true })
    expect(on).toMatch(/route .*maps to/i)
    expect(off).not.toMatch(/route .*maps to/i)
  })

  it("does not lecture the model about untrusted data / authoritative steps", () => {
    const p = buildPrompt(base)
    expect(p).not.toMatch(/untrusted data/i)
    expect(p).not.toMatch(/only the numbered .* authoritative/i)
  })

  it("for an external page, tells the agent to WebFetch the url and port the element in", () => {
    const p = buildPrompt({ ...base, url: "https://github.com/acme/repo", external: true })
    expect(p).toMatch(/WebFetch/)
    expect(p).toContain("https://github.com/acme/repo")
    expect(p).toMatch(/external page/i)
  })

  it("lists located source file:line candidates when provided", () => {
    const p = buildPrompt({ ...base, locations: [{ file: "src/Page.tsx", line: 42, snippet: "<button>Buy now</button>" }] })
    expect(p).toContain("src/Page.tsx:42")
  })
})

describe("isDevServer", () => {
  it("treats well-known local hosts as dev server", () => {
    expect(isDevServer("http://localhost:3000/")).toBe(true)
    expect(isDevServer("http://127.0.0.1:5173/")).toBe(true)
    expect(isDevServer("http://myapp.local/")).toBe(true)
  })

  it("treats public hosts as external", () => {
    expect(isDevServer("https://github.com")).toBe(false)
    expect(isDevServer("https://example.com/x")).toBe(false)
  })

  it("treats the dialed WS host as dev server", () => {
    expect(isDevServer("http://192.168.1.50:3000/", "192.168.1.50")).toBe(true)
    expect(isDevServer("http://192.168.1.50:3000/")).toBe(false)
  })

  it("returns false for garbage urls", () => {
    expect(isDevServer("not a url")).toBe(false)
    expect(isDevServer("")).toBe(false)
  })
})
