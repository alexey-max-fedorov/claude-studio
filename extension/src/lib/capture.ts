import type { Attachment } from "@claude-studio/protocol"

/*
 * Browser context capture for the side panel (an extension page, so chrome.* is available).
 * Every error thrown from here is a CaptureError with a message that is safe to show the user.
 */

export type CaptureKind = "page" | "selection" | "page_text" | "screenshot"

export class CaptureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CaptureError"
  }
}

// Limits (kept under the protocol validator's caps).
export const MAX_URL = 4000
export const MAX_TITLE = 1000
export const MAX_PAGE_TEXT = 150_000
export const MAX_SELECTION = 150_000
export const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024
export const SCREENSHOT_MAX_WIDTH = 2000

const TRUNCATED = "\n[truncated]"

export const MSG = {
  internal: "Can't read this page (browser internal page)",
  store: "Can't read this page (the browser blocks extensions on the web store)",
  file: "Can't read local files. Turn on \"Allow access to file URLs\" for this extension in brave://extensions.",
  pdf: "Can't read this page (PDF viewer). Attach the page link instead.",
  noTab: "No active tab found in this window",
  noSelection: "Nothing selected on this page",
  noText: "This page has no readable text",
  loading: "The page is still loading or showed an error. Try again in a moment.",
  rate: "Too many screenshots at once. Wait a second and try again.",
  generic: "Couldn't read this page. Try reloading it.",
} as const

const INTERNAL_SCHEMES = [
  "chrome:",
  "brave:",
  "edge:",
  "opera:",
  "vivaldi:",
  "about:",
  "chrome-extension:",
  "extension:",
  "moz-extension:",
  "devtools:",
  "chrome-devtools:",
  "chrome-search:",
  "chrome-untrusted:",
  "chrome-error:",
  "view-source:",
  "javascript:",
  "data:",
  "blob:",
  "filesystem:",
]

const STORE_HOSTS = ["chromewebstore.google.com"]

/**
 * Why this URL can't be captured for `kind`, or null if it can.
 * kind "page" (URL + title only) is allowed on any normal web/file URL, including the web
 * store and PDFs, since nothing is read from the page.
 */
export function restrictedReason(
  url: string | undefined | null,
  kind: CaptureKind | "picker" = "page_text",
  opts: { fileAccess?: boolean } = {},
): string | null {
  if (!url) return MSG.internal
  const lower = url.trim().toLowerCase()
  if (INTERNAL_SCHEMES.some((s) => lower.startsWith(s))) return MSG.internal
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return MSG.internal
  }
  const proto = parsed.protocol
  if (proto !== "http:" && proto !== "https:" && proto !== "file:" && proto !== "ftp:") return MSG.internal
  if (kind === "page") return null

  if (proto === "file:" && opts.fileAccess === false) return MSG.file
  const host = parsed.hostname.toLowerCase()
  if (STORE_HOSTS.includes(host)) return MSG.store
  if (host === "chrome.google.com" && parsed.pathname.startsWith("/webstore")) return MSG.store
  // The built-in PDF viewer can't be scripted (screenshots still work).
  if (kind !== "screenshot" && /\.pdf$/i.test(parsed.pathname)) return MSG.pdf
  return null
}

/** Map any raw chrome/runtime error to a friendly message. */
export function friendlyError(err: unknown): string {
  if (err instanceof CaptureError) return err.message
  const raw = err instanceof Error ? err.message : String(err ?? "")
  const m = raw.toLowerCase()
  if (m.includes("max_capture_visible_tab_calls_per_second")) return MSG.rate
  if (m.includes("extensions gallery") || m.includes("webstore")) return MSG.store
  if (m.includes("file://") || m.includes("file url")) return MSG.file
  if (m.includes("pdf")) return MSG.pdf
  if (
    m.includes("cannot access") ||
    m.includes("cannot be scripted") ||
    m.includes("chrome://") ||
    m.includes("brave://") ||
    m.includes("chrome-extension://") ||
    m.includes("missing host permission") ||
    m.includes("permission")
  )
    return MSG.internal
  if (m.includes("no tab with id") || m.includes("no current window") || m.includes("no window with id")) return MSG.noTab
  if (m.includes("frame") || m.includes("error page") || m.includes("receiving end does not exist")) return MSG.loading
  return MSG.generic
}

export function clampText(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + TRUNCATED
}

/** Trim, normalize newlines, collapse 3+ newlines to 2, cap length. */
export function normalizePageText(raw: string, max = MAX_PAGE_TEXT): string {
  const t = (raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return clampText(t, max)
}

/** URL/title clamp so attachments always pass protocol validation. */
export function clampMeta(url: string | undefined, title: string | undefined): { url: string; title: string } {
  return {
    url: (url || "").slice(0, MAX_URL),
    title: (title || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE),
  }
}

// ---------------------------------------------------------------------------
// chrome-backed helpers
// ---------------------------------------------------------------------------

async function getActiveTab(windowId: number): Promise<chrome.tabs.Tab> {
  let tabs: chrome.tabs.Tab[]
  try {
    tabs = await chrome.tabs.query({ active: true, windowId })
  } catch (e) {
    throw new CaptureError(friendlyError(e))
  }
  const tab = tabs[0]
  if (!tab || tab.id === undefined) throw new CaptureError(MSG.noTab)
  return tab
}

async function fileAccessAllowed(url: string | undefined): Promise<boolean | undefined> {
  if (!url?.toLowerCase().startsWith("file:")) return undefined
  try {
    return await chrome.extension.isAllowedFileSchemeAccess()
  } catch {
    return undefined
  }
}

async function assertCapturable(tab: chrome.tabs.Tab, kind: CaptureKind | "picker"): Promise<void> {
  const url = tab.url || tab.pendingUrl
  const reason = restrictedReason(url, kind, { fileAccess: await fileAccessAllowed(url) })
  if (reason) throw new CaptureError(reason)
}

/** Runs in the page (each frame). Must be self-contained. */
function readSelectionInPage(): { text: string; focused: boolean } {
  let text = ""
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
  if (active) {
    const tag = active.tagName
    const type = tag === "INPUT" ? ((active as HTMLInputElement).type || "text").toLowerCase() : ""
    const textual = tag === "TEXTAREA" || (tag === "INPUT" && ["text", "search", "url", "tel", "email"].includes(type))
    if (textual) {
      try {
        const s = active.selectionStart
        const e = active.selectionEnd
        if (s !== null && e !== null && e > s) text = active.value.substring(s, e)
      } catch {
        /* some input types throw on selectionStart */
      }
    }
  }
  if (!text) text = (window.getSelection()?.toString() || "")
  if (!text) {
    // Best effort: same-origin iframes (cross-origin frames are covered by allFrames).
    for (const f of Array.from(document.querySelectorAll("iframe"))) {
      try {
        const t = f.contentWindow?.getSelection()?.toString() || ""
        if (t.trim()) {
          text = t
          break
        }
      } catch {
        /* cross-origin */
      }
    }
  }
  return { text, focused: document.hasFocus() }
}

/** Runs in the page. Must be self-contained. */
function readPageTextInPage(): string {
  return document.body?.innerText || document.documentElement?.innerText || ""
}

type FrameResult<T> = { frameId: number; result?: T }

async function runInTab<T>(tabId: number, func: () => T, allFrames: boolean): Promise<FrameResult<T>[]> {
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId, allFrames }, func })
    return res as FrameResult<T>[]
  } catch (e) {
    if (allFrames) {
      // A blocked subframe can fail the whole call; retry the main frame alone.
      try {
        const res = await chrome.scripting.executeScript({ target: { tabId }, func })
        return res as FrameResult<T>[]
      } catch (e2) {
        throw new CaptureError(friendlyError(e2))
      }
    }
    throw new CaptureError(friendlyError(e))
  }
}

/** Pick the best selection among frames: focused frame first, then the main frame, then any. */
export function pickSelection(results: FrameResult<{ text: string; focused: boolean }>[]): string {
  const withText = results.filter((r) => r.result && r.result.text.trim())
  const focused = withText.find((r) => r.result!.focused)
  const main = withText.find((r) => r.frameId === 0)
  const best = focused || main || withText[0]
  return best ? best.result!.text : ""
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",")
  const mime = /data:([^;,]+)/.exec(dataUrl.slice(0, comma))?.[1] || "image/jpeg"
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Re-encode a too-large screenshot: scale to <= maxWidth, then lower quality / size until it fits. */
export async function shrinkDataUrl(
  dataUrl: string,
  maxBytes = SCREENSHOT_MAX_BYTES,
  maxWidth = SCREENSHOT_MAX_WIDTH,
): Promise<string> {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl))
  try {
    let width = Math.min(maxWidth, bitmap.width)
    let quality = 0.8
    let out = dataUrl
    for (let attempt = 0; attempt < 8; attempt++) {
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width))
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext("2d")
      if (!ctx) break
      ctx.drawImage(bitmap, 0, 0, width, height)
      out = await blobToDataUrl(await canvas.convertToBlob({ type: "image/jpeg", quality }))
      if (out.length <= maxBytes) return out
      if (quality > 0.55) quality -= 0.15
      else width = Math.max(320, Math.round(width * 0.75))
    }
    return out
  } finally {
    bitmap.close()
  }
}

/** Capture browser context from the active tab of `windowId`. Throws CaptureError with a friendly message. */
export async function captureAttachment(kind: CaptureKind, windowId: number): Promise<Attachment> {
  try {
    const tab = await getActiveTab(windowId)
    const { url, title } = clampMeta(tab.url || tab.pendingUrl, tab.title)
    await assertCapturable(tab, kind)
    const tabId = tab.id!

    switch (kind) {
      case "page":
        return { type: "page", url, title }

      case "selection": {
        const results = await runInTab(tabId, readSelectionInPage, true)
        const text = pickSelection(results)
        if (!text.trim()) throw new CaptureError(MSG.noSelection)
        return { type: "selection", url, title, text: clampText(text.trim(), MAX_SELECTION) }
      }

      case "page_text": {
        const results = await runInTab(tabId, readPageTextInPage, false)
        const main = results.find((r) => r.frameId === 0) || results[0]
        const text = normalizePageText(main?.result || "")
        if (!text) throw new CaptureError(MSG.noText)
        return { type: "page_text", url, title, text }
      }

      case "screenshot": {
        let dataUrl: string
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 80 })
        } catch (e) {
          throw new CaptureError(friendlyError(e))
        }
        if (!dataUrl) throw new CaptureError(MSG.generic)
        if (dataUrl.length > SCREENSHOT_MAX_BYTES) dataUrl = await shrinkDataUrl(dataUrl)
        return { type: "screenshot", url, title, dataUrl }
      }
    }
  } catch (e) {
    if (e instanceof CaptureError) throw e
    throw new CaptureError(friendlyError(e))
  }
  throw new CaptureError(MSG.generic)
}

/** Message the panel sends to the background to start or stop the element picker. */
export interface StartPickerMessage {
  action: "start-picker" | "stop-picker"
  windowId: number
}
export type StartPickerResponse = { ok: true; active: boolean } | { ok: false; error: string }

/**
 * Start the element picker on the active tab of `windowId`. Resolves with whether it is now
 * active. The picked element arrives later via the pending-attachments queue.
 */
export async function startPicker(windowId: number): Promise<boolean> {
  try {
    const tab = await getActiveTab(windowId)
    await assertCapturable(tab, "picker")
    const msg: StartPickerMessage = { action: "start-picker", windowId }
    const res = (await chrome.runtime.sendMessage(msg)) as StartPickerResponse | undefined
    if (!res) throw new CaptureError(MSG.generic)
    if (!res.ok) throw new CaptureError(res.error)
    return res.active
  } catch (e) {
    if (e instanceof CaptureError) throw e
    throw new CaptureError(friendlyError(e))
  }
}

/** Stop the element picker on the active tab of `windowId` (no-op if it is not running). */
export async function stopPicker(windowId: number): Promise<void> {
  try {
    const msg: StartPickerMessage = { action: "stop-picker", windowId }
    await chrome.runtime.sendMessage(msg)
  } catch {
    /* nothing to stop */
  }
}
