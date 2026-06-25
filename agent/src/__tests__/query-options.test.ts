import { describe, it, expect } from "vitest"
import { buildQueryOptions, effortToSdk, ultracodeAugment, isUltracodeActive } from "../query-options.js"
import { DEFAULT_CONFIG } from "@claude-studio/protocol"

describe("buildQueryOptions", () => {
  it("always sets the model from config (new session)", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, model: "opus", projectDir: "/proj" }, undefined)
    expect(o.model).toBe("opus")
    expect(o.cwd).toBe("/proj")
    expect(o.resume).toBeUndefined()
  })

  it("STILL sets the model from config when resuming (reliable switching)", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, model: "fable" }, "sess-123")
    expect(o.model).toBe("fable")
    expect(o.resume).toBe("sess-123")
  })

  it("adds Bash only when allowBash is true", () => {
    const off = buildQueryOptions({ ...DEFAULT_CONFIG, allowBash: false }, undefined)
    const on = buildQueryOptions({ ...DEFAULT_CONFIG, allowBash: true }, undefined)
    expect(off.allowedTools).not.toContain("Bash")
    expect(on.allowedTools).toContain("Bash")
    expect(on.allowedTools).toContain("Edit")
  })

  it("passes permissionMode, maxTurns, and budget", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, permissionMode: "plan", maxTurns: 7, maxBudgetUsd: 3 }, undefined)
    expect(o.permissionMode).toBe("plan")
    expect(o.maxTurns).toBe(7)
    expect(o.maxBudgetUsd).toBe(3)
  })

  it("appends the system prompt only when non-empty", () => {
    const none = buildQueryOptions(DEFAULT_CONFIG, undefined)
    const some = buildQueryOptions({ ...DEFAULT_CONFIG, systemPromptAppend: "Be terse." }, undefined)
    expect(none.systemPrompt).toBeUndefined()
    expect(some.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: "Be terse." })
  })

  it("passes enabled skills and sets settingSources", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, enabledSkills: ["visual-edit"] }, undefined)
    expect(o.skills).toEqual(["visual-edit"])
    expect(o.settingSources).toEqual(["user", "project", "local"])
  })

  it("sets allowDangerouslySkipPermissions only for bypassPermissions mode", () => {
    const bypass = buildQueryOptions({ ...DEFAULT_CONFIG, permissionMode: "bypassPermissions" }, undefined)
    const normal = buildQueryOptions({ ...DEFAULT_CONFIG, permissionMode: "acceptEdits" }, undefined)
    expect(bypass.allowDangerouslySkipPermissions).toBe(true)
    expect(normal.allowDangerouslySkipPermissions).toBeUndefined()
  })

  it("enables partial message streaming", () => {
    const o = buildQueryOptions(DEFAULT_CONFIG, undefined)
    expect(o.includePartialMessages).toBe(true)
  })

  it("appends extraTools to allowedTools without duplicates", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, allowBash: true }, undefined, ["WebFetch", "Bash"])
    expect(o.allowedTools).toContain("WebFetch")
    expect((o.allowedTools as string[]).filter((t) => t === "Bash").length).toBe(1)
  })

  it("passes the clamped effort through to SDK options", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, model: "opus", effort: "xhigh" }, undefined)
    expect(o.effort).toBe("xhigh")
  })

  it("omits effort entirely for Haiku", () => {
    const o = buildQueryOptions({ ...DEFAULT_CONFIG, model: "haiku", effort: "high" }, undefined)
    expect(o.effort).toBeUndefined()
    expect(o.thinking).toBeUndefined()
  })
})

describe("effortToSdk", () => {
  it("passes the standard ladder straight through for opus", () => {
    expect(effortToSdk("opus", "low")).toEqual({ effort: "low" })
    expect(effortToSdk("opus", "xhigh")).toEqual({ effort: "xhigh" })
    expect(effortToSdk("opus", "max")).toEqual({ effort: "max" })
  })

  it("maps ultracode to xhigh effort (no thinking budget)", () => {
    const o = effortToSdk("opus", "ultracode")
    expect(o).toEqual({ effort: "xhigh" })
    expect(o.thinking).toBeUndefined()
  })

  it("clamps an unsupported tier down to the model's strongest available (xhigh → high on Sonnet)", () => {
    expect(effortToSdk("sonnet", "xhigh")).toEqual({ effort: "high" })
    // sonnet still supports max + ultracode
    expect(effortToSdk("sonnet", "max")).toEqual({ effort: "max" })
    expect(effortToSdk("sonnet", "ultracode")).toEqual({ effort: "xhigh" })
  })

  it("returns nothing for a model with no effort ladder (Haiku)", () => {
    expect(effortToSdk("haiku", "max")).toEqual({})
  })
})

describe("ultracode augmentation", () => {
  it("isUltracodeActive: true for opus+ultracode, false for haiku+ultracode and opus+high", () => {
    expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" })).toBe(true)
    expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "haiku", effort: "ultracode" })).toBe(false)
    expect(isUltracodeActive({ ...DEFAULT_CONFIG, model: "opus", effort: "high" })).toBe(false)
  })

  it("ultracodeAugment appends the workflow directive + Task tool when active", () => {
    const r = ultracodeAugment("do it", { ...DEFAULT_CONFIG, model: "opus", effort: "ultracode" }, ["WebFetch"])
    expect(r.prompt).toMatch(/ultracode/i)
    expect(r.prompt).toMatch(/workflow/i)
    expect(r.tools).toEqual(expect.arrayContaining(["WebFetch", "Task"]))
  })

  it("ultracodeAugment is a no-op when not active", () => {
    const r = ultracodeAugment("do it", { ...DEFAULT_CONFIG, model: "opus", effort: "high" }, ["WebFetch"])
    expect(r.prompt).toBe("do it")
    expect(r.tools).toEqual(["WebFetch"])
  })
})
