import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigStore } from "../config-store.js"

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cs-cfg-")) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe("ConfigStore", () => {
  it("seeds defaults with projectDir filled in when no file exists", () => {
    const store = new ConfigStore(dir)
    expect(store.get().projectDir).toBe(dir)
    expect(store.get().model).toBe("sonnet")
  })

  it("loads an existing config file and overlays defaults for missing keys", () => {
    writeFileSync(join(dir, "claude-studio.config.json"), JSON.stringify({ model: "opus" }))
    const store = new ConfigStore(dir)
    expect(store.get().model).toBe("opus")
    expect(store.get().maxTurns).toBe(20) // default
  })

  it("update validates, merges, persists, and emits change", () => {
    const store = new ConfigStore(dir)
    let emitted: any = null
    store.on("change", (c) => (emitted = c))
    const next = store.update({ model: "opus", bogus: 1, maxTurns: 0 } as any)
    expect(next.model).toBe("opus")
    expect(next.maxTurns).toBe(1) // clamped
    expect((next as any).bogus).toBeUndefined()
    expect(emitted).toEqual(next)
    const onDisk = JSON.parse(readFileSync(join(dir, "claude-studio.config.json"), "utf-8"))
    expect(onDisk.model).toBe("opus")
  })

  it("tolerates a corrupt config file by falling back to defaults", () => {
    writeFileSync(join(dir, "claude-studio.config.json"), "{ not json")
    const store = new ConfigStore(dir)
    expect(store.get().model).toBe("sonnet")
  })
})
