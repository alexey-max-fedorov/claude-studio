import type { PlasmoCSConfig } from "plasmo"
import type { Attachment } from "@claude-studio/protocol"
import { captureElement } from "../lib/element-capture"
import { clampMeta } from "../lib/capture"

/*
 * Element picker. Runs on every page but stays idle (one message listener) until the
 * background sends {action: "picker-start" | "picker-stop" | "toggle-picker"}. While active:
 * hover outline + label in a closed shadow root, a real (trusted) click picks and the page
 * never sees it, Esc cancels. Every transition is announced with {action: "picker-state"}
 * so the side panel can show the right hint.
 */

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
}

type Instance = { stop: () => void; teardown: () => void }
const GLOBAL_KEY = "__claudeStudioElementPicker__"

const prev = (window as unknown as Record<string, Instance | undefined>)[GLOBAL_KEY]
prev?.teardown() // re-injected (extension reloaded or programmatic inject): replace the old instance

const ACCENT = "#d97757"

let host: HTMLElement | null = null
let box: HTMLDivElement | null = null
let label: HTMLDivElement | null = null
let cursorStyle: HTMLStyleElement | null = null
let hovered: Element | null = null
let active = false
let rafId = 0
let flashTimer: ReturnType<typeof setTimeout> | undefined

function buildOverlay() {
  host = document.createElement("claude-studio-picker")
  host.style.cssText =
    "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;"
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = `
    .box { position: fixed; pointer-events: none; box-sizing: border-box; border: 2px solid ${ACCENT};
      background: rgba(217, 119, 87, 0.12); border-radius: 2px; display: none; }
    .label { position: fixed; pointer-events: none; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; background: #1f1e1d; color: #f5f4ef; border: 1px solid ${ACCENT}; border-radius: 4px;
      padding: 3px 7px; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; display: none; }
    .label b { color: ${ACCENT}; font-weight: 600; }
  `
  box = document.createElement("div")
  box.className = "box"
  label = document.createElement("div")
  label.className = "label"
  shadow.append(style, box, label)
  ;(document.documentElement || document.body).appendChild(host)

  cursorStyle = document.createElement("style")
  cursorStyle.textContent = "html, html * { cursor: crosshair !important; }"
  ;(document.head || document.documentElement).appendChild(cursorStyle)
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ""
  const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join(".")}` : ""
  return `${tag}${id}${cls}`
}

/** No innerHTML: pages with Trusted Types would reject it. */
function setLabel(strong: string, rest = "") {
  if (!label) return
  const b = document.createElement("b")
  b.textContent = strong
  label.replaceChildren(b, document.createTextNode(rest ? ` ${rest}` : ""))
}

function render() {
  rafId = 0
  if (!box || !label) return
  if (!hovered || !hovered.isConnected) {
    box.style.display = "none"
    label.style.display = "none"
    return
  }
  const r = hovered.getBoundingClientRect()
  Object.assign(box.style, {
    display: "block",
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  })
  setLabel(describe(hovered), `${Math.round(r.width)}x${Math.round(r.height)}`)
  label.style.display = "block"
  const lh = 22
  const top = r.top >= lh + 4 ? r.top - lh - 4 : Math.min(r.bottom + 4, window.innerHeight - lh - 4)
  label.style.top = `${Math.max(4, top)}px`
  label.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 220))}px`
}

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(render)
}

function targetOf(e: Event): Element | null {
  for (const n of e.composedPath()) {
    if (n === host) return null
    if (n instanceof Element) return n
  }
  return null
}

function onMove(e: MouseEvent) {
  const el = targetOf(e)
  if (!el || el === hovered) return
  hovered = el
  schedule()
}

function swallow(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
}

function onClick(e: MouseEvent) {
  swallow(e)
  // Pages can dispatch synthetic clicks; only a real user click may pick.
  if (!e.isTrusted) return
  const el = targetOf(e) || hovered
  if (!el) return
  pick(el)
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    swallow(e)
    stop()
  }
}

const BLOCKED = ["mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "contextmenu", "auxclick"] as const

function announce() {
  try {
    chrome.runtime.sendMessage({ action: "picker-state", active }).catch(() => {})
  } catch {
    /* orphaned context */
  }
}

function start() {
  if (active) return
  active = true
  announce()
  clearTimeout(flashTimer)
  buildOverlay()
  window.addEventListener("mousemove", onMove, true)
  window.addEventListener("click", onClick, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("scroll", schedule, true)
  window.addEventListener("resize", schedule, true)
  for (const t of BLOCKED) window.addEventListener(t, swallow, true)
}

function stop() {
  clearTimeout(flashTimer)
  if (!active) return
  active = false
  announce()
  window.removeEventListener("mousemove", onMove, true)
  window.removeEventListener("click", onClick, true)
  window.removeEventListener("keydown", onKey, true)
  window.removeEventListener("scroll", schedule, true)
  window.removeEventListener("resize", schedule, true)
  for (const t of BLOCKED) window.removeEventListener(t, swallow, true)
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  host?.remove()
  cursorStyle?.remove()
  host = box = label = cursorStyle = null
  hovered = null
}

function flashThenStop(text: string, ms: number) {
  // Stop intercepting events immediately, keep the overlay briefly as feedback.
  for (const t of BLOCKED) window.removeEventListener(t, swallow, true)
  window.removeEventListener("mousemove", onMove, true)
  window.removeEventListener("click", onClick, true)
  window.removeEventListener("scroll", schedule, true)
  window.removeEventListener("resize", schedule, true)
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  setLabel(text)
  if (label) label.style.display = "block"
  flashTimer = setTimeout(stop, ms)
}

function pick(el: Element) {
  let attachment: Attachment
  try {
    const { url, title } = clampMeta(location.href, document.title)
    attachment = { type: "element", url, title, element: captureElement(el) }
  } catch {
    flashThenStop("Could not capture this element", 1200)
    return
  }
  try {
    chrome.runtime.sendMessage({ action: "element-picked", attachment }).then(
      () => flashThenStop("Added to Claude", 600),
      () => flashThenStop("Extension was reloaded. Refresh this page.", 1800),
    )
  } catch {
    flashThenStop("Extension was reloaded. Refresh this page.", 1800)
  }
}

function onMessage(message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) {
  const m = message as { action?: string } | null
  if (!m) return
  if (m.action === "picker-start") start()
  else if (m.action === "picker-stop") stop()
  else if (m.action === "toggle-picker") {
    if (active) stop()
    else start()
  } else return
  sendResponse({ active })
}

chrome.runtime.onMessage.addListener(onMessage)

;(window as unknown as Record<string, Instance>)[GLOBAL_KEY] = {
  stop,
  teardown: () => {
    stop()
    try {
      chrome.runtime.onMessage.removeListener(onMessage)
    } catch {
      /* orphaned context */
    }
  },
}
