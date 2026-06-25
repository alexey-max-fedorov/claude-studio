import { describe, it, expect } from "vitest"
import { effortLevelsForModel, DEFAULT_CONFIG } from "../config.js"

describe("effortLevelsForModel", () => {
  it("gives opus and fable the full ladder (incl. xhigh + ultracode)", () => {
    for (const id of ["opus", "fable", "claude-opus-4-8", "claude-fable-5"]) {
      expect(effortLevelsForModel(id)).toEqual(["low", "medium", "high", "xhigh", "max", "ultracode"])
    }
  })

  it("drops xhigh for sonnet", () => {
    expect(effortLevelsForModel("sonnet")).toEqual(["low", "medium", "high", "max", "ultracode"])
    expect(effortLevelsForModel("claude-sonnet-4-6")).not.toContain("xhigh")
  })

  it("gives haiku no effort control", () => {
    expect(effortLevelsForModel("haiku")).toEqual([])
    expect(effortLevelsForModel("claude-haiku-4-5")).toEqual([])
  })

  it("treats unknown models as the full ladder (safe superset)", () => {
    expect(effortLevelsForModel("some-future-model")).toContain("xhigh")
  })
})

describe("DEFAULT_CONFIG", () => {
  it("defaults effort to high (the SDK default)", () => {
    expect(DEFAULT_CONFIG.effort).toBe("high")
  })
})
