import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG, EFFORT_LEVELS, PERMISSION_MODES } from "../config.js"
import { mergeConfig, validateConfigPatch } from "../validation.js"

describe("v3 config", () => {
  it("defaults to no budget or turn cap and defers model and effort to Claude Code", () => {
    expect(DEFAULT_CONFIG.maxBudgetUsd).toBeNull()
    expect(DEFAULT_CONFIG.maxTurns).toBeNull()
    expect(DEFAULT_CONFIG.model).toBe("")
    expect(DEFAULT_CONFIG.effort).toBe("")
    expect(DEFAULT_CONFIG.permissionMode).toBe("acceptEdits")
    expect(DEFAULT_CONFIG.systemPromptAppend).toBe("")
    expect(DEFAULT_CONFIG.projectDir).toBe("")
  })

  it.each(PERMISSION_MODES)("accepts permission mode %s", (permissionMode) => {
    expect(validateConfigPatch({ permissionMode })).toEqual({ permissionMode })
  })

  it.each(EFFORT_LEVELS)("accepts effort %s", (effort) => {
    expect(validateConfigPatch({ effort })).toEqual({ effort })
  })

  it("keeps only valid client-settable keys", () => {
    const input = JSON.parse('{"projectDir":"/tmp/untrusted","model":"haiku","effort":"high","permissionMode":"plan","systemPromptAppend":"fixture","maxBudgetUsd":1.25,"maxTurns":5,"unknown":true,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}')
    const clean = validateConfigPatch(input)
    expect(clean).toEqual({ model: "haiku", effort: "high", permissionMode: "plan", systemPromptAppend: "fixture", maxBudgetUsd: 1.25, maxTurns: 5 })
    expect(Object.hasOwn(clean, "projectDir")).toBe(false)
    expect(Object.hasOwn(clean, "__proto__")).toBe(false)
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it.each([null, undefined, [], true, 4, "model"])("ignores non-object patch %j", (patch) => {
    expect(validateConfigPatch(patch)).toEqual({})
  })

  it("drops invalid types and enum values without dropping valid siblings", () => {
    expect(validateConfigPatch({ model: 5, effort: "extreme", permissionMode: "root", systemPromptAppend: {}, maxBudgetUsd: "2", maxTurns: true })).toEqual({})
    expect(validateConfigPatch({ model: "sonnet", effort: false, maxTurns: [] })).toEqual({ model: "sonnet" })
  })

  it("bounds the model and system prompt strings", () => {
    expect(validateConfigPatch({ model: "m".repeat(200), systemPromptAppend: "p".repeat(50_000) })).toEqual({ model: "m".repeat(200), systemPromptAppend: "p".repeat(50_000) })
    expect(validateConfigPatch({ model: "m".repeat(201), systemPromptAppend: "p".repeat(50_001) })).toEqual({})
    expect(validateConfigPatch({ model: "", systemPromptAppend: "" })).toEqual({ model: "", systemPromptAppend: "" })
  })

  it.each([null, 0, -1, -100.5])("normalizes disabled caps %j to unlimited", (cap) => {
    expect(validateConfigPatch({ maxBudgetUsd: cap, maxTurns: cap })).toEqual({ maxBudgetUsd: null, maxTurns: null })
  })

  it.each([Number.NaN, Infinity, -Infinity, undefined, "", {}, []])("ignores invalid cap %j", (cap) => {
    expect(validateConfigPatch({ maxBudgetUsd: cap, maxTurns: cap })).toEqual({})
  })

  it("preserves fractional USD, rounds turns, and clamps excessive caps", () => {
    expect(validateConfigPatch({ maxBudgetUsd: 0.01, maxTurns: 2.6 })).toEqual({ maxBudgetUsd: 0.01, maxTurns: 3 })
    expect(validateConfigPatch({ maxBudgetUsd: 20_000, maxTurns: 20_000 })).toEqual({ maxBudgetUsd: 10_000, maxTurns: 10_000 })
    expect(validateConfigPatch({ maxBudgetUsd: 10_000, maxTurns: 10_000 })).toEqual({ maxBudgetUsd: 10_000, maxTurns: 10_000 })
  })

  it("merges immutably and never lets a client change the daemon project", () => {
    const base = { ...DEFAULT_CONFIG, projectDir: "/tmp/project", model: "sonnet", maxTurns: 8 }
    const merged = mergeConfig(base, { projectDir: "/tmp/other", model: "haiku", maxTurns: null })
    expect(merged).toEqual({ ...base, model: "haiku", maxTurns: null })
    expect(base).toEqual({ ...DEFAULT_CONFIG, projectDir: "/tmp/project", model: "sonnet", maxTurns: 8 })
    expect(merged).not.toBe(base)
    expect(mergeConfig(base, { permissionMode: "invalid" as never })).toEqual(base)
  })
})


it("keeps a positive fractional turn cap at least one turn", () => {
  expect(validateConfigPatch({ maxTurns: 0.1 })).toEqual({ maxTurns: 1 })
})
