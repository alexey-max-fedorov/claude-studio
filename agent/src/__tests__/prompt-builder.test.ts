import { describe, it, expect } from "vitest"
import { buildPrompt } from "../prompt-builder.js"
import type { ElementSelection } from "@claude-studio/protocol"

const element: ElementSelection = {
  tagName: "button", id: "cta", classList: ["btn", "primary"], cssSelector: "button.btn.primary",
  textContent: "Buy now", outerHTML: "<button class=\"btn primary\">Buy now</button>",
  attributes: { type: "submit" }, boundingRect: { top: 0, left: 0, width: 100, height: 40 },
  computedStyles: { color: "#fff", backgroundColor: "#c9a84c", fontSize: "16px", fontFamily: "Inter", padding: "8px", margin: "0" },
  parentChain: ["body", "main", "form"], siblingCount: 2, childCount: 0,
}

describe("buildPrompt", () => {
  it("includes the user instruction and element context", () => {
    const p = buildPrompt({ route: "/checkout", element, prompt: "make it rounded", routeHints: true })
    expect(p).toContain("make it rounded")
    expect(p).toContain("button.btn.primary")
    expect(p).toContain("Buy now")
  })

  it("uses unique per-message nonce delimiters that wrap untrusted content", () => {
    const p = buildPrompt({ route: "/", element, prompt: "x", routeHints: true })
    const m = p.match(/<user-instruction-([0-9a-f]{16})>/)
    expect(m).toBeTruthy()
    const nonce = m![1]
    expect(p).toContain(`</user-instruction-${nonce}>`)
    expect(p).toContain(`<element-context-${nonce}>`)
  })

  it("produces a different nonce each call", () => {
    const a = buildPrompt({ route: "/", element, prompt: "x", routeHints: true })
    const b = buildPrompt({ route: "/", element, prompt: "x", routeHints: true })
    const na = a.match(/<user-instruction-([0-9a-f]{16})>/)![1]
    const nb = b.match(/<user-instruction-([0-9a-f]{16})>/)![1]
    expect(na).not.toBe(nb)
  })

  it("omits framework route hints when routeHints is false", () => {
    const off = buildPrompt({ route: "/checkout", element, prompt: "x", routeHints: false })
    const on = buildPrompt({ route: "/checkout", element, prompt: "x", routeHints: true })
    expect(on).toMatch(/route .*maps to/i)
    expect(off).not.toMatch(/route .*maps to/i)
  })

  it("instructs the model to treat wrapped content as untrusted data", () => {
    const p = buildPrompt({ route: "/", element, prompt: "x", routeHints: true })
    expect(p).toMatch(/untrusted data/i)
  })

  it("declares the trust boundary before any untrusted content (route included)", () => {
    const p = buildPrompt({ route: "/checkout", element, prompt: "x", routeHints: true })
    const trustIdx = p.search(/only the numbered .* are authoritative/i)
    const routeIdx = p.indexOf("/checkout")
    expect(trustIdx).toBeGreaterThanOrEqual(0)
    expect(trustIdx).toBeLessThan(routeIdx) // trust framing precedes the untrusted route value
  })
})
