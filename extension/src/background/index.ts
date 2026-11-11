import { clampMeta, friendlyError, restrictedReason, type StartPickerResponse } from "../lib/capture"
import type { Attachment } from "@claude-studio/protocol"
import { appendPending, isAttachmentLike, PENDING_KEY, takeForWindow, withWindow, type PendingAttachment } from "./pending"

/*
 * Background service worker. No WebSocket here: the side panel owns the agent connection.
 * Jobs: open the panel from the toolbar button, context menus, the picker shortcut, and
 * queue attachments for the panel in chrome.storage.session "pendingAttachments".
 * The background is the only writer of that key: panels take their items with a
 * {action: "take-pending", windowId} message, serialized with the appends below.
 */

const MENU_SELECTION = "claude-ask-selection"
const MENU_PAGE = "claude-ask-page"
const MENU_LINK = "claude-ask-link"

function noop() {}

function setPanelBehavior() {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(noop)
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError
    chrome.contextMenus.create({ id: MENU_SELECTION, title: "Ask Claude about selection", contexts: ["selection"] }, noopLastError)
    chrome.contextMenus.create({ id: MENU_PAGE, title: "Ask Claude about this page", contexts: ["page", "frame"] }, noopLastError)
    chrome.contextMenus.create({ id: MENU_LINK, title: "Ask Claude about this link", contexts: ["link"] }, noopLastError)
  })
}

function noopLastError() {
  void chrome.runtime.lastError
}

chrome.runtime.onInstalled.addListener(() => {
  setPanelBehavior()
  createMenus()
})
chrome.runtime.onStartup.addListener(setPanelBehavior)
setPanelBehavior()

// ---------------------------------------------------------------------------
// Pending attachments queue. Every read-modify-write runs on one promise chain, so appends
// and takes never interleave.
// ---------------------------------------------------------------------------
let queueChain: Promise<unknown> = Promise.resolve()

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueChain.then(fn, fn)
  queueChain = run.catch(() => {})
  return run
}

function queuePending(item: PendingAttachment): Promise<void> {
  return serialized(async () => {
    const r = await chrome.storage.session.get(PENDING_KEY)
    await chrome.storage.session.set({ [PENDING_KEY]: appendPending(r[PENDING_KEY], item) })
  }).catch((e) => console.warn("[Claude Studio] could not queue attachment:", e))
}

function takePending(windowId: number): Promise<Attachment[]> {
  return serialized(async () => {
    const r = await chrome.storage.session.get(PENDING_KEY)
    const { mine, rest } = takeForWindow(r[PENDING_KEY], windowId)
    if (mine.length) await chrome.storage.session.set({ [PENDING_KEY]: rest })
    return mine
  }).catch(() => [] as Attachment[])
}

/** Must be called synchronously inside a user-gesture handler. */
function openPanel(windowId: number | undefined) {
  if (typeof windowId !== "number" || windowId < 0) return
  try {
    chrome.sidePanel.open({ windowId }).catch(noop)
  } catch {
    /* no gesture or unsupported */
  }
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const windowId = tab?.windowId
  openPanel(windowId) // first, while the user gesture is still valid

  const pageUrl = info.pageUrl || tab?.url || ""
  let attachment: Attachment | null = null
  if (info.menuItemId === MENU_SELECTION) {
    const text = (info.selectionText || "").trim()
    if (!text) return
    const { url, title } = clampMeta(info.frameUrl || pageUrl, tab?.title)
    attachment = { type: "selection", url, title, text }
  } else if (info.menuItemId === MENU_PAGE) {
    attachment = { type: "page", ...clampMeta(pageUrl, tab?.title) }
  } else if (info.menuItemId === MENU_LINK && info.linkUrl) {
    const { url } = clampMeta(info.linkUrl, "")
    attachment = { type: "page", url, title: clampMeta("", info.selectionText || info.linkUrl).title }
  }
  if (attachment) void queuePending(withWindow(attachment, windowId))
})

// ---------------------------------------------------------------------------
// Element picker control
// ---------------------------------------------------------------------------
function pickerScriptFiles(): string[] {
  const scripts = chrome.runtime.getManifest().content_scripts ?? []
  return scripts.flatMap((c) => c.js ?? []).filter((f) => f.includes("element-picker"))
}

type PickerOp = "picker-start" | "picker-stop" | "toggle-picker"

async function sendPicker(tabId: number, op: PickerOp): Promise<{ active: boolean } | undefined> {
  return (await chrome.tabs.sendMessage(tabId, { action: op }, { frameId: 0 })) as { active: boolean } | undefined
}

/** Start / stop / toggle the picker in a tab, injecting the content script first if the tab predates the extension. */
async function pickerInTab(tab: chrome.tabs.Tab, op: PickerOp): Promise<StartPickerResponse> {
  if (tab.id === undefined) return { ok: false, error: "No active tab found in this window" }
  const reason = restrictedReason(tab.url || tab.pendingUrl, "picker")
  if (reason) return op === "picker-stop" ? { ok: true, active: false } : { ok: false, error: reason }
  try {
    const res = await sendPicker(tab.id, op)
    if (res && typeof res.active === "boolean") return { ok: true, active: res.active }
  } catch {
    /* no receiver yet: inject below */
  }
  if (op === "picker-stop") return { ok: true, active: false } // nothing running there
  try {
    const files = pickerScriptFiles()
    if (!files.length) return { ok: false, error: "Element picker is missing from this build" }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files })
    const res = await sendPicker(tab.id, op)
    return { ok: true, active: !!res?.active }
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}

async function pickerInWindow(windowId: number | undefined, op: PickerOp): Promise<StartPickerResponse> {
  try {
    const query: chrome.tabs.QueryInfo =
      typeof windowId === "number" ? { active: true, windowId } : { active: true, lastFocusedWindow: true }
    const [tab] = await chrome.tabs.query(query)
    if (!tab) return { ok: false, error: "No active tab found in this window" }
    return await pickerInTab(tab, op)
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-picker") return
  openPanel(tab?.windowId) // keyboard shortcut is a user gesture; show where the pick will land
  void pickerInWindow(tab?.windowId, "toggle-picker")
})

// ---------------------------------------------------------------------------
// Runtime messages (content script + side panel)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return

  if (message.action === "element-picked") {
    const a = message.attachment
    if (!isAttachmentLike(a) || a.type !== "element" || !sender.tab) {
      sendResponse({ ok: false })
      return
    }
    const meta = clampMeta(a.url || sender.tab.url, a.title || sender.tab.title)
    const item = withWindow({ type: "element", ...meta, element: a.element }, sender.tab.windowId)
    queuePending(item).then(() => sendResponse({ ok: true }))
    return true
  }

  if (message.action === "start-picker" || message.action === "stop-picker") {
    const windowId = typeof message.windowId === "number" ? message.windowId : undefined
    pickerInWindow(windowId, message.action === "start-picker" ? "picker-start" : "picker-stop").then(sendResponse)
    return true
  }

  if (message.action === "take-pending") {
    // Only extension pages (the side panel) may take; never content scripts.
    if (sender.tab || typeof message.windowId !== "number") {
      sendResponse([])
      return
    }
    takePending(message.windowId).then(sendResponse)
    return true
  }
})
