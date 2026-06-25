import { describe, it, expect } from "vitest"
import { parseClientMessage, validateConfigPatch, mergeConfig, serializeServerMessage } from "../validation.js"
import { DEFAULT_CONFIG } from "../config.js"

describe("parseClientMessage", () => {
  it("accepts a valid raw_prompt", () => {
    const msg = parseClientMessage(JSON.stringify({ type: "raw_prompt", prompt: "hi" }))
    expect(msg).toEqual({ type: "raw_prompt", prompt: "hi" })
  })

  it("accepts bare control messages", () => {
    for (const type of ["ping", "reset_session", "interrupt", "get_config", "query_capabilities"]) {
      expect(parseClientMessage(JSON.stringify({ type })).type).toBe(type)
    }
  })

  it("accepts set_config with a partial patch", () => {
    const msg = parseClientMessage(JSON.stringify({ type: "set_config", patch: { model: "opus", maxTurns: 5 } }))
    expect(msg).toEqual({ type: "set_config", patch: { model: "opus", maxTurns: 5 } })
  })

  it("rejects set_config with a non-object patch", () => {
    expect(() => parseClientMessage(JSON.stringify({ type: "set_config", patch: 7 }))).toThrow(/patch/)
  })

  it("rejects an unknown type", () => {
    expect(() => parseClientMessage(JSON.stringify({ type: "nope" }))).toThrow(/unknown type/)
  })

  it("rejects a prompt exceeding the max length", () => {
    const big = "x".repeat(50_001)
    expect(() => parseClientMessage(JSON.stringify({ type: "raw_prompt", prompt: big }))).toThrow(/max length/)
  })

  it("validates a full element prompt", () => {
    const element = {
      tagName: "div", id: "x", classList: ["a"], cssSelector: ".a", textContent: "t",
      outerHTML: "<div/>", attributes: { role: "button" }, parentChain: ["body"],
      computedStyles: { color: "#000", backgroundColor: "#fff", fontSize: "16px" },
    }
    const msg = parseClientMessage(JSON.stringify({ type: "prompt", route: "/", element, prompt: "go" }))
    expect(msg.type).toBe("prompt")
  })
})

describe("validateConfigPatch", () => {
  it("keeps only known keys with correct types", () => {
    const patch = validateConfigPatch({ model: "opus", maxTurns: 9, bogus: 1, allowBash: true })
    expect(patch).toEqual({ model: "opus", maxTurns: 9, allowBash: true })
  })

  it("coerces numeric strings and clamps to safe ranges", () => {
    const patch = validateConfigPatch({ maxTurns: 0, maxBudgetUsd: -5 })
    expect(patch.maxTurns).toBe(1)        // clamped to >= 1
    expect(patch.maxBudgetUsd).toBe(0)    // clamped to >= 0
  })

  it("rejects an invalid permissionMode", () => {
    const patch = validateConfigPatch({ permissionMode: "yolo" })
    expect(patch.permissionMode).toBeUndefined()
  })

  it("accepts string arrays for enabledPlugins/enabledSkills", () => {
    const patch = validateConfigPatch({ enabledPlugins: ["a", "b"], enabledSkills: ["x"] })
    expect(patch).toEqual({ enabledPlugins: ["a", "b"], enabledSkills: ["x"] })
  })

  it("clamps to the upper bounds", () => {
    const patch = validateConfigPatch({ maxTurns: 999, maxBudgetUsd: 9999 })
    expect(patch.maxTurns).toBe(100)
    expect(patch.maxBudgetUsd).toBe(1000)
  })

  it("returns an empty patch for an array input", () => {
    expect(validateConfigPatch(["model"] as unknown)).toEqual({})
  })

  it("accepts a known effort tier and rejects an unknown one", () => {
    expect(validateConfigPatch({ effort: "ultracode" }).effort).toBe("ultracode")
    expect(validateConfigPatch({ effort: "xhigh" }).effort).toBe("xhigh")
    expect(validateConfigPatch({ effort: "turbo" }).effort).toBeUndefined()
    expect(validateConfigPatch({ effort: 5 }).effort).toBeUndefined()
  })
})

describe("mergeConfig", () => {
  it("overlays a validated patch on the base", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { model: "opus" })
    expect(merged.model).toBe("opus")
    expect(merged.maxTurns).toBe(DEFAULT_CONFIG.maxTurns)
  })
})

describe("serializeServerMessage", () => {
  it("round-trips through JSON", () => {
    const raw = serializeServerMessage({ type: "pong" })
    expect(JSON.parse(raw)).toEqual({ type: "pong" })
  })
})
