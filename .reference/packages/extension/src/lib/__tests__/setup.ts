// Polyfill CSS.escape for jsdom
if (typeof globalThis.CSS === "undefined") {
  (globalThis as any).CSS = {}
}
if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) => {
    return value.replace(/([^\w-])/g, "\\$1")
  }
}
