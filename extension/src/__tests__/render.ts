import type React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

/** Minimal render helper (no testing-library dependency). */
export function render(el: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(el))
  return {
    container,
    rerender: (next: React.ReactElement) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  }
}

export { act }
