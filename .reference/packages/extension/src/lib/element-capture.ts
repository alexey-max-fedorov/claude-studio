import type { ElementSelection } from "@claude-studio/shared"
import { generateSelector, getElementDescription } from "./selector-generator"

export function captureElement(el: Element): ElementSelection {
  const rect = el.getBoundingClientRect()
  const computed = window.getComputedStyle(el)

  const parentChain: string[] = []
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    parentChain.unshift(getElementDescription(parent))
    parent = parent.parentElement
  }

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || "",
    classList: Array.from(el.classList),
    cssSelector: generateSelector(el),
    textContent: (el.textContent || "").trim().slice(0, 200),
    outerHTML: el.outerHTML.slice(0, 500),
    attributes: Object.fromEntries(
      Array.from(el.attributes)
        .filter((a) => !["class", "id", "style"].includes(a.name))
        .map((a) => [a.name, a.value])
    ),
    boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    computedStyles: {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
    },
    parentChain,
    siblingCount: el.parentElement?.children.length || 0,
    childCount: el.children.length,
  }
}
