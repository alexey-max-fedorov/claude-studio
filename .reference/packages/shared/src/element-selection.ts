export interface ElementSelection {
  tagName: string
  id: string
  classList: string[]
  cssSelector: string
  textContent: string
  outerHTML: string
  attributes: Record<string, string>
  boundingRect: { top: number; left: number; width: number; height: number }
  computedStyles: {
    color: string
    backgroundColor: string
    fontSize: string
    fontFamily: string
    padding: string
    margin: string
  }
  parentChain: string[]
  siblingCount: number
  childCount: number
}
