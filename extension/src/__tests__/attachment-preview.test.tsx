import React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { Attachment } from "@claude-studio/protocol"
import { act, render } from "./render"
import { Composer } from "../components/Composer"
import { screenshotSource } from "../components/AttachmentPreview"

const screenshot: Attachment = { type: "screenshot", url: "https://example.com/capture", title: "Capture fixture", dataUrl: "data:image/png;base64,aW1hZ2U=" }
const roots: ReturnType<typeof render>[] = []
const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal")
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close")

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false } })
})
afterEach(() => { for (const root of roots.splice(0)) root.unmount() })
afterAll(() => {
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal")
  if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close")
})

function props(attachments: Attachment[]) {
  return {
    value: "Please inspect", onChange: vi.fn(), onSend: vi.fn(), onStop: vi.fn(), running: false, canSend: true,
    commands: [], history: [], attachments, onRemoveAttachment: vi.fn(), onAttach: vi.fn(), capturing: null,
    notice: null, onDismissNotice: vi.fn(), placeholder: "Message",
  }
}
function mount(p: ReturnType<typeof props>) {
  const root = render(<Composer {...p} />)
  roots.push(root)
  return root
}
function click(element: Element | null) {
  if (!element) throw new Error("Missing button")
  act(() => (element as HTMLButtonElement).click())
}
function button(root: Element, text: string) {
  return [...root.querySelectorAll("button")].find((element) => element.textContent === text) ?? null
}

describe("pending attachment review", () => {
  it("automatically presents a screenshot and keeps sending an explicit separate action", () => {
    const p = props([screenshot])
    const root = mount(p)
    const dialog = root.container.querySelector("dialog")!
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain("Review screenshot")
    expect(dialog.textContent).toContain(screenshot.url)
    expect(dialog.textContent).toContain("sensitive information")
    expect(dialog.querySelector("img")?.src).toBe(screenshot.dataUrl)
    expect(p.onSend).not.toHaveBeenCalled()
    click(button(dialog, "Keep attachment"))
    expect(root.container.querySelector("dialog")).toBeNull()
    expect(root.container.querySelectorAll(".chip")).toHaveLength(1)
    expect(document.activeElement).toBe(root.container.querySelector("textarea"))
    expect(p.onSend).not.toHaveBeenCalled()
    click(root.container.querySelector(".btn-send"))
    expect(p.onSend).toHaveBeenCalledOnce()
  })

  it("supports full-size inspection and fitting the screenshot back into the panel", () => {
    const root = mount(props([screenshot]))
    const dialog = root.container.querySelector("dialog")!
    click(button(dialog, "Original size"))
    expect(dialog.querySelector(".attachment-preview-body")?.classList.contains("is-full-size")).toBe(true)
    expect(button(dialog, "Fit image")).not.toBeNull()
    click(button(dialog, "Fit image"))
    expect(dialog.querySelector(".is-full-size")).toBeNull()
  })

  it("removes the reviewed attachment by its current position after list changes", () => {
    const page: Attachment = { type: "page", url: "https://example.com/", title: "Page" }
    const p = props([page, screenshot])
    const root = mount(p)
    root.rerender(<Composer {...p} attachments={[screenshot]} />)
    click(button(root.container.querySelector("dialog")!, "Remove attachment"))
    expect(p.onRemoveAttachment).toHaveBeenCalledWith(0)
    expect(root.container.querySelector("dialog")).toBeNull()
    expect(p.onSend).not.toHaveBeenCalled()
  })

  it("dismisses the preview when its attachment is cleared externally", () => {
    const p = props([screenshot])
    const root = mount(p)
    root.rerender(<Composer {...p} attachments={[]} />)
    expect(root.container.querySelector("dialog")).toBeNull()
  })

  it("keeps Escape within the dialog and handles the native cancel without stopping a turn", () => {
    const p = { ...props([screenshot]), running: true }
    const root = mount(p)
    const dialog = root.container.querySelector("dialog")!
    const windowKey = vi.fn()
    window.addEventListener("keydown", windowKey)
    try {
      act(() => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
      expect(windowKey).not.toHaveBeenCalled()
      act(() => dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })))
      expect(root.container.querySelector("dialog")).toBeNull()
      expect(p.onStop).not.toHaveBeenCalled()
    } finally { window.removeEventListener("keydown", windowKey) }
  })

  it("lets the user inspect textual payloads without interpreting captured HTML", () => {
    const attachment: Attachment = { type: "selection", url: "https://example.com/", title: "Selected text", text: '<img src="https://untrusted.invalid/" onerror="alert(1)">' }
    const root = mount(props([attachment]))
    expect(root.container.querySelector("dialog")).toBeNull()
    click(root.container.querySelector(".chip-preview"))
    const dialog = root.container.querySelector("dialog")!
    expect(dialog.querySelector("pre")?.textContent).toBe(attachment.text)
    expect(dialog.querySelector("img")).toBeNull()
    click(dialog.querySelector('[aria-label="Close preview"]'))
    expect(root.container.querySelector("dialog")).toBeNull()
  })

  it.each(["https://untrusted.invalid/image.png", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"])("keeps screenshot previews local and raster-only: %s", (dataUrl) => {
    const attachment: Attachment = { ...screenshot, dataUrl }
    const root = mount(props([attachment]))
    expect(screenshotSource(attachment)).toBeUndefined()
    expect(root.container.querySelector("img")).toBeNull()
    expect(root.container.querySelector('[role="alert"]')?.textContent).toContain("cannot be previewed")
  })
})
