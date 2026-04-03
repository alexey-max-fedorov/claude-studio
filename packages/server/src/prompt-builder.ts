import type { ElementSelection } from "@claude-studio/shared"

interface PromptInput {
  route: string
  element: ElementSelection
  prompt: string
}

export function buildPrompt({ route, element, prompt }: PromptInput): string {
  const attrs = Object.entries(element.attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ")

  return `The user is viewing their Next.js application at route: ${route}
They selected an element on the live page and want to make a change.

Selected element details:
- CSS Selector: ${element.cssSelector}
- Tag: <${element.tagName}> with classes: [${element.classList.join(", ")}]
- Element ID: ${element.id || "none"}
- Text content (first 200 chars): "${element.textContent}"
- HTML snippet (first 500 chars): ${element.outerHTML}
- Key attributes: ${attrs || "none"}
- Current computed styles: color=${element.computedStyles.color}, bg=${element.computedStyles.backgroundColor}, font-size=${element.computedStyles.fontSize}
- Parent chain: ${element.parentChain.join(" > ")}

User's instruction: "${prompt}"

Instructions for you:
1. Use Grep and Glob to find the source file(s) that render this element. Look for matching text content, class names, and component structure. The route "${route}" maps to a Next.js page — check app/${route === "/" ? "" : route.slice(1)}/page.tsx or pages/${route}.tsx first.
2. Read the relevant file(s) to understand the current code.
3. Make the requested change using Edit. Be surgical — change only what's needed.
4. If the change involves styles, prefer editing Tailwind classes or CSS modules over inline styles, matching the project's existing patterns.
5. Do NOT create new files unless explicitly asked. Do NOT refactor unrelated code.`
}
