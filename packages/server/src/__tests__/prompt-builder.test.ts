import { describe, it, expect } from "vitest"
import { buildPrompt } from "../prompt-builder.js"
import type { ElementSelection } from "@claude-studio/shared"

const mockElement: ElementSelection = {
  tagName: "h1",
  id: "hero-title",
  classList: ["title", "text-4xl"],
  cssSelector: "#hero-title",
  textContent: "Welcome to My Site",
  outerHTML: '<h1 id="hero-title" class="title text-4xl">Welcome to My Site</h1>',
  attributes: { "data-section": "hero" },
  boundingRect: { top: 100, left: 50, width: 400, height: 48 },
  computedStyles: {
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)",
    fontSize: "36px",
    fontFamily: "Inter, sans-serif",
    padding: "0px",
    margin: "0px",
  },
  parentChain: ["main.container", "section.hero"],
  siblingCount: 3,
  childCount: 0,
}

describe("buildPrompt", () => {
  it("includes the route", () => {
    const prompt = buildPrompt({ route: "/about", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain("/about")
  })

  it("includes the CSS selector", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain("#hero-title")
  })

  it("includes the user prompt", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain("Make it red")
  })

  it("includes computed styles", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain("36px")
    expect(prompt).toContain("rgb(0, 0, 0)")
  })

  it("includes parent chain", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain("section.hero")
  })

  it("includes attributes", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "Make it red" })
    expect(prompt).toContain('data-section="hero"')
  })

  it("handles root route correctly", () => {
    const prompt = buildPrompt({ route: "/", element: mockElement, prompt: "test" })
    expect(prompt).toContain("app//page.tsx")  // root route
  })

  it("handles empty attributes", () => {
    const noAttrs = { ...mockElement, attributes: {} }
    const prompt = buildPrompt({ route: "/", element: noAttrs, prompt: "test" })
    expect(prompt).toContain("Key attributes: none")
  })
})
