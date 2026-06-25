import { describe, it, expect } from "vitest"
import { buildQueryOptions } from "../query-options.js"
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
})
