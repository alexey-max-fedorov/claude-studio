import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "../args.js"
import { AsyncQueue } from "../async-queue.js"
import { ConfigStore } from "../config-store.js"
import { setQuiet } from "../logger.js"
import { DEFAULT_EXTENSION_ORIGIN, isAllowedHost, isAllowedOrigin } from "../security.js"
import { parseLocalCommandOutputs, transcriptPath } from "../transcript-file.js"
import { parseClientMessage } from "@claude-studio/protocol"

setQuiet(true)

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cs-test-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("security", () => {
  it("accepts only loopback Host headers (plus explicit extras)", () => {
    for (const h of ["127.0.0.1:7281", "localhost:7281", "LOCALHOST", "[::1]:7281"]) expect(isAllowedHost(h)).toBe(true)
    for (const h of ["evil.example", "evil.example:7281", "127.0.0.1.evil.example", undefined, ""]) expect(isAllowedHost(h)).toBe(false)
    expect(isAllowedHost("10.0.0.5:7281", ["10.0.0.5"])).toBe(true)
  })

  it("checks Origin against the allowlist", () => {
    const list = [DEFAULT_EXTENSION_ORIGIN]
    expect(isAllowedOrigin(DEFAULT_EXTENSION_ORIGIN, list, false)).toBe(true)
    expect(isAllowedOrigin(`${DEFAULT_EXTENSION_ORIGIN}/`, list, false)).toBe(true)
    expect(isAllowedOrigin("https://evil.example", list, false)).toBe(false)
    expect(isAllowedOrigin("chrome-extension://someoneelse", list, false)).toBe(false)
    expect(isAllowedOrigin("null", list, true)).toBe(false)
    expect(isAllowedOrigin(undefined, list, false)).toBe(false)
    expect(isAllowedOrigin(undefined, list, true)).toBe(true)
  })
})

describe("parseArgs", () => {
  it("defaults", () => {
    const a = parseArgs([], {}, dir)
    expect(a).toMatchObject({ projectDir: dir, port: 7281, host: "127.0.0.1", allowNoOrigin: false })
    expect(a.allowedOrigins).toEqual([DEFAULT_EXTENSION_ORIGIN])
  })

  it("flags, env origins and relative project dirs", () => {
    const a = parseArgs(
      ["--project", ".", "--port", "7399", "--allow-origin", "chrome-extension://abc", "--allow-origin=http://localhost:3000"],
      { CLAUDE_STUDIO_ALLOWED_ORIGINS: "chrome-extension://def, ", CLAUDE_STUDIO_ALLOW_NO_ORIGIN: "1", PORT: "1" },
      dir,
    )
    expect(a.projectDir).toBe(dir)
    expect(a.port).toBe(7399)
    expect(a.allowNoOrigin).toBe(true)
    expect(a.allowedOrigins).toEqual([DEFAULT_EXTENSION_ORIGIN, "chrome-extension://abc", "http://localhost:3000", "chrome-extension://def"])
  })

  it("PORT env is the default port", () => {
    expect(parseArgs([], { PORT: "8000" }, dir).port).toBe(8000)
  })

  it("rejects bad input", () => {
    expect(() => parseArgs(["--project", join(dir, "nope")], {}, dir)).toThrow(/does not exist/)
    expect(() => parseArgs(["--port", "abc"], {}, dir)).toThrow(/port/)
    expect(() => parseArgs(["--port"], {}, dir)).toThrow(/requires a value/)
    expect(() => parseArgs(["--bogus"], {}, dir)).toThrow(/unknown option/)
  })

  it("#9 refuses a non-loopback --host unless --unsafe-bind", () => {
    expect(() => parseArgs(["--host", "0.0.0.0"], {}, dir)).toThrow(/unsafe-bind/)
    expect(() => parseArgs(["--host", "192.168.1.5"], {}, dir)).toThrow(/unsafe-bind/)
    expect(parseArgs(["--host", "0.0.0.0", "--unsafe-bind"], {}, dir).host).toBe("0.0.0.0")
    for (const h of ["localhost", "127.0.0.2", "::1", "[::1]"]) expect(parseArgs(["--host", h], {}, dir).host).toBe(h)
  })

  it("--help / --version skip validation", () => {
    expect(parseArgs(["--help", "--project", "/definitely/missing"], {}, dir).help).toBe(true)
    expect(parseArgs(["-v"], {}, dir).version).toBe(true)
  })
})

describe("ConfigStore", () => {
  it("creates the config dir lazily, never stores projectDir, and emits change", () => {
    const path = join(dir, "nested", "config.json")
    const store = new ConfigStore("/proj", path)
    expect(store.get().projectDir).toBe("/proj")
    expect(existsSync(path)).toBe(false)
    let seen: any[] = []
    store.on("change", (next, prev) => (seen = [next, prev]))
    const applied = store.update({ model: "opus", projectDir: "/elsewhere", bogus: 1 })
    expect(applied).toEqual({ model: "opus" })
    expect(seen[0].model).toBe("opus")
    expect(seen[1].model).toBe("")
    expect(store.get().projectDir).toBe("/proj")
    const disk = JSON.parse(readFileSync(path, "utf-8"))
    expect(disk.model).toBe("opus")
    expect("projectDir" in disk).toBe(false)
  })

  it("loads existing values, keeps the CLI projectDir, ignores garbage", () => {
    const path = join(dir, "config.json")
    writeFileSync(path, JSON.stringify({ model: "sonnet", projectDir: "/old", permissionMode: "plan", maxTurns: 5 }))
    const s = new ConfigStore("/proj", path)
    expect(s.get()).toMatchObject({ model: "sonnet", projectDir: "/proj", permissionMode: "plan", maxTurns: 5 })
    writeFileSync(path, "{not json")
    expect(new ConfigStore("/proj", path).get().model).toBe("")
  })

  it("returns an empty patch (no emit) when nothing valid was sent", () => {
    const s = new ConfigStore("/proj", join(dir, "c.json"))
    let emitted = false
    s.on("change", () => (emitted = true))
    expect(s.update({ permissionMode: "yolo" })).toEqual({})
    expect(emitted).toBe(false)
  })
})

describe("AsyncQueue", () => {
  it("delivers pushed items in order and ends", async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    const got: number[] = []
    const done = (async () => {
      for await (const n of q) got.push(n)
    })()
    q.push(2)
    await new Promise((r) => setTimeout(r, 0))
    q.push(3)
    q.end()
    await done
    expect(got).toEqual([1, 2, 3])
    expect(() => q.push(4)).toThrow()
  })
})

describe("transcript-file", () => {
  it("maps the project dir like the CLI does", () => {
    expect(transcriptPath("/Users/me/Projects/claude-studio", "abc", "/h/.claude")).toBe("/h/.claude/projects/-Users-me-Projects-claude-studio/abc.jsonl")
  })
  it("reads local command output from system entries", () => {
    const jsonl = [
      JSON.stringify({ type: "system", subtype: "local_command", uuid: "s1", content: "<local-command-stdout>\u001b[2mUsage 17%\u001b[22m</local-command-stdout>" }),
      JSON.stringify({ type: "system", subtype: "local_command", uuid: "s2", content: "<local-command-stdout></local-command-stdout>" }),
      JSON.stringify({ type: "user", uuid: "u", message: { content: "local_command" } }),
      '{"type":"system","subtype":"local_command", broken',
    ].join("\n")
    expect([...parseLocalCommandOutputs(jsonl)]).toEqual([["s1", "Usage 17%"]])
  })
})

describe("protocol element validation (#4)", () => {
  const sid = "11111111-2222-4333-8444-555555555555"
  const el = { tagName: "DIV", id: "", cssSelector: "div", textContent: "", outerHTML: "", classList: ["a"], attributes: { id: "x" }, parentChain: ["body"] }
  const msg = (element: unknown) => JSON.stringify({ type: "send", sessionId: sid, text: "hi", attachments: [{ type: "element", url: "u", title: "t", element }] })
  it("accepts a well-formed element", () => {
    expect(() => parseClientMessage(msg(el))).not.toThrow()
  })
  it("rejects malformed element fields", () => {
    expect(() => parseClientMessage(msg({ ...el, classList: "a b" }))).toThrow(/classList/)
    expect(() => parseClientMessage(msg({ ...el, classList: [1] }))).toThrow(/classList/)
    expect(() => parseClientMessage(msg({ ...el, classList: Array(101).fill("a") }))).toThrow(/classList/)
    expect(() => parseClientMessage(msg({ ...el, id: 5 }))).toThrow(/element.id/)
    expect(() => parseClientMessage(msg({ ...el, attributes: { a: 1 } }))).toThrow(/attributes/)
    expect(() => parseClientMessage(msg({ ...el, attributes: ["x"] }))).toThrow(/attributes/)
    expect(() => parseClientMessage(msg({ ...el, parentChain: [{}] }))).toThrow(/parentChain/)
    expect(() => parseClientMessage(msg(null))).toThrow(/element/)
  })
})
