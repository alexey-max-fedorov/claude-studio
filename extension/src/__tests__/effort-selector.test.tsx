import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import { EffortSelector } from "../components/EffortSelector"
import type { EffortLevel } from "@claude-studio/protocol"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe("EffortSelector", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("renders nothing when there are no levels (e.g. Haiku)", async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<EffortSelector levels={[]} current="high" onSelect={() => {}} />)
    })
    expect(container.querySelector("button")).toBeNull()
    await act(async () => { root.unmount() })
  })

  it("shows the current tier label and opens the ladder downward", async () => {
    const levels: EffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultracode"]
    const root = createRoot(container)
    await act(async () => {
      root.render(<EffortSelector levels={levels} current="xhigh" onSelect={() => {}} />)
    })
    const btn = container.querySelector("button")!
    expect(btn.textContent).toContain("xHigh")
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    const menu = Array.from(container.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "absolute") as HTMLElement
    expect(menu).toBeTruthy()
    expect(menu.style.top).not.toBe("")
    expect(menu.style.bottom).toBe("")
    expect(container.textContent).toContain("ultracode")
    await act(async () => { root.unmount() })
  })

  it("fires onSelect with the chosen tier", async () => {
    const levels: EffortLevel[] = ["low", "medium", "high", "max", "ultracode"]
    let picked: EffortLevel | null = null
    const root = createRoot(container)
    await act(async () => {
      root.render(<EffortSelector levels={levels} current="high" onSelect={(l) => { picked = l }} />)
    })
    await act(async () => { container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    const option = Array.from(container.querySelectorAll("div"))
      .find((d) => d.textContent === "ultracode") as HTMLElement
    await act(async () => { option.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    expect(picked).toBe("ultracode")
    await act(async () => { root.unmount() })
  })
})
