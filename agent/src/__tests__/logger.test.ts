import { describe, it, expect, beforeEach } from "vitest"
import { log, logBuffer } from "../logger.js"

beforeEach(() => logBuffer.clear())

describe("logger", () => {
  it("pushes entries to the ring buffer", () => {
    log.info("WS", "client connected")
    const entries = logBuffer.entries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ level: "info", tag: "WS", msg: "client connected" })
    expect(typeof entries[0].time).toBe("number")
  })

  it("emits an entry event", () => {
    let got: any = null
    logBuffer.on("entry", (e) => (got = e))
    log.error("SRV", "boom")
    expect(got).toMatchObject({ level: "error", tag: "SRV", msg: "boom" })
  })

  it("caps the buffer at 200 entries", () => {
    for (let i = 0; i < 250; i++) log.dim("X", String(i))
    expect(logBuffer.entries()).toHaveLength(200)
    expect(logBuffer.entries()[199].msg).toBe("249")
  })
})
