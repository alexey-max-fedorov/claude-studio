/*
 * CSS selector generation for a picked element. The selector is resolved against the
 * element's root node (the document, or the shadow root it lives in) and is verified to
 * match exactly that element; if the readable strategies fail we fall back to a full
 * :nth-child path, which is always unique.
 */

type Root = Document | ShadowRoot

const MAX_CLASSES_IN_PATH = 2

function rootOf(el: Element): Root {
  const r = el.getRootNode()
  return r instanceof ShadowRoot ? r : el.ownerDocument || document
}

function safeAll(root: Root, selector: string): number {
  try {
    return root.querySelectorAll(selector).length
  } catch {
    return -1
  }
}

function matchesOnly(root: Root, selector: string, el: Element): boolean {
  try {
    const all = root.querySelectorAll(selector)
    return all.length === 1 && all[0] === el
  } catch {
    return false
  }
}

function quoteAttr(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ")}"`
}

function tagOf(el: Element): string {
  return el.tagName.toLowerCase()
}

/** Full, always-unique path using :nth-child from the top of the tree (or shadow root). */
function nthChildPath(el: Element): string {
  const parts: string[] = []
  let current: Element | null = el
  while (current) {
    const parent: Element | null = current.parentElement
    if (!parent) {
      parts.unshift(tagOf(current))
      break
    }
    const index = Array.from(parent.children).indexOf(current) + 1
    parts.unshift(`${tagOf(current)}:nth-child(${index})`)
    current = parent
  }
  return parts.join(" > ")
}

export function generateSelector(el: Element): string {
  const root = rootOf(el)
  const tag = tagOf(el)
  const isDocRoot = !(root instanceof ShadowRoot)

  if (isDocRoot && (tag === "html" || tag === "body" || tag === "head")) return tag

  // Strategy 1: data-testid (only when unique)
  const testId = el.getAttribute("data-testid")
  if (testId) {
    const sel = `[data-testid=${quoteAttr(testId)}]`
    if (matchesOnly(root, sel, el)) return sel
  }

  // Strategy 2: unique ID
  if (el.id) {
    const sel = `#${CSS.escape(el.id)}`
    if (matchesOnly(root, sel, el)) return sel
  }

  // Strategy 3: tag + classes (if unique)
  if (el.classList.length > 0) {
    const sel = `${tag}.${Array.from(el.classList).map((c) => CSS.escape(c)).join(".")}`
    if (matchesOnly(root, sel, el)) return sel
  }

  // Strategy 4: path from the nearest uniquely identifiable ancestor
  const parts: string[] = []
  let current: Element | null = el
  while (current) {
    const ctag = tagOf(current)
    if (isDocRoot && ctag === "body") {
      parts.unshift("body")
      break
    }
    if (current !== el && current.id && safeAll(root, `#${CSS.escape(current.id)}`) === 1) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }

    let part = ctag
    if (current.classList.length > 0) {
      part += `.${Array.from(current.classList).slice(0, MAX_CLASSES_IN_PATH).map((c) => CSS.escape(c)).join(".")}`
    }
    const parent: Element | null = current.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter((s) => s.tagName === current!.tagName)
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
    }
    parts.unshift(part)
    current = parent
  }

  const path = parts.join(" > ")
  if (path && matchesOnly(root, path, el)) return path

  return nthChildPath(el)
}

export function getElementDescription(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).slice(0, 3).join(".")
  const id = el.id ? `#${el.id}` : ""
  return `${tag}${id}${classes ? `.${classes}` : ""}`
}
