import { describe, it, expect, vi, beforeEach } from "vitest"
import { log } from "../logger.js"

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  it("log.info outputs prefix and message", () => {
    log.info("WS", "Client connected")
    expect(console.log).toHaveBeenCalledOnce()
    const output = (console.log as any).mock.calls[0][0]
    expect(output).toContain("[WS]")
    expect(output).toContain("Client connected")
  })

  it("log.error outputs to stderr with prefix and message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    log.error("AI", "Something failed")
    expect(console.error).toHaveBeenCalledOnce()
    const output = (console.error as any).mock.calls[0][0]
    expect(output).toContain("[AI]")
    expect(output).toContain("Something failed")
  })

  it("log.success outputs with green styling", () => {
    log.success("AI", "Complete")
    const output = (console.log as any).mock.calls[0][0]
    expect(output).toContain("[AI]")
    expect(output).toContain("Complete")
  })

  it("log.event outputs with yellow styling", () => {
    log.event("AI", "Tool use")
    const output = (console.log as any).mock.calls[0][0]
    expect(output).toContain("[AI]")
    expect(output).toContain("Tool use")
  })

  it("log.dim outputs with gray styling", () => {
    log.dim("AI", "minor detail")
    const output = (console.log as any).mock.calls[0][0]
    expect(output).toContain("[AI]")
    expect(output).toContain("minor detail")
  })
})
