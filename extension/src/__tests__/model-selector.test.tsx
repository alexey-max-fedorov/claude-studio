import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import { ModelSelector } from "../components/ModelSelector"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe("ModelSelector", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("opens the menu downward (not off the top of the panel)", async () => {
    const models = [{ id: "a", name: "Model A" }, { id: "b", name: "Model B" }] as any
    const root = createRoot(container)
    await act(async () => {
      root.render(<ModelSelector models={models} current="a" onSelect={() => {}} />)
    })
    const btn = container.querySelector("button")!
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    // The menu is the only absolutely-positioned div (the wrapper is relative).
    const menu = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "absolute") as HTMLElement
    expect(menu).toBeTruthy()
    expect(menu.style.top).not.toBe("")     // opens downward
    expect(menu.style.bottom).toBe("")      // not anchored to the top
    expect(container.textContent).toContain("Model B")
    await act(async () => { root.unmount() })
  })
})
