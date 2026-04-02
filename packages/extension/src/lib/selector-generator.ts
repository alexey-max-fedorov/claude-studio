export function generateSelector(el: Element): string {
  // Strategy 1: data-testid
  const testId = el.getAttribute("data-testid")
  if (testId) return `[data-testid="${testId}"]`

  // Strategy 2: unique ID
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
    return `#${CSS.escape(el.id)}`
  }

  // Strategy 3: tag + classes (if unique)
  if (el.classList.length > 0) {
    const classSelector = `${el.tagName.toLowerCase()}.${Array.from(el.classList).map(CSS.escape).join(".")}`
    if (document.querySelectorAll(classSelector).length === 1) {
      return classSelector
    }
  }

  // Strategy 4: build path from nearest unique ancestor
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase()

    if (current.id && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }

    if (current.classList.length > 0) {
      part += `.${Array.from(current.classList).map(CSS.escape).join(".")}`
    }

    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((s) => s.tagName === current!.tagName)
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        part += `:nth-of-type(${index})`
      }
    }

    parts.unshift(part)
    current = current.parentElement
  }

  return parts.join(" > ")
}

export function getElementDescription(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).slice(0, 3).join(".")
  const id = el.id ? `#${el.id}` : ""
  return `${tag}${id}${classes ? `.${classes}` : ""}`
}
