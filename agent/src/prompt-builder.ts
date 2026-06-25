import { randomBytes } from "node:crypto"
import type { ElementSelection } from "@claude-studio/protocol"
import type { SourceLocation } from "./locate-element.js"

export interface PromptInput {
  route: string
  url: string
  element: ElementSelection
  locations: SourceLocation[]
  prompt: string
  routeHints: boolean
  external: boolean
}

const DEV_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local|.*\.test)$/i

function hostOf(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase() } catch { return null }
}

/**
 * A URL is the user's dev server when its host is a well-known local host, OR
 * equals `devHost` — the host the extension dialed over the WebSocket (captured
 * server-side from the connection's Host header). Everything else (e.g.
 * github.com) is an external page to fetch and port in.
 */
export function isDevServer(url: string, devHost?: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  if (DEV_HOSTS.test(host)) return true
  if (devHost && host === devHost.toLowerCase()) return true
  return false
}

export function buildPrompt({ route, url, element, locations, prompt, routeHints, external }: PromptInput): string {
  // Per-message random nonce so user content cleanly delimits from instructions.
  const nonce = randomBytes(8).toString("hex")
  const elemTag = `element-context-${nonce}`
  const userTag = `user-instruction-${nonce}`
  const attrs = Object.entries(element.attributes).map(([k, v]) => `${k}="${v}"`).join(", ")

  const located = locations.length
    ? `\nLikely source location(s) in the project (matched by text/attributes/id):\n${locations.map((l) => `  - ${l.file}:${l.line}  ${l.snippet}`).join("\n")}`
    : ""

  const findStep = external
    ? `1. This element is on an EXTERNAL page (${url}), not the user's project. Use WebFetch to retrieve that page, locate this element in the returned HTML (match the snippet/selector below), then port it into the user's project as the instruction asks (e.g. copy an inline SVG into a component). Use Grep/Glob to decide where it belongs.`
    : locations.length
      ? `1. The selected element is most likely defined at the location(s) listed above — open them first and confirm by matching the text/classes before editing.`
      : routeHints
        ? `1. The browser route "${route}" maps to a source file. Use Grep/Glob to find it — e.g. app/${routeToPath(route)}/page.* or pages/${routeToPath(route)}.* (Next.js), src/routes (SvelteKit/Remix), src/pages or src/views (Vue/React Router). Match on text content, class names, and structure.`
        : `1. Use Grep/Glob to find the source file that renders this element by matching its text content, class names, and structure.`

  return `The user is viewing ${external ? "an external page" : "their web application"} at: ${url || route}
They selected an element on the live page and want to make a change.

<${elemTag}>
- CSS Selector: ${element.cssSelector}
- Tag: <${element.tagName}> with classes: [${element.classList.join(", ")}]
- Element ID: ${element.id || "none"}
- Text content (first 200 chars): "${element.textContent}"
- HTML snippet (first 500 chars): ${element.outerHTML}
- Key attributes: ${attrs || "none"}
- Current computed styles: color=${element.computedStyles.color}, bg=${element.computedStyles.backgroundColor}, font-size=${element.computedStyles.fontSize}
- Parent chain: ${element.parentChain.join(" > ")}
</${elemTag}>${located}

<${userTag}>
${prompt}
</${userTag}>

Instructions for you:
${findStep}
2. Read the relevant file(s) to understand the current code.
3. Make the requested change using Edit. Be surgical — change only what's needed.
4. If the change involves styles, prefer the project's existing styling approach (Tailwind classes, CSS modules, styled-components) over inline styles, matching existing patterns.
5. Do NOT create new files unless explicitly asked. Do NOT refactor unrelated code.`
}

function routeToPath(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, "")
  return clean === "" ? "" : clean
}
