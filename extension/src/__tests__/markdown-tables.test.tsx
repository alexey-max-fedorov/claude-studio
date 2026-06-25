import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import { MarkdownLite } from "../components/MarkdownLite"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const TABLE = ["| Component | Tokens |", "| --- | --- |", "| System prompt | 1200 |", "| Messages | 3400 |"].join("\n")

describe("MarkdownLite tables", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("renders a GFM table as an HTML table", async () => {
    const root = createRoot(container)
    await act(async () => { root.render(<MarkdownLite text={TABLE} />) })
    expect(container.querySelector("table")).toBeTruthy()
    expect(container.querySelectorAll("tbody tr").length).toBe(2)
    expect(container.textContent).toContain("System prompt")
    await act(async () => { root.unmount() })
  })

  it("collapses the table body when the header is clicked", async () => {
    const root = createRoot(container)
    await act(async () => { root.render(<MarkdownLite text={TABLE} />) })
    expect(container.querySelector("tbody")).toBeTruthy()
    const toggle = container.querySelector("[data-cs-table-toggle]") as HTMLElement
    expect(toggle).toBeTruthy()
    await act(async () => { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    expect(container.querySelector("tbody")).toBeFalsy()
    await act(async () => { root.unmount() })
  })
})
