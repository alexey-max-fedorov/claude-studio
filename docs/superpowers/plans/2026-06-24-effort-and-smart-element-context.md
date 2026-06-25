# Effort Selection + Smarter Element Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Phase B steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship v2.0.2 (per-model reasoning-effort selection — DONE) and v2.1.0 (remove the prompt-injection guard text + make element context smarter: always include the full URL, detect dev-server vs external pages, locate the source `file:line` of a selected element server-side, and make the `ultracode` tier request a dynamic multi-agent workflow at xHigh effort).

**Architecture:** Config-driven, as always. Effort is a `StudioConfig.effort` field validated in `protocol/`, mapped to the SDK's `effort` option in `agent/query-options.ts`, surfaced by `EffortSelector` next to `ModelSelector`. Element context gains an optional `url` on the `prompt` client message and a server-side `locate-element` module that greps the project for the selected element's distinctive markers. Dev-server vs external is decided server-side.

**Tech Stack:** TypeScript strict, ESM, pnpm workspaces, vitest 3.2.6 (jsdom for extension), `@anthropic-ai/claude-agent-sdk@0.2.141`, Plasmo, Ink.

## Global Constraints
- SDK effort ladder is exactly `low | medium | high | xhigh | max`. `high` is the SDK default. There is no SDK tier above `max`.
- Run tests with `pnpm --filter <pkg> test` or `pnpm -r test` (NOT `npx vitest` — pulls the wrong major; the pnpm layout has no `./node_modules/.bin/vitest`).
- `protocol/dist` is gitignored; after changing protocol types rebuild with `pnpm --filter @claude-studio/protocol build` so agent/extension resolve them.
- Version bumps go through `scripts/bump-version.sh`.
- Work happens directly on `master` (user-consented; this repo develops on master). Commit per task locally; push once at the end. NO git tag, NO npm publish for v2.1.0.
- All command paths are absolute from repo root `/Users/alexey/Projects/claude-studio`; the shell CWD can be sticky, so prefix shell commands with `cd /Users/alexey/Projects/claude-studio;`.

## Key Decisions
- **Effort ladders per model** (already shipped in v2.0.2, do not change):
  - opus, fable → `low, medium, high, xhigh, max, ultracode`
  - sonnet → `low, medium, high, max, ultracode` (no xhigh)
  - haiku → `[]` (no effort control)
  - unknown model → full ladder (safe superset; the agent clamps anyway)
- **`ultracode` semantics (CHANGED for v2.1.0 — supersedes the v2.0.2 max+thinking mapping):** `ultracode` now maps to SDK **`effort: "xhigh"`** (NOT `max`, NOT a forced thinking budget) AND injects a directive asking the agent to **author and run a dynamic multi-agent workflow for that turn** (decompose, fan out subagents, assign the right model per subtask). It also enables the `Task` and `Workflow` tools for that turn so the agent can actually orchestrate. This applies to every turn (chat + element) while `ultracode` is selected, and only when the active model offers the `ultracode` tier (so Haiku never triggers it).
- **Clamping**: `effortToSdk` clamps the configured effort to what the active model's SDK ladder supports (e.g. an `xhigh` config on sonnet → `high`; haiku → no effort sent). `ultracode` resolves to `xhigh` for every model that offers it.
- **Dev-server detection (v2.1.0)**: a page URL is the user's dev server when its host is `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, or ends in `.local`/`.test`, **OR** equals the host the extension dialed over the WebSocket (captured server-side from the connection's `Host` header — i.e. "whatever ip the user entered in the websocket url"). Anything else (e.g. `github.com`) is external → instruct the agent to fetch that page and port the element into the project; enable `WebFetch`.
- **Removing the injection guard (v2.1.0)**: per the user, Claude Studio doesn't need the extra safety guard. Remove the "untrusted data … only the numbered steps are authoritative" framing. Keep the nonce-delimited blocks (harmless structure) but drop the distrust instructions.

---

## v2.0.2 — Effort Selection (COMPLETE — shipped as commit c5f1ee0, signed tag v2.0.2, pushed; NOT npm-published)

Tasks A1–A4 (protocol effort type/ladder/validation; agent `effortToSdk` + clamp; extension `EffortSelector` in header + ConfigPanel; bump 2.0.2 + smoke + tag) are done. The `ultracode` mapping from that release is revised in Task 1 below.

---

## v2.1.0 — Smarter Element Context + ultracode-as-workflow

**Data flow added:** the extension sends the full page `url` alongside the `route`. The server classifies the url as **dev-server** (localhost &c., or the dialed WS host) or **external** (e.g. github.com). For dev-server selections it greps the project to locate the element's source `file:line` and feeds candidates to the agent. For external selections it tells the agent to fetch the page and port the element in, enabling `WebFetch`. Separately, the `ultracode` effort tier augments every turn with a dynamic-workflow directive at xHigh effort.

**Task order (sequential):** 1 → 2 → 3 → 4 → 5 → 6. Each task commits locally on master. Push happens only in Task 6.

### Task 1: ultracode = xHigh effort + dynamic-workflow directive + extraTools plumbing
**Files:**
- Modify: `agent/src/query-options.ts`
- Modify: `agent/src/claude-session.ts`
- Test: `agent/src/__tests__/query-options.test.ts`, `agent/src/__tests__/claude-session.test.ts`

**Interfaces:**
- Produces: `effortToSdk(model, effort)` (ultracode → `{ effort: "xhigh" }`), `buildQueryOptions(config, resumeSessionId, extraTools?: string[])`, `ULTRACODE_DIRECTIVE: string`, `ULTRACODE_TOOLS: string[]`, `isUltracodeActive(config): boolean`, `ultracodeAugment(prompt, config, extraTools): { prompt: string; tools: string[] }` — all from `query-options.ts`. Task 5 relies on `buildQueryOptions`'s 3rd `extraTools` param and on `run()` accepting an `extraTools` argument.

- [ ] **Step 1 — update `query-options.test.ts`.** Replace the import line and the ultracode/clamp tests, and add new tests:
  - Change the import to:
    ```ts
    import { buildQueryOptions, effortToSdk, ultracodeAugment, isUltracodeActive } from "../query-options.js"
    ```
  - REPLACE the test `"maps ultracode to max effort + a forced thinking budget"` with:
    ```ts
    it("maps ultracode to xhigh effort (no thinking budget)", () => {
      const o = effortToSdk("opus", "ultracode")
      expect(o).toEqual({ effort: "xhigh" })
      expect(o.thinking).toBeUndefined()
    })
    ```
  - In the test `"clamps an unsupported tier down to the model's strongest available (xhigh → high on Sonnet)"`, change the last line `expect(effortToSdk("sonnet", "ultracode").effort).toBe("max")` to:
    ```ts
    expect(effortToSdk("sonnet", "ultracode")).toEqual({ effort: "xhigh" })
    ```
  - ADD a buildQueryOptions extraTools test (inside `describe("buildQueryOptions")`):
    ```ts
    it("appends extraTools to allowedTools without duplicates", () => {
      const o = buildQueryOptions({ ...DEFAULT_CONFIG, allowBash: true }, undefined, ["WebFetch", "Bash"])
      expect(o.allowedTools).toContain("WebFetch")
      expect((o.allowedTools as string[]).filter((t) => t === "Bash").length).toBe(1)
    })
    ```
  - ADD a new describe block at the end of the file:
    ```ts
    describe("ultracode augmentation", () => {
      it("isUltracodeActive: true for opus+ultracode, false for haiku+ultracode and opus+high", () => {
        expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" })).toBe(true)
        expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "haiku", effort: "ultracode" })).toBe(false)
        expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "opus", effort: "high" })).toBe(false)
      })

      it("ultracodeAugment appends the workflow directive + Task/Workflow tools when active", () => {
        const r = ultracodeAugment("do it", { ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" }, ["WebFetch"])
        expect(r.prompt).toMatch(/ultracode/i)
        expect(r.prompt).toMatch(/workflow/i)
        expect(r.tools).toEqual(expect.arrayContaining(["WebFetch", "Task", "Workflow"]))
      })

      it("ultracodeAugment is a no-op when not active", () => {
        const r = ultracodeAugment("do it", { ...DEFAULT_CONFIG, model: "opus", effort: "high" }, ["WebFetch"])
        expect(r.prompt).toBe("do it")
        expect(r.tools).toEqual(["WebFetch"])
      })
    })
    ```
- [ ] **Step 2 — add a claude-session test** (in `claude-session.test.ts`, inside `describe("ClaudeSession streaming")`):
  ```ts
  it("appends the ultracode workflow directive and tools to the query when effort is ultracode", async () => {
    queryMock.mockReturnValue(fakeQuery([
      { type: "result", subtype: "success", session_id: "s", result: "", num_turns: 1, total_cost_usd: 0, usage: {} },
    ]))
    const session = new ClaudeSession(() => ({ ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" }))
    const helper = collect()
    session.executeRawPrompt("c", "do it", helper.cb as any)
    await new Promise((r) => setTimeout(r, 20))
    const arg = queryMock.mock.calls[0][0]
    expect(arg.prompt).toMatch(/ultracode/i)
    expect(arg.options.allowedTools).toContain("Workflow")
  })
  ```
- [ ] **Step 3 — run, expect failures:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test`.
- [ ] **Step 4 — edit `query-options.ts`.** Delete the `ULTRACODE_THINKING_BUDGET` constant and its doc comment. Change the `effortToSdk` ultracode branch from the max+thinking return to:
  ```ts
    if (chosen === "ultracode") {
      // "ultracode" is Studio's top tier: xHigh effort PLUS a dynamic-workflow
      // directive (applied in the session layer). The SDK effort itself is xhigh.
      return { effort: "xhigh" }
    }
  ```
  Add the `extraTools` param to `buildQueryOptions`:
  ```ts
  export function buildQueryOptions(
    config: StudioConfig,
    resumeSessionId: string | undefined,
    extraTools: string[] = [],
  ): Record<string, unknown> {
    const allowedTools: string[] = [...BASE_ALLOWED_TOOLS]
    if (config.allowBash) allowedTools.push("Bash")
    for (const t of extraTools) if (!allowedTools.includes(t)) allowedTools.push(t)
    // …rest unchanged…
  ```
  Append the ultracode helpers at the end of the file (after `buildQueryOptions`):
  ```ts
  /**
   * Directive appended to a prompt when the user selects the "ultracode" tier:
   * it asks the agent to author and run a dynamic multi-agent workflow for the turn.
   */
  export const ULTRACODE_DIRECTIVE = `

  ---
  ultracode: For this turn, author and run a dynamic multi-agent workflow. Decompose the task, fan out the independent parts to subagents, verify the results, and synthesize. Assign the right model to each subtask by difficulty — opus for hard reasoning or design, sonnet for standard implementation, haiku for mechanical edits.`

  /** Tools enabled for an ultracode turn so the agent can actually orchestrate. */
  export const ULTRACODE_TOOLS = ["Task", "Workflow"]

  /** True when the active model offers the ultracode tier AND it is selected. */
  export function isUltracodeActive(config: StudioConfig): boolean {
    return config.effort === "ultracode" && effortLevelsForModel(config.model).includes("ultracode")
  }

  /** Augment a prompt + tool list for an ultracode turn (no-op otherwise). */
  export function ultracodeAugment(
    prompt: string,
    config: StudioConfig,
    extraTools: string[],
  ): { prompt: string; tools: string[] } {
    if (!isUltracodeActive(config)) return { prompt, tools: extraTools }
    const tools = [...extraTools]
    for (const t of ULTRACODE_TOOLS) if (!tools.includes(t)) tools.push(t)
    return { prompt: prompt + ULTRACODE_DIRECTIVE, tools }
  }
  ```
  (Note: the `ULTRACODE_DIRECTIVE` template literal's leading indentation in this plan is illustrative — the actual string content is fine either way; tests only assert it contains `ultracode`/`workflow`.)
- [ ] **Step 5 — edit `claude-session.ts`.** Import the augmenter and apply it in `run()`:
  ```ts
  import { buildQueryOptions, ultracodeAugment } from "./query-options.js"
  ```
  Change `run()`'s signature and body head:
  ```ts
  private async run(clientId: string, prompt: string, cb: SessionCallbacks, cfg: StudioConfig, extraTools: string[] = []): Promise<void> {
    const start = Date.now()
    const existing = this.sessions.get(clientId)
    const { prompt: finalPrompt, tools } = ultracodeAugment(prompt, cfg, extraTools)
    const options = buildQueryOptions(cfg, existing, tools)
    try {
      const q = query({ prompt: finalPrompt, options: options as never }) as any
      // …rest unchanged…
  ```
- [ ] **Step 6 — run tests, expect pass:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test`.
- [ ] **Step 7 — commit:** `git add agent/src/query-options.ts agent/src/claude-session.ts agent/src/__tests__/query-options.test.ts agent/src/__tests__/claude-session.test.ts && git commit -m "feat(agent): ultracode = xHigh effort + dynamic-workflow directive"`

### Task 2: protocol — optional `url` on the prompt message
**Files:**
- Modify: `protocol/src/protocol.ts`, `protocol/src/validation.ts`
- Test: `protocol/src/__tests__/validation.test.ts`

**Interfaces:**
- Produces: `ClientMessage` prompt variant gains `url?: string`. `parseClientMessage` length-guards `url` (≤ `MAX_ROUTE_LEN` = 1000). Tasks 3 & 5 read `msg.url`.

- [ ] **Step 1 — add tests** to `validation.test.ts`, inside `describe("parseClientMessage")`:
  ```ts
  it("accepts a prompt with a full url", () => {
    const element = {
      tagName: "div", id: "x", classList: ["a"], cssSelector: ".a", textContent: "t",
      outerHTML: "<div/>", attributes: { role: "button" }, parentChain: ["body"],
      computedStyles: { color: "#000", backgroundColor: "#fff", fontSize: "16px" },
    }
    const msg = parseClientMessage(JSON.stringify({ type: "prompt", route: "/", url: "http://localhost:3000/", element, prompt: "go" }))
    expect(msg.type).toBe("prompt")
    expect((msg as any).url).toBe("http://localhost:3000/")
  })

  it("rejects an over-long url", () => {
    const element = {
      tagName: "div", id: "x", classList: ["a"], cssSelector: ".a", textContent: "t",
      outerHTML: "<div/>", attributes: { role: "button" }, parentChain: ["body"],
      computedStyles: { color: "#000", backgroundColor: "#fff", fontSize: "16px" },
    }
    const big = "http://x/" + "a".repeat(1100)
    expect(() => parseClientMessage(JSON.stringify({ type: "prompt", route: "/", url: big, element, prompt: "go" }))).toThrow(/url/)
  })
  ```
- [ ] **Step 2 — run, expect the over-long-url test to FAIL** (url not yet validated): `cd /Users/alexey/Projects/claude-studio; pnpm --filter @claude-studio/protocol test`.
- [ ] **Step 3 — edit `protocol.ts`:** change the prompt client message variant to:
  ```ts
    | { type: "prompt"; route: string; url?: string; element: ElementSelection; prompt: string }
  ```
- [ ] **Step 4 — edit `validation.ts`** `parseClientMessage` `case "prompt"`, right after the `assertStr(msg.route, "route", MAX_ROUTE_LEN)` line, add:
  ```ts
      if (msg.url !== undefined) assertStr(msg.url, "url", MAX_ROUTE_LEN)
  ```
- [ ] **Step 5 — rebuild + test:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter @claude-studio/protocol build && pnpm --filter @claude-studio/protocol test`. Expect pass.
- [ ] **Step 6 — commit:** `git add protocol/src/protocol.ts protocol/src/validation.ts protocol/src/__tests__/validation.test.ts && git commit -m "feat(protocol): optional url on the prompt message"`

### Task 3: extension — send the full page URL
**Files:**
- Modify: `extension/src/contents/prompt-widget.tsx`
- Modify: `extension/src/background/messages/submit-prompt.ts`
- Modify: `extension/src/background/index.ts` (the port `case "prompt"`)

**Interfaces:**
- Consumes: the protocol prompt message's optional `url` (Task 2). Produces nothing for later tasks.

- [ ] **Step 1 — edit `prompt-widget.tsx`** `handleSubmit`: in the `sendToBackground({ name: "submit-prompt", body: {...} })` body, add `url: window.location.href,` next to `route: window.location.pathname,`:
  ```ts
        body: {
          route: window.location.pathname,
          url: window.location.href,
          element: widget.selection,
          prompt: prompt.trim(),
        },
  ```
- [ ] **Step 2 — edit `submit-prompt.ts`:** destructure `url` and forward it:
  ```ts
  const { route, url, element, prompt } = req.body

  wsClient.send({
    type: "prompt",
    route,
    url,
    element,
    prompt,
  })
  ```
- [ ] **Step 3 — edit `background/index.ts`** the port `case "prompt"` line to forward `url`:
  ```ts
        case "prompt":
          wsClient.send({ type: "prompt", route: msg.route, url: msg.url, element: msg.element, prompt: msg.prompt })
          break
  ```
- [ ] **Step 4 — typecheck:** `cd /Users/alexey/Projects/claude-studio/extension && npx tsc --noEmit`. Expect clean. (No unit test for this thin pass-through; tsc is the gate. The extension's `pnpm --filter @claude-studio/extension test` suite must still pass — run it too.)
- [ ] **Step 5 — extension tests:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter @claude-studio/extension test`. Expect pass (unchanged 15).
- [ ] **Step 6 — commit:** `git add extension/src/contents/prompt-widget.tsx extension/src/background/messages/submit-prompt.ts extension/src/background/index.ts && git commit -m "feat(extension): send full page url with element prompts"`

### Task 4: agent — locate element source `file:line` (pure-Node, dependency-free)
**Files:**
- Create: `agent/src/locate-element.ts`
- Test: `agent/src/__tests__/locate-element.test.ts`

Pure-Node so the published agent works on any machine (no `rg` assumption).

**Interfaces:**
- Produces: `interface SourceLocation { file: string; line: number; snippet: string }` and `locateElement(projectDir: string, el: ElementSelection): SourceLocation[]`. Task 5's `prompt-builder` and `claude-session` import both.

- [ ] **Step 1 — write the test** `agent/src/__tests__/locate-element.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest"
  import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
  import { tmpdir } from "node:os"
  import { join } from "node:path"
  import { locateElement } from "../locate-element.js"
  import type { ElementSelection } from "@claude-studio/protocol"

  const el = (over: Partial<ElementSelection>): ElementSelection => ({
    tagName: "button", id: "", classList: [], cssSelector: "", textContent: "",
    outerHTML: "", attributes: {}, boundingRect: { top: 0, left: 0, width: 0, height: 0 },
    computedStyles: { color: "", backgroundColor: "", fontSize: "", fontFamily: "", padding: "", margin: "" },
    parentChain: [], siblingCount: 0, childCount: 0, ...over,
  })

  describe("locateElement", () => {
    let dir: string
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "loc-")) })
    afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

    it("finds a file:line by distinctive text content", () => {
      writeFileSync(join(dir, "Page.tsx"), 'export const X = () => <button>Subscribe now</button>\n')
      const hits = locateElement(dir, el({ textContent: "Subscribe now" }))
      expect(hits[0]?.file).toMatch(/Page\.tsx$/)
      expect(hits[0]?.line).toBe(1)
    })

    it("finds by data-testid attribute", () => {
      writeFileSync(join(dir, "Nav.tsx"), 'line1\n<a data-testid="cta-buy">Go</a>\n')
      const hits = locateElement(dir, el({ attributes: { "data-testid": "cta-buy" } }))
      expect(hits[0]?.line).toBe(2)
    })

    it("ignores node_modules and returns [] when nothing matches", () => {
      mkdirSync(join(dir, "node_modules"))
      writeFileSync(join(dir, "node_modules", "x.js"), "Subscribe now\n")
      expect(locateElement(dir, el({ textContent: "Subscribe now" }))).toEqual([])
    })
  })
  ```
- [ ] **Step 2 — run, expect FAIL (module missing):** `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test`.
- [ ] **Step 3 — implement `agent/src/locate-element.ts`:**
  ```ts
  import { readdirSync, readFileSync, statSync } from "node:fs"
  import { join, relative } from "node:path"
  import type { ElementSelection } from "@claude-studio/protocol"

  export interface SourceLocation { file: string; line: number; snippet: string }

  const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "out", "coverage", ".cache"])
  const EXT = new Set([".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte", ".astro", ".html", ".htm", ".mdx", ".php", ".erb", ".hbs"])
  const MAX_FILES = 4000
  const MAX_FILE_BYTES = 512 * 1024
  const MAX_HITS = 5

  /** Distinctive, low-noise signals to search for, strongest first. */
  function signals(el: ElementSelection): string[] {
    const out: string[] = []
    for (const [k, v] of Object.entries(el.attributes)) {
      if (/^(data-|aria-label|name|href|alt|placeholder|title)/.test(k) && v && v.length >= 3) out.push(v)
    }
    if (el.id && el.id.length >= 3 && !/^[0-9]/.test(el.id)) out.push(el.id)
    const text = el.textContent.trim()
    if (text.length >= 4) out.push(text.length > 60 ? text.slice(0, 60) : text)
    for (const c of el.classList) {
      // skip utility/atomic classes (tailwind-ish) — too noisy to locate by
      if (c.length >= 6 && !/^(p|m|w|h|text|bg|flex|grid|gap|rounded|border|items|justify|space|font|leading|tracking)[-:]/.test(c)) out.push(c)
    }
    // de-dup, keep order, cap
    return [...new Set(out)].slice(0, 6)
  }

  function walk(root: string, dir: string, files: string[]): void {
    if (files.length >= MAX_FILES) return
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (files.length >= MAX_FILES) return
      if (IGNORE_DIRS.has(name) || name.startsWith(".")) continue
      const full = join(dir, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) walk(root, full, files)
      else if (EXT.has(name.slice(name.lastIndexOf(".")).toLowerCase()) && st.size <= MAX_FILE_BYTES) files.push(full)
    }
  }

  /** Best-effort grep of the project for where the selected element is defined. */
  export function locateElement(projectDir: string, el: ElementSelection): SourceLocation[] {
    if (!projectDir) return []
    const needles = signals(el)
    if (needles.length === 0) return []
    const files: string[] = []
    walk(projectDir, projectDir, files)
    const hits: SourceLocation[] = []
    const seen = new Set<string>()
    for (const needle of needles) {            // strongest signal first
      for (const file of files) {
        let content: string
        try { content = readFileSync(file, "utf-8") } catch { continue }
        const idx = content.indexOf(needle)
        if (idx === -1) continue
        const line = content.slice(0, idx).split("\n").length
        const key = `${file}:${line}`
        if (seen.has(key)) continue
        seen.add(key)
        const snippet = content.split("\n")[line - 1]?.trim().slice(0, 120) ?? ""
        hits.push({ file: relative(projectDir, file), line, snippet })
        if (hits.length >= MAX_HITS) return hits
      }
      if (hits.length >= MAX_HITS) break
    }
    return hits
  }
  ```
- [ ] **Step 4 — run tests, expect PASS:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test`.
- [ ] **Step 5 — commit:** `git add agent/src/locate-element.ts agent/src/__tests__/locate-element.test.ts && git commit -m "feat(agent): locate element source file:line (pure-Node)"`

### Task 5: agent — smarter prompt + dev-server detection (incl. WS host) + WebFetch + guard removal
**Files:**
- Modify: `agent/src/prompt-builder.ts` (rewrite — new signature, dev/external split, located list, guard removal)
- Modify: `agent/src/claude-session.ts` (`executePrompt` threads `url` + `devHost`, computes `external`, locates, passes `extraTools`)
- Modify: `agent/src/ws-handler.ts` (`handleConnection` gains `req`, captures dialed host, passes `url` + `devHost`)
- Modify: `agent/src/server.ts` (pass `req` into `handleConnection`)
- Test: `agent/src/__tests__/prompt-builder.test.ts` (rewrite — drop guard tests, add dev-server + external + located + guard-absent tests)

**Interfaces:**
- Consumes: `SourceLocation`/`locateElement` (Task 4), `msg.url` (Task 2), `run(..., extraTools)` (Task 1).
- Produces: `isDevServer(url: string, devHost?: string): boolean`, `PromptInput { route, url, element, locations, prompt, routeHints, external }`, `buildPrompt(input): string`.

- [ ] **Step 1 — rewrite `agent/src/__tests__/prompt-builder.test.ts`** to the following (this replaces the whole file — drops the two guard tests, updates all call sites to the new signature, adds dev-server/external/located/guard-absent coverage):
  ```ts
  import { describe, it, expect } from "vitest"
  import { buildPrompt, isDevServer } from "../prompt-builder.js"
  import type { ElementSelection } from "@claude-studio/protocol"

  const element: ElementSelection = {
    tagName: "button", id: "cta", classList: ["btn", "primary"], cssSelector: "button.btn.primary",
    textContent: "Buy now", outerHTML: "<button class=\"btn primary\">Buy now</button>",
    attributes: { type: "submit" }, boundingRect: { top: 0, left: 0, width: 100, height: 40 },
    computedStyles: { color: "#fff", backgroundColor: "#c9a84c", fontSize: "16px", fontFamily: "Inter", padding: "8px", margin: "0" },
    parentChain: ["body", "main", "form"], siblingCount: 2, childCount: 0,
  }

  const base = { route: "/checkout", url: "http://localhost:3000/checkout", element, locations: [], prompt: "make it rounded", routeHints: true, external: false }

  describe("buildPrompt", () => {
    it("includes the user instruction and element context", () => {
      const p = buildPrompt(base)
      expect(p).toContain("make it rounded")
      expect(p).toContain("button.btn.primary")
      expect(p).toContain("Buy now")
    })

    it("uses unique per-message nonce delimiters that wrap element/user content", () => {
      const p = buildPrompt({ ...base, route: "/", prompt: "x" })
      const m = p.match(/<user-instruction-([0-9a-f]{16})>/)
      expect(m).toBeTruthy()
      const nonce = m![1]
      expect(p).toContain(`</user-instruction-${nonce}>`)
      expect(p).toContain(`<element-context-${nonce}>`)
    })

    it("produces a different nonce each call", () => {
      const a = buildPrompt({ ...base, prompt: "x" })
      const b = buildPrompt({ ...base, prompt: "x" })
      const na = a.match(/<user-instruction-([0-9a-f]{16})>/)![1]
      const nb = b.match(/<user-instruction-([0-9a-f]{16})>/)![1]
      expect(na).not.toBe(nb)
    })

    it("omits framework route hints when routeHints is false", () => {
      const off = buildPrompt({ ...base, prompt: "x", routeHints: false })
      const on = buildPrompt({ ...base, prompt: "x", routeHints: true })
      expect(on).toMatch(/route .*maps to/i)
      expect(off).not.toMatch(/route .*maps to/i)
    })

    it("does not lecture the model about untrusted data / authoritative steps", () => {
      const p = buildPrompt(base)
      expect(p).not.toMatch(/untrusted data/i)
      expect(p).not.toMatch(/only the numbered .* authoritative/i)
    })

    it("for an external page, tells the agent to WebFetch the url and port the element in", () => {
      const p = buildPrompt({ ...base, url: "https://github.com/acme/repo", external: true })
      expect(p).toMatch(/WebFetch/)
      expect(p).toContain("https://github.com/acme/repo")
      expect(p).toMatch(/external page/i)
    })

    it("lists located source file:line candidates when provided", () => {
      const p = buildPrompt({ ...base, locations: [{ file: "src/Page.tsx", line: 42, snippet: "<button>Buy now</button>" }] })
      expect(p).toContain("src/Page.tsx:42")
    })
  })

  describe("isDevServer", () => {
    it("treats well-known local hosts as dev server", () => {
      expect(isDevServer("http://localhost:3000/")).toBe(true)
      expect(isDevServer("http://127.0.0.1:5173/")).toBe(true)
      expect(isDevServer("http://myapp.local/")).toBe(true)
    })

    it("treats public hosts as external", () => {
      expect(isDevServer("https://github.com")).toBe(false)
      expect(isDevServer("https://example.com/x")).toBe(false)
    })

    it("treats the dialed WS host as dev server", () => {
      expect(isDevServer("http://192.168.1.50:3000/", "192.168.1.50")).toBe(true)
      expect(isDevServer("http://192.168.1.50:3000/")).toBe(false)
    })

    it("returns false for garbage urls", () => {
      expect(isDevServer("not a url")).toBe(false)
      expect(isDevServer("")).toBe(false)
    })
  })
  ```
- [ ] **Step 2 — run, expect failures** (new signature + missing `isDevServer`): `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test`.
- [ ] **Step 3 — rewrite `agent/src/prompt-builder.ts`:**
  ```ts
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
  ```
  **IMPORTANT:** the leading two-space indentation shown on the returned template-literal lines above is an artifact of this plan's code fence. In the real file, the returned string lines must start at column 0 (no leading indentation), exactly like the original `prompt-builder.ts` returned its template. Do not indent the prompt body.
- [ ] **Step 4 — edit `claude-session.ts`** `executePrompt`:
  ```ts
  import { buildPrompt, isDevServer } from "./prompt-builder.js"
  import { locateElement } from "./locate-element.js"
  ```
  Replace `executePrompt`:
  ```ts
  executePrompt(clientId: string, input: { route: string; url: string; element: ElementSelection; prompt: string; devHost?: string }, cb: SessionCallbacks): void {
    const cfg = this.getConfig()
    const external = input.url ? !isDevServer(input.url, input.devHost) : false
    const locations = external ? [] : locateElement(cfg.projectDir, input.element)
    const prompt = buildPrompt({
      route: input.route, url: input.url, element: input.element,
      locations, prompt: input.prompt, routeHints: cfg.routeHints, external,
    })
    void this.run(clientId, prompt, cb, cfg, external ? ["WebFetch"] : [])
  }
  ```
- [ ] **Step 5 — edit `ws-handler.ts`:** add the http type import, change `handleConnection` to take `req`, capture the dialed host, and pass `url` + `devHost`:
  ```ts
  import type { IncomingMessage } from "node:http"
  ```
  ```ts
  export function handleConnection(ws: WebSocket, req: IncomingMessage, deps: HandlerDeps): void {
    const { connections, claude, config, serverVersion } = deps
    const clientId = connections.add(ws)
    const devHost = hostFromHeader(req.headers.host)
    // …existing body unchanged until the prompt case…
  ```
  Change the `case "prompt"`:
  ```ts
        case "prompt":
          claude.executePrompt(clientId, { route: msg.route, url: msg.url ?? "", element: msg.element, prompt: msg.prompt, devHost }, callbacks())
          break
  ```
  Add a helper at the bottom of the file (module scope):
  ```ts
  /** The hostname the client dialed (from the WS upgrade Host header), lowercased, port stripped. */
  function hostFromHeader(h: string | undefined): string | undefined {
    if (!h) return undefined
    try { return new URL("http://" + h).hostname.toLowerCase() } catch { return undefined }
  }
  ```
- [ ] **Step 6 — edit `server.ts`** the connection wiring to forward `req`:
  ```ts
    wss.on("connection", (ws, req) => handleConnection(ws, req, { connections, claude, config, serverVersion }))
  ```
- [ ] **Step 7 — run tests + typecheck:** `cd /Users/alexey/Projects/claude-studio; pnpm --filter claude-studio test && pnpm --filter claude-studio typecheck`. Expect all pass. (If there is no `typecheck` script, run `cd /Users/alexey/Projects/claude-studio && npx tsc -p agent --noEmit` from repo root.)
- [ ] **Step 8 — commit:** `git add agent/src/prompt-builder.ts agent/src/claude-session.ts agent/src/ws-handler.ts agent/src/server.ts agent/src/__tests__/prompt-builder.test.ts && git commit -m "feat(agent): smarter element context — full url, dev/external split, file:line, WebFetch; drop injection-guard text"`

### Task 6: build, smoke, version, ship (controller-run after the final whole-branch review)
- [ ] **Step 1 — bump:** `cd /Users/alexey/Projects/claude-studio; ./scripts/bump-version.sh 2.1.0`; verify all 4 packages report 2.1.0.
- [ ] **Step 2 — build:** `pnpm --filter @claude-studio/protocol build && pnpm --filter claude-studio build`.
- [ ] **Step 3 — full test + extension typecheck:** `pnpm -r test`; `cd /Users/alexey/Projects/claude-studio/extension && npx tsc --noEmit`. All green.
- [ ] **Step 4 — smoke:** boot the packaged agent headless and drive the WS protocol; assert `--version` reports `2.1.0`, and that a `prompt` carrying an external `url` (e.g. `https://github.com`) plus a full valid element is accepted end-to-end (server doesn't reject, no crash). Locate logic + dev/external classification are unit-tested in Tasks 4 & 5.
- [ ] **Step 5 — commit + push master. NO tag, NO npm publish** (per user). Then hand back for testing.

## Confirmed decisions (from the user, 2026-06-25)
- **`ultracode`**: xHigh effort + dynamic-workflow directive (Task 1). Not max, not a thinking budget.
- **Dev-server detection**: host heuristic PLUS the dialed WS host (Task 5).
