import type { ElementSelection } from "@claude-studio/protocol"
import { generateSelector, getElementDescription } from "./selector-generator"

export const MAX_OUTER_HTML = 8000
export const MAX_TEXT = 2000
export const MAX_ATTR_VALUE = 500
export const MAX_ATTRS = 40
export const MAX_PARENT_CHAIN = 15

const TRUNC_HTML = "<!-- truncated -->"
const TRUNC_TEXT = " [truncated]"

/** Cut `s` so the result (marker included) is at most `max` chars. */
export function truncate(s: string, max: number, marker: string): string {
  if (s.length <= max) return s
  return s.slice(0, Math.max(0, max - marker.length)) + marker
}

function readableText(el: Element): string {
  // innerText skips script/style and hidden text; jsdom and non-HTML elements lack it.
  const inner = (el as HTMLElement).innerText
  const raw = typeof inner === "string" ? inner : el.textContent || ""
  return raw.replace(/[ \t\f\v\r]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function captureElement(el: Element): ElementSelection {
  const rect = el.getBoundingClientRect()
  const view = el.ownerDocument?.defaultView || window
  const computed = view.getComputedStyle(el)

  const parentChain: string[] = []
  let parent = el.parentElement
  while (parent && parent.tagName.toLowerCase() !== "body" && parent.tagName.toLowerCase() !== "html") {
    parentChain.unshift(getElementDescription(parent))
    parent = parent.parentElement
  }

  const attributes: Record<string, string> = {}
  let count = 0
  for (const a of Array.from(el.attributes)) {
    if (a.name === "class" || a.name === "id" || a.name === "style") continue
    if (count++ >= MAX_ATTRS) break
    attributes[a.name] = truncate(a.value, MAX_ATTR_VALUE, "...")
  }

  return {
    tagName: el.tagName.toLowerCase(),
    id: (el.id || "").slice(0, 500),
    classList: Array.from(el.classList).slice(0, 100).map((c) => c.slice(0, 500)),
    cssSelector: generateSelector(el),
    textContent: truncate(readableText(el), MAX_TEXT, TRUNC_TEXT),
    outerHTML: truncate(el.outerHTML, MAX_OUTER_HTML, TRUNC_HTML),
    attributes,
    boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    computedStyles: {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
    },
    parentChain: parentChain.slice(-MAX_PARENT_CHAIN),
    siblingCount: el.parentElement?.children.length || 0,
    childCount: el.children.length,
  }
}
