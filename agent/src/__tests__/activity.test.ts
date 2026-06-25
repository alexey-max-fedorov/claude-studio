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
