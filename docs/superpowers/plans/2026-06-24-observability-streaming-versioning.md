# Observability, Live Streaming, UX Fixes & Versioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Claude's live text + thinking in the extension and the agent TUI, fix the model-selector dropdown and `/context` table rendering, and add uniform cross-package version bumping.

**Architecture:** The agent enables the SDK's `includePartialMessages` so `stream_event` deltas drive token-live text (`ai_streaming`) and a new `ai_thinking` channel. A process-wide `activityBuffer` mirrors that stream into a toggleable TUI panel. The extension renders thinking bubbles and gains GFM-table support (collapsible) in `MarkdownLite`. A `scripts/bump-version.sh` keeps all package versions in lockstep, with the TUI reading its version dynamically.

**Tech Stack:** TypeScript (strict, ESM), React 18, Ink, `@anthropic-ai/claude-agent-sdk` 0.2.x, Plasmo, vitest, perl/bash.

## Global Constraints

- TypeScript strict everywhere; ESM modules.
- Agent + protocol source use `.js` import specifiers (e.g. `./foo.js`).
- `@claude-studio/protocol` is consumed from `protocol/dist/` — **rebuild protocol** (`pnpm --filter @claude-studio/protocol build`) after editing protocol types, before agent/extension typecheck.
- Tests: vitest. Per-package: `pnpm --filter <pkg> test`. All: `pnpm -r test`.
- Server→client messages are NOT runtime-validated (only `JSON.stringify` via `serializeServerMessage`); adding to the `ServerMessage` union is sufficient.
- Config flows only through the agent `ConfigStore`; do not add config side-channels.
- Target version after this work: **2.0.1** (uniform across protocol, agent, extension, website).

---

## File Structure

- `protocol/src/protocol.ts` — add `ai_thinking` to `ServerMessage`.
- `agent/src/activity.ts` — **new**: process-wide live-activity buffer (coalescing).
- `agent/src/query-options.ts` — enable `includePartialMessages`.
- `agent/src/claude-session.ts` — stream-event deltas → `onStreaming`/`onThinking` + activity push; drop duplicate whole-block text emission.
- `agent/src/ws-handler.ts` — wire `onThinking` → `ai_thinking`.
- `agent/src/tui/ActivityPanel.tsx` — **new**: live agent-activity panel.
- `agent/src/tui/App.tsx` — `v` key toggles the activity panel; key hint; pass version to StatusBar.
- `agent/src/tui/StatusBar.tsx` — show dynamic version.
- `agent/src/cli.tsx` — pass version into `<App>`.
- `extension/src/sidepanel.tsx` — handle `ai_thinking`.
- `extension/src/components/ChatMessage.tsx` — render `thinking` role.
- `extension/src/components/MarkdownLite.tsx` — GFM tables, collapsible + styled.
- `scripts/bump-version.sh` — **new**: uniform version bump.

---

## Task 1: Protocol — `ai_thinking` server message

**Files:**
- Modify: `protocol/src/protocol.ts:38` (within `ServerMessage` union)

**Interfaces:**
- Produces: `ServerMessage` variant `{ type: "ai_thinking"; chunk: string }`.

- [ ] **Step 1: Add the message variant**

In `protocol/src/protocol.ts`, add the line right after the `ai_streaming` variant:

```ts
  | { type: "ai_streaming"; chunk: string }
  | { type: "ai_thinking"; chunk: string }
```

- [ ] **Step 2: Rebuild protocol so consumers see the new type**

Run: `pnpm --filter @claude-studio/protocol build`
Expected: tsc exits 0; `protocol/dist/protocol.d.ts` now contains `ai_thinking`.

- [ ] **Step 3: Verify the type is emitted**

Run: `grep -c ai_thinking protocol/dist/protocol.d.ts`
Expected: `1` (or more).

- [ ] **Step 4: Commit**

```bash
git add protocol/src/protocol.ts protocol/dist
git commit -m "feat(protocol): add ai_thinking server message"
```

---

## Task 2: Agent — live activity buffer

A process-wide buffer the TUI subscribes to. Coalesces consecutive same-kind chunks so per-token deltas don't flood it; `tool` entries are always discrete.

**Files:**
- Create: `agent/src/activity.ts`
- Test: `agent/src/__tests__/activity.test.ts`

**Interfaces:**
- Produces:
  - `type ActivityKind = "thinking" | "text" | "tool"`
  - `interface ActivityEntry { kind: ActivityKind; text: string }`
  - `activityBuffer.append(kind: ActivityKind, text: string): void`
  - `activityBuffer.entries(): ActivityEntry[]`
  - `activityBuffer.clear(): void`
  - emits `"update"` on every change (EventEmitter).

- [ ] **Step 1: Write the failing test**

Create `agent/src/__tests__/activity.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { activityBuffer } from "../activity.js"

describe("activityBuffer", () => {
  beforeEach(() => activityBuffer.clear())

  it("coalesces consecutive same-kind chunks", () => {
    activityBuffer.append("text", "Hel")
    activityBuffer.append("text", "lo")
    expect(activityBuffer.entries()).toEqual([{ kind: "text", text: "Hello" }])
  })

  it("keeps tool entries discrete and separates kinds", () => {
    activityBuffer.append("thinking", "hmm")
    activityBuffer.append("text", "hi")
    activityBuffer.append("tool", "Edit")
    activityBuffer.append("tool", "Edit")
    expect(activityBuffer.entries().map((e) => e.kind)).toEqual([
      "thinking", "text", "tool", "tool",
    ])
  })

  it("emits update events", () => {
    let n = 0
    const on = () => { n++ }
    activityBuffer.on("update", on)
    activityBuffer.append("text", "x")
    activityBuffer.off("update", on)
    expect(n).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter claude-studio test -- activity`
Expected: FAIL — cannot find module `../activity.js`.

- [ ] **Step 3: Implement the buffer**

Create `agent/src/activity.ts`:

```ts
import { EventEmitter } from "node:events"

export type ActivityKind = "thinking" | "text" | "tool"
export interface ActivityEntry { kind: ActivityKind; text: string }

const MAX = 100

class ActivityBuffer extends EventEmitter {
  private buf: ActivityEntry[] = []

  append(kind: ActivityKind, text: string): void {
    const last = this.buf[this.buf.length - 1]
    if (last && last.kind === kind && kind !== "tool") {
      last.text += text
    } else {
      this.buf.push({ kind, text })
      if (this.buf.length > MAX) this.buf.shift()
    }
    this.emit("update")
  }

  entries(): ActivityEntry[] {
    return this.buf.slice()
  }

  clear(): void {
    this.buf = []
    this.emit("update")
  }
}

export const activityBuffer = new ActivityBuffer()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter claude-studio test -- activity`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/src/activity.ts agent/src/__tests__/activity.test.ts
git commit -m "feat(agent): add live activity buffer"
```

---

## Task 3: Agent — partial-message streaming + thinking

Enable `includePartialMessages`; translate `stream_event` deltas into token-live `onStreaming` (text) and `onThinking` (thinking), mirror both + tool uses into `activityBuffer`; stop emitting whole text blocks from the `assistant` message (deltas now own text) while keeping `tool_use` detection. Wire the new `onThinking` callback through `ws-handler` to an `ai_thinking` client message.

**Files:**
- Modify: `agent/src/query-options.ts:11-23`
- Modify: `agent/src/claude-session.ts` (callbacks interface + message loop)
- Modify: `agent/src/ws-handler.ts:43-59`
- Test: `agent/src/__tests__/claude-session.test.ts` (new), `agent/src/__tests__/query-options.test.ts` (extend)

**Interfaces:**
- Consumes: `activityBuffer.append` (Task 2).
- Produces:
  - `SessionCallbacks.onThinking(chunk: string): void`
  - `buildQueryOptions(...)` result includes `includePartialMessages: true`.
  - `ws-handler` sends `{ type: "ai_thinking", chunk }`.

- [ ] **Step 1: Write the failing query-options test**

Add to `agent/src/__tests__/query-options.test.ts` (inside the existing describe block):

```ts
  it("enables partial message streaming", () => {
    const opts = buildQueryOptions(baseConfig, undefined)
    expect(opts.includePartialMessages).toBe(true)
  })
```

(If the existing test file names the config fixture differently than `baseConfig`, reuse that fixture name — check the top of the file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter claude-studio test -- query-options`
Expected: FAIL — `includePartialMessages` is `undefined`.

- [ ] **Step 3: Enable the option**

In `agent/src/query-options.ts`, add to the `options` object literal (after `settingSources`):

```ts
    settingSources: ["user", "project", "local"],
    // Stream token-level deltas (text + thinking) so clients render live.
    includePartialMessages: true,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter claude-studio test -- query-options`
Expected: PASS.

- [ ] **Step 5: Write the failing claude-session streaming test**

Create `agent/src/__tests__/claude-session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the SDK before importing the module under test.
const queryMock = vi.fn()
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: unknown) => queryMock(args),
}))

import { ClaudeSession } from "../claude-session.js"
import { activityBuffer } from "../activity.js"
import type { StudioConfig } from "@claude-studio/protocol"

const cfg = {
  model: "sonnet", projectDir: "/tmp", maxTurns: 5, maxBudgetUsd: 1,
  permissionMode: "default", allowBash: false, routeHints: false,
  enabledPlugins: [], enabledSkills: [], systemPromptAppend: "",
} as unknown as StudioConfig

function fakeQuery(messages: any[]) {
  return {
    async *[Symbol.asyncIterator]() { for (const m of messages) yield m },
    interrupt: async () => {},
  }
}

function collect() {
  const out = { text: "", thinking: "", tools: [] as string[], done: false, error: "" }
  return {
    out,
    cb: {
      onStreaming: (c: string) => { out.text += c },
      onThinking: (c: string) => { out.thinking += c },
      onToolUse: (t: string) => { out.tools.push(t) },
      onComplete: () => { out.done = true },
      onError: (e: string) => { out.error = e },
    },
  }
}

describe("ClaudeSession streaming", () => {
  beforeEach(() => { queryMock.mockReset(); activityBuffer.clear() })

  it("emits live text + thinking from stream_event deltas, not whole blocks", async () => {
    queryMock.mockReturnValue(fakeQuery([
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "let me think" } } },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } } },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } } },
      { type: "assistant", message: { content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", name: "Edit", input: { a: 1 } },
      ] } },
      { type: "result", subtype: "success", session_id: "s1", result: "Hello", num_turns: 1, total_cost_usd: 0, usage: {} },
    ]))
    const session = new ClaudeSession(() => cfg)
    const { out } = collect()
    const helper = collect()
    session.executeRawPrompt("client1", "hi", helper.cb as any)
    // allow the async generator to drain
    await new Promise((r) => setTimeout(r, 20))
    expect(helper.out.thinking).toBe("let me think")
    expect(helper.out.text).toBe("Hello")        // from deltas only — NOT doubled by the assistant block
    expect(helper.out.tools).toEqual(["Edit"])
    expect(helper.out.done).toBe(true)
    expect(activityBuffer.entries().some((e) => e.kind === "tool" && e.text.includes("Edit"))).toBe(true)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter claude-studio test -- claude-session`
Expected: FAIL — `onThinking` not called (type error / `out.thinking` empty) and/or text doubled to `"HelloHello"`.

- [ ] **Step 7: Add `onThinking` to the callbacks interface**

In `agent/src/claude-session.ts`, in `SessionCallbacks`:

```ts
export interface SessionCallbacks {
  onStreaming(chunk: string): void
  onThinking(chunk: string): void
  onToolUse(tool: string, input: Record<string, unknown>): void
  onComplete(c: {
    result: string; sessionId: string; cost: number; turns: number
    usage: Usage; duration_ms: number; model: string
  }): void
  onError(error: string): void
}
```

- [ ] **Step 8: Handle stream-event deltas + activity; stop double-emitting text**

In `agent/src/claude-session.ts`, add the activity import at the top (next to the logger import):

```ts
import { log } from "./logger.js"
import { activityBuffer } from "./activity.js"
```

Then, inside the `for await (const msg of q)` loop, add a `stream_event` branch and change the `assistant` branch so it no longer emits text. Replace the existing `if (msg.type === "system") { ... } else if (msg.type === "assistant") { ... }` chain's `assistant` branch and insert the stream_event handling:

```ts
        if (msg.type === "system") {
          // Capture available slash commands advertised at init, if present.
          const cmds = msg.slash_commands ?? msg.commands
          if (Array.isArray(cmds)) {
            this.cachedCommands = cmds.map((c: any) =>
              typeof c === "string"
                ? { name: c, description: "", argumentHint: "" }
                : { name: String(c.name ?? ""), description: String(c.description ?? ""), argumentHint: String(c.argumentHint ?? c.argument_hint ?? "") },
            )
          }
        } else if (msg.type === "stream_event") {
          // Token-level deltas drive live text + thinking.
          const ev = msg.event
          if (ev?.type === "content_block_delta") {
            const d = ev.delta
            if (d?.type === "text_delta" && d.text) {
              cb.onStreaming(d.text)
              activityBuffer.append("text", d.text)
            } else if (d?.type === "thinking_delta" && d.thinking) {
              cb.onThinking(d.thinking)
              activityBuffer.append("thinking", d.thinking)
            }
          }
        } else if (msg.type === "assistant") {
          // Text + thinking already streamed via stream_event deltas; here we only
          // pick up tool_use blocks (their inputs aren't streamed as usable deltas).
          for (const block of msg.message?.content ?? []) {
            if (block.type === "tool_use") {
              cb.onToolUse(block.name, block.input ?? {})
              activityBuffer.append("tool", `${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 80)}`)
            }
          }
        } else if (msg.type === "result") {
```

(Leave the `result` branch body unchanged.)

- [ ] **Step 9: Run it to verify it passes**

Run: `pnpm --filter claude-studio test -- claude-session`
Expected: PASS.

- [ ] **Step 10: Wire `onThinking` through ws-handler**

In `agent/src/ws-handler.ts`, in the `callbacks` factory, add the thinking handler next to `onStreaming`:

```ts
  const callbacks = (): SessionCallbacks => ({
    onStreaming: (chunk) => connections.send(clientId, { type: "ai_streaming", chunk }),
    onThinking: (chunk) => connections.send(clientId, { type: "ai_thinking", chunk }),
    onToolUse: (tool, input) => connections.send(clientId, { type: "tool_use", tool, input }),
    onError: (error) => connections.send(clientId, { type: "ai_error", error }),
```

- [ ] **Step 11: Typecheck + full agent tests**

Run: `pnpm --filter claude-studio typecheck && pnpm --filter claude-studio test`
Expected: tsc exits 0; all agent tests pass.

- [ ] **Step 12: Commit**

```bash
git add agent/src/query-options.ts agent/src/claude-session.ts agent/src/ws-handler.ts agent/src/__tests__/query-options.test.ts agent/src/__tests__/claude-session.test.ts
git commit -m "feat(agent): stream token-live text + thinking via partial messages"
```

---

## Task 4: Agent TUI — live activity peek panel

A bordered panel showing the tail of `activityBuffer`, hidden by default, toggled with `v`.

**Files:**
- Create: `agent/src/tui/ActivityPanel.tsx`
- Modify: `agent/src/tui/App.tsx`

**Interfaces:**
- Consumes: `activityBuffer` (Task 2).
- Produces: `<ActivityPanel />` (no props).

- [ ] **Step 1: Create the panel**

Create `agent/src/tui/ActivityPanel.tsx`:

```tsx
import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import { activityBuffer, type ActivityEntry } from "../activity.js"

const COLOR: Record<ActivityEntry["kind"], string> = { thinking: "gray", text: "white", tool: "magenta" }
const LABEL: Record<ActivityEntry["kind"], string> = { thinking: "think", text: "text", tool: "tool" }

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(-180)
}

export function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>(activityBuffer.entries())
  useEffect(() => {
    const on = () => setEntries(activityBuffer.entries().slice(-6))
    activityBuffer.on("update", on)
    return () => { activityBuffer.off("update", on) }
  }, [])
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow" bold>Agent activity (live)</Text>
      {entries.length === 0 && <Text color="gray">waiting for agent…</Text>}
      {entries.slice(-6).map((e, i) => (
        <Text key={i} color={COLOR[e.kind]}>
          <Text color="gray">[{LABEL[e.kind]}] </Text>{oneLine(e.text)}
        </Text>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Toggle it from App with `v`**

In `agent/src/tui/App.tsx`:

1. Add the import:
```tsx
import { LogPanel } from "./LogPanel.js"
import { ActivityPanel } from "./ActivityPanel.js"
```

2. Add state after `const [skills, setSkills] = useState<SkillInfo[]>([])`:
```tsx
  const [peek, setPeek] = useState(false)
```

3. In `useInput`, add a branch (before the `exit` handling is fine; place after the `q` check):
```tsx
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) { exit(); return }
    if (input === "v") { setPeek((p) => !p); return }
    if (key.upArrow) setSel((s) => (s - 1 + rows.length) % rows.length)
    else if (key.downArrow) setSel((s) => (s + 1) % rows.length)
    else if (key.leftArrow) change(-1)
    else if (key.rightArrow || input === " ") change(1)
  })
```

4. In the returned JSX, render the panel + a key hint:
```tsx
    <Box flexDirection="column">
      <StatusBar url={url} count={count} version={version} />
      <ConfigPanel config={cfg} selected={sel} />
      <TogglesPanel plugins={plugins} skills={skills} config={cfg} />
      {peek && <ActivityPanel />}
      <LogPanel />
      <Text color="gray">↑↓ select · ←→ change · v {peek ? "hide" : "show"} agent activity · q quit</Text>
    </Box>
```

(Note: `version` prop on StatusBar comes from Task 7; if executing Task 4 before Task 7, temporarily omit `version={version}` and the `version` prop, then add in Task 7. Recommended: do Task 7 first or together.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter claude-studio typecheck`
Expected: tsc exits 0.

- [ ] **Step 4: Commit**

```bash
git add agent/src/tui/ActivityPanel.tsx agent/src/tui/App.tsx
git commit -m "feat(agent): toggleable live agent-activity TUI panel (v)"
```

---

## Task 5: Extension — render Claude's thinking

Handle `ai_thinking` in the side panel and render a dimmed "thinking" bubble. (Live text streaming needs no extension change — the existing `ai_streaming` incremental append already renders deltas live once Task 3 ships.)

**Files:**
- Modify: `extension/src/sidepanel.tsx` (message handler + `case "ai_thinking"`)
- Modify: `extension/src/components/ChatMessage.tsx` (role union + render branch)
- Test: `extension/src/__tests__/sidepanel-streaming.test.tsx` (new)

**Interfaces:**
- Consumes: server messages `ai_streaming`, `ai_thinking`.
- Produces: `Message.role` includes `"thinking"`.

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/sidepanel-streaming.test.tsx` (reuses the chrome-mock pattern from `sidepanel-config-request.test.tsx`):

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import SidePanel from "../sidepanel"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (!(Element.prototype as any).scrollIntoView) (Element.prototype as any).scrollIntoView = () => {}

function installChromeMock() {
  const listeners: ((m: any) => void)[] = []
  const port = {
    name: "stream",
    postMessage: () => {},
    onMessage: { addListener: (fn: any) => listeners.push(fn), removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    disconnect: () => {},
  }
  ;(globalThis as any).chrome = {
    runtime: { connect: () => port },
    storage: { local: { get: (_k: any, cb: any) => cb({}), set: () => {}, remove: () => {} } },
  }
  return { emit: (m: any) => listeners.forEach((fn) => fn(m)) }
}

describe("SidePanel live streaming + thinking", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("concatenates streamed text deltas and shows thinking", async () => {
    const chrome = installChromeMock()
    const root = createRoot(container)
    await act(async () => { root.render(<SidePanel />) })
    await act(async () => {
      chrome.emit({ type: "ai_thinking", chunk: "pondering" })
      chrome.emit({ type: "ai_streaming", chunk: "Hel" })
      chrome.emit({ type: "ai_streaming", chunk: "lo" })
    })
    expect(container.textContent).toContain("pondering")
    expect(container.textContent).toContain("Hello")
    await act(async () => { root.unmount() })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @claude-studio/extension test -- sidepanel-streaming`
Expected: FAIL — "pondering" not in the document (no `ai_thinking` handling).

- [ ] **Step 3: Handle `ai_thinking` in the side panel**

In `extension/src/sidepanel.tsx`, add a case right after the `ai_streaming` case:

```tsx
        case "ai_thinking":
          setIsStreaming(true)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === "thinking") {
              return [...prev.slice(0, -1), { ...last, content: last.content + msg.chunk }]
            }
            return [...prev, { role: "thinking", content: msg.chunk, timestamp: Date.now() }]
          })
          break
```

- [ ] **Step 4: Add the `thinking` role + render branch**

In `extension/src/components/ChatMessage.tsx`, extend the role union:

```ts
  role: "user" | "assistant" | "tool" | "error" | "system" | "command_output" | "thinking"
```

Add a render branch (place before the final assistant/user return):

```tsx
  if (message.role === "thinking") {
    return (
      <div style={{
        padding: "8px 12px", fontSize: 12, color: "#6b6b6b", fontStyle: "italic",
        borderLeft: "2px solid #2a2a2a", marginLeft: 8, whiteSpace: "pre-wrap",
        overflowWrap: "anywhere" as const, lineHeight: 1.5,
      }}>
        <div style={{ color: "#c9a84c", fontStyle: "normal", fontSize: 11, marginBottom: 2 }}>💭 thinking</div>
        {message.content}
      </div>
    )
  }
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @claude-studio/extension test -- sidepanel-streaming`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/src/sidepanel.tsx extension/src/components/ChatMessage.tsx extension/src/__tests__/sidepanel-streaming.test.tsx
git commit -m "feat(extension): render Claude's live thinking"
```

---

## Task 6: Extension — fix the model-selector dropdown (off-screen)

The selector lives in the top header; its menu opens upward (`bottom: calc(100% + 4px)`) and clips off the top of the panel. Open it downward and anchor to the right edge.

**Files:**
- Modify: `extension/src/components/ModelSelector.tsx:26-33`
- Test: `extension/src/__tests__/model-selector.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/model-selector.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import { ModelSelector } from "../components/ModelSelector"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe("ModelSelector", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("opens the menu downward (not off the top of the panel)", async () => {
    const models = [{ id: "a", name: "Model A" }, { id: "b", name: "Model B" }] as any
    const root = createRoot(container)
    await act(async () => {
      root.render(<ModelSelector models={models} current="a" onSelect={() => {}} />)
    })
    const btn = container.querySelector("button")!
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    // The menu is the absolutely-positioned div following the button.
    const menu = container.querySelector("div > div") as HTMLElement
    expect(menu).toBeTruthy()
    expect(menu.style.top).not.toBe("")     // opens downward
    expect(menu.style.bottom).toBe("")      // not anchored to the top
    expect(container.textContent).toContain("Model B")
    await act(async () => { root.unmount() })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @claude-studio/extension test -- model-selector`
Expected: FAIL — `menu.style.top` is `""` and `menu.style.bottom` is set.

- [ ] **Step 3: Flip the menu downward**

In `extension/src/components/ModelSelector.tsx`, change the menu container style:

```tsx
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 160,
            background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 10, overflow: "hidden",
          }}
        >
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @claude-studio/extension test -- model-selector`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/components/ModelSelector.tsx extension/src/__tests__/model-selector.test.tsx
git commit -m "fix(extension): open model-selector dropdown downward so it isn't clipped"
```

---

## Task 7: Extension — GFM tables in MarkdownLite (collapsible + styled)

`/context` (and any tabular Claude output) renders mangled because `MarkdownLite` has no table support. Add GFM table parsing, render as a styled HTML table wrapped in a collapsible header.

**Files:**
- Modify: `extension/src/components/MarkdownLite.tsx`
- Test: `extension/src/__tests__/markdown-tables.test.tsx` (new)

**Interfaces:**
- Produces: a `CollapsibleTable` component (internal); `MarkdownLite` renders `<table>` for GFM tables.

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/markdown-tables.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { createRoot } from "react-dom/client"
import React, { act } from "react"
import { MarkdownLite } from "../components/MarkdownLite"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const TABLE = ["| Component | Tokens |", "| --- | --- |", "| System prompt | 1200 |", "| Messages | 3400 |"].join("\n")

describe("MarkdownLite tables", () => {
  let container: HTMLDivElement
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container) })

  it("renders a GFM table as an HTML table", async () => {
    const root = createRoot(container)
    await act(async () => { root.render(<MarkdownLite text={TABLE} />) })
    expect(container.querySelector("table")).toBeTruthy()
    expect(container.querySelectorAll("tbody tr").length).toBe(2)
    expect(container.textContent).toContain("System prompt")
    await act(async () => { root.unmount() })
  })

  it("collapses the table body when the header is clicked", async () => {
    const root = createRoot(container)
    await act(async () => { root.render(<MarkdownLite text={TABLE} />) })
    expect(container.querySelector("tbody")).toBeTruthy()
    const toggle = container.querySelector("[data-cs-table-toggle]") as HTMLElement
    expect(toggle).toBeTruthy()
    await act(async () => { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    expect(container.querySelector("tbody")).toBeFalsy()
    await act(async () => { root.unmount() })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @claude-studio/extension test -- markdown-tables`
Expected: FAIL — no `<table>` element (rows render as paragraphs).

- [ ] **Step 3: Add table helpers + CollapsibleTable component**

In `extension/src/components/MarkdownLite.tsx`, add `useState` to the React import and insert these above `renderBlocks`:

```tsx
import React, { useState } from "react"
```

```tsx
const tableCellStyle: React.CSSProperties = {
  border: "1px solid #1a1a1a", padding: "5px 9px", textAlign: "left",
  verticalAlign: "top", lineHeight: 1.45,
}
const tableHeadStyle: React.CSSProperties = {
  ...tableCellStyle, color: "#fff", fontWeight: 600, background: "#111",
}

function isDelimiterRow(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
}
function isTableRow(line: string): boolean {
  return line.includes("|") && line.trim().length > 0
}
function parseRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
}

function CollapsibleTable({ header, rows, keyBase }: { header: string[]; rows: string[][]; keyBase: number }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ margin: "8px 0", border: "1px solid #1a1a1a", borderRadius: 6, overflow: "hidden" }}>
      <div
        data-cs-table-toggle=""
        onClick={() => setOpen((o) => !o)}
        style={{
          cursor: "pointer", padding: "6px 10px", background: "#0a0a0a", color: "#c9a84c",
          fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center",
          userSelect: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {header.join("  ·  ")}
        </span>
        <span style={{ marginLeft: 8, flexShrink: 0 }}>{rows.length} rows {open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, color: "#d4d4d4" }}>
            <thead>
              <tr>{header.map((h, j) => <th key={j} style={tableHeadStyle}>{renderInline(h, keyBase * 1000 + j)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={ri % 2 ? { background: "#0c0c0c" } : undefined}>
                  {header.map((_, ci) => <td key={ci} style={tableCellStyle}>{renderInline(r[ci] ?? "", keyBase * 1000 + (ri + 1) * 50 + ci)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Detect tables inside renderBlocks**

In `MarkdownLite.tsx`, convert `renderBlocks`'s `for (const line of lines)` loop to an index loop and add table detection at the top of the loop body. Replace the loop opening:

```tsx
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]

    // GFM table: a row followed by a delimiter row.
    if (isTableRow(line) && li + 1 < lines.length && isDelimiterRow(lines[li + 1])) {
      flushList()
      const header = parseRow(line)
      li += 2
      const rows: string[][] = []
      while (li < lines.length && isTableRow(lines[li]) && !isDelimiterRow(lines[li])) {
        rows.push(parseRow(lines[li]))
        li++
      }
      li-- // for-loop will increment; we consumed up to the last table row
      nodes.push(<CollapsibleTable key={`tbl-${i++}`} header={header} rows={rows} keyBase={i++} />)
      continue
    }

```

Keep the rest of the loop body (HR, headers, lists, paragraphs) unchanged. Ensure the loop still ends with the existing `flushList()` after the loop.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @claude-studio/extension test -- markdown-tables`
Expected: PASS (2 tests).

- [ ] **Step 6: Full extension tests + commit**

Run: `pnpm --filter @claude-studio/extension test`
Expected: all pass.

```bash
git add extension/src/components/MarkdownLite.tsx extension/src/__tests__/markdown-tables.test.tsx
git commit -m "feat(extension): render collapsible GFM tables (fixes /context output)"
```

---

## Task 8: Versioning — dynamic TUI version + bump script + bump to 2.0.1

Make the TUI show the real version, add a script that bumps all package versions in lockstep, then bump to 2.0.1.

**Files:**
- Modify: `agent/src/tui/StatusBar.tsx`
- Modify: `agent/src/tui/App.tsx` (accept + pass `version`)
- Modify: `agent/src/cli.tsx` (pass `version` to `<App>`)
- Create: `scripts/bump-version.sh`

**Interfaces:**
- Consumes: `version` string from `readVersion()` in `cli.tsx`.
- Produces: `App` prop `version: string`; `StatusBar` prop `version: string`.

- [ ] **Step 1: Thread version into StatusBar**

In `agent/src/tui/StatusBar.tsx`:

```tsx
export function StatusBar({ url, count, version }: { url: string; count: number; version: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#c9a84c" paddingX={1}>
      <Text>
        <Text color="#c9a84c" bold>Claude Studio</Text>
        <Text color="gray"> v{version}</Text>
      </Text>
```

(Leave the WebSocket + Connected lines unchanged.)

- [ ] **Step 2: Pass version through App**

In `agent/src/tui/App.tsx`, change the component signature and the StatusBar usage:

```tsx
export function App({ config, connections, url, version }: { config: ConfigStore; connections: ConnectionManager; url: string; version: string }) {
```

and (already added in Task 4 step 2.4):

```tsx
      <StatusBar url={url} count={count} version={version} />
```

- [ ] **Step 3: Pass version from cli.tsx**

In `agent/src/cli.tsx`, update the render call:

```tsx
    const { waitUntilExit } = render(<App config={config} connections={server.connections} url={server.url} version={version} />)
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter claude-studio typecheck`
Expected: tsc exits 0.

- [ ] **Step 5: Create the bump script**

Create `scripts/bump-version.sh`:

```bash
#!/usr/bin/env bash
# Bump the version field of every publishable package in lockstep.
# Usage: scripts/bump-version.sh <X.Y.Z | patch | minor | major>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(protocol agent extension website)

arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "usage: $0 <X.Y.Z|patch|minor|major>" >&2
  exit 1
fi

CURRENT="$(node -e "console.log(require('$ROOT/protocol/package.json').version)")"

if [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$arg"
elif [[ "$arg" =~ ^(patch|minor|major)$ ]]; then
  NEW="$(node -e "const [a,b,c]='$CURRENT'.split('.').map(Number); const k='$arg'; console.log(k==='major'?\`\${a+1}.0.0\`:k==='minor'?\`\${a}.\${b+1}.0\`:\`\${a}.\${b}.\${c+1}\`)")"
else
  echo "invalid version: $arg (expected X.Y.Z or patch|minor|major)" >&2
  exit 1
fi

echo "Bumping $CURRENT -> $NEW"
for p in "${PACKAGES[@]}"; do
  f="$ROOT/$p/package.json"
  # Replace ONLY the first \"version\": \"...\" (the top-level field); dep keys are package names, never literally \"version\".
  perl -0777 -i -pe 's/("version"\s*:\s*")[^"]*(")/${1}'"$NEW"'${2}/' "$f"
  echo "  $p -> $NEW"
done
echo "Done. All packages at $NEW."
```

- [ ] **Step 6: Make it executable**

Run: `chmod +x scripts/bump-version.sh`

- [ ] **Step 7: Bump to 2.0.1**

Run: `scripts/bump-version.sh 2.0.1`
Expected output: `Bumping 2.0.0 -> 2.0.1` and four `-> 2.0.1` lines.

- [ ] **Step 8: Verify all versions + rebuild protocol dist**

Run:
```bash
for f in protocol agent extension website; do node -e "console.log('$f', require('./'+'$f'+'/package.json').version)"; done
pnpm --filter @claude-studio/protocol build
```
Expected: all four print `2.0.1`; protocol build exits 0.

- [ ] **Step 9: Commit**

```bash
git add scripts/bump-version.sh agent/src/tui/StatusBar.tsx agent/src/tui/App.tsx agent/src/cli.tsx protocol/package.json agent/package.json extension/package.json website/package.json protocol/dist
git commit -m "chore: uniform version bump to 2.0.1 + bump-version.sh, dynamic TUI version"
```

---

## Task 9: Full verification

- [ ] **Step 1: Build + typecheck + test everything**

Run:
```bash
pnpm --filter @claude-studio/protocol build
pnpm -r test
pnpm --filter claude-studio typecheck
pnpm --filter claude-studio build
```
Expected: protocol builds; all tests pass; agent typecheck clean; agent build (tsup) succeeds.

- [ ] **Step 2: Extension typecheck**

Run: `cd extension && npx tsc --noEmit && cd ..`
Expected: exits 0.

---

## Self-Review Notes

- **Spec coverage:** observability-extension → Task 5; observability-TUI → Tasks 2+4; live streaming → Tasks 1+3 (+5 renders it); model dropdown → Task 6; bump script → Task 8; `/context` tables → Task 7. All covered.
- **Type consistency:** `onThinking` defined in Task 3 and consumed in Task 3 ws-handler; `ai_thinking` defined Task 1, sent Task 3, handled Task 5; `version` prop added Task 8 but used in Task 4's StatusBar call — **do Task 8 together with / right after Task 4** (noted in Task 4 Step 2). `activityBuffer.append(kind, text)` signature consistent across Tasks 2/3/4.
- **Ordering:** 1 → 2 → 3 → 7-or-4 → 8 (8 finalizes the StatusBar `version` prop introduced in 4) → 9. Tasks 5, 6, 7 (extension) are independent of the agent tasks and of each other.
