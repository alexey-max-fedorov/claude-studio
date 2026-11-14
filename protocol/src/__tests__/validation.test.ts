import { describe, expect, it } from "vitest"
import type { Attachment, ClientMessage, ServerMessage } from "../protocol.js"
import { PROTOCOL_VERSION } from "../protocol.js"
import { DEFAULT_CONFIG } from "../config.js"
import { parseClientMessage, serializeServerMessage, validateAttachment } from "../validation.js"

const sessionId = "12345678-abcd-4000-8000-123456789abc"
const page = { url: "https://example.com/fixture", title: "Fixture" }
const element = {
  tagName: "BUTTON", id: "save", classList: ["primary"], cssSelector: "#save", textContent: "Save",
  outerHTML: '<button id="save">Save</button>', attributes: { id: "save" },
  boundingRect: { top: 0, left: 0, width: 100, height: 20 },
  computedStyles: { color: "black", backgroundColor: "white", fontSize: "16px", fontFamily: "sans-serif", padding: "0", margin: "0" },
  parentChain: ["body"], siblingCount: 0, childCount: 0,
}
const attachments: Attachment[] = [
  { ...page, type: "page" },
  { ...page, type: "selection", text: "Selected text" },
  { ...page, type: "page_text", text: "Page text" },
  { ...page, type: "screenshot", dataUrl: "data:image/png;base64,aGVsbG8=" },
  { ...page, type: "element", element },
]
const send = { type: "send", sessionId, text: "hello", attachments: [] }
const permission = { type: "permission_response", sessionId, requestId: "request-1", behavior: "deny" }
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value))
const reject = (value: unknown) => expect(() => parse(value)).toThrow(/Invalid message:/)

// Samples are intentionally not exhaustive so new protocol variants can add their own tests.
const clientSamples: ClientMessage[] = [
  { type: "ping" }, { type: "get_state" }, { type: "set_config", patch: { model: "haiku" } },
  { type: "list_sessions" }, { type: "list_sessions", limit: 200, offset: 100_000 },
  { type: "open_session", sessionId }, { type: "open_session", sessionId, requestId: sessionId },
  { type: "interrupt", sessionId }, { type: "close_session", sessionId },
  { type: "rename_session", sessionId, title: "Fixture session" },
  { type: "send", sessionId, text: "hello", attachments },
  { type: "permission_response", sessionId, requestId: "request-1", behavior: "deny", message: "Not allowed" },
  { type: "permission_response", sessionId, requestId: "request-1", behavior: "allow", always: true, updatedInput: { answers: { question: "yes" } } },
]

describe("v3 client messages", () => {
  it("uses protocol version 3", () => expect(PROTOCOL_VERSION).toBe(3))

  it.each(clientSamples)("accepts valid $type", (message) => {
    expect(parse(message)).toEqual(message)
  })

  it.each(["", "{", "undefined", "not JSON"])("rejects malformed JSON %j", (raw) => {
    expect(() => parseClientMessage(raw)).toThrow(/Invalid message:/)
  })

  it.each([null, [], 42, true, "ping", {}, { type: 5 }, { type: "not_a_v3_message" }])("rejects invalid envelope %j", reject)

  for (const type of ["open_session", "interrupt", "close_session", "rename_session", "send", "permission_response"]) {
    it.each([undefined, null, "", "/tmp/project", "12345678-abcd-4000-8000-123456789abg", `${sessionId}x`, 12])(`rejects invalid UUID on ${type}: %j`, (id) => {
      reject({ ...send, ...permission, type, title: "Fixture", sessionId: id })
    })
  }

  it("accepts uppercase UUIDs", () => {
    expect(parse({ type: "open_session", sessionId: sessionId.toUpperCase() }).type).toBe("open_session")
  })

  it.each([null, 1, "", "history-1", {}, []])("rejects invalid open_session request id %j", (requestId) => {
    reject({ type: "open_session", sessionId, requestId })
  })

  it.each([null, [], false, 1, "model"])("rejects non-object set_config patch %j", (patch) => reject({ type: "set_config", patch }))

  it.each([0, 201, 1.5, "1", null, -1])("rejects invalid session list limit %j", (limit) => reject({ type: "list_sessions", limit }))
  it.each([-1, 100_001, 1.5, "0", null])("rejects invalid session list offset %j", (offset) => reject({ type: "list_sessions", offset }))

  it("enforces rename and message text limits", () => {
    expect(parse({ type: "rename_session", sessionId, title: "t".repeat(200) }).type).toBe("rename_session")
    reject({ type: "rename_session", sessionId, title: "t".repeat(201) })
    reject({ type: "rename_session", sessionId, title: 1 })
    expect(parse({ ...send, text: "t".repeat(200_000) }).type).toBe("send")
    reject({ ...send, text: "t".repeat(200_001) })
    for (const text of [undefined, null, 1, {}, []]) reject({ ...send, text })
  })

  it("rejects empty sends unless browser context is attached", () => {
    reject({ ...send, text: " \n\t" })
    expect(parse({ ...send, text: "", attachments: [attachments[0]] }).type).toBe("send")
  })

  it("requires an attachment array with at most 12 entries", () => {
    for (const value of [undefined, null, {}, "page"]) reject({ ...send, attachments: value })
    expect(parse({ ...send, attachments: Array(12).fill(attachments[0]) }).type).toBe("send")
    reject({ ...send, attachments: Array(13).fill(attachments[0]) })
  })

  it("strictly validates permission decision fields and replacement tool input", () => {
    for (const behavior of [undefined, null, true, "maybe", "ALLOW"]) reject({ ...permission, behavior })
    for (const requestId of [undefined, null, 1, "r".repeat(201)]) reject({ ...permission, requestId })
    for (const always of [null, "true", 1, {}]) reject({ ...permission, always })
    for (const updatedInput of [null, [], "command", 1, true]) reject({ ...permission, updatedInput })
    reject({ ...permission, message: 1 })
    reject({ ...permission, message: "m".repeat(4001) })
    expect(parse({ ...permission, message: "m".repeat(4000), requestId: "r".repeat(200), always: false, updatedInput: {} }).type).toBe("permission_response")
  })
})

describe("untrusted browser attachments", () => {
  const check = (attachment: unknown) => validateAttachment(attachment, 0)
  const bad = (attachment: unknown) => expect(() => check(attachment)).toThrow(/Invalid message:/)

  it.each(attachments)("accepts valid $type", (attachment) => expect(check(attachment)).toEqual(attachment))

  it.each([null, [], true, 1, "page", {}, { ...page, type: "unknown" }])("rejects invalid attachment %j", bad)

  it("bounds common URL and title fields", () => {
    expect(check({ type: "page", url: "u".repeat(4000), title: "t".repeat(2000) }).type).toBe("page")
    bad({ type: "page", url: "u".repeat(4001), title: "" })
    bad({ type: "page", url: "", title: "t".repeat(2001) })
    bad({ type: "page", url: 1, title: "" })
    bad({ type: "page", url: "", title: {} })
  })

  it.each([ ["selection", 200_000], ["page_text", 400_000] ] as const)("bounds %s text to %i characters", (type, max) => {
    expect(check({ ...page, type, text: "t".repeat(max) }).type).toBe(type)
    bad({ ...page, type, text: "t".repeat(max + 1) })
    bad({ ...page, type, text: null })
  })

  it.each(["png", "jpeg", "webp"])("permits only base64 image payloads: %s", (mime) => {
    expect(check({ ...page, type: "screenshot", dataUrl: `data:image/${mime};base64,aGVsbG8=` }).type).toBe("screenshot")
  })

  it.each([
    "https://example.com/image.png", "data:text/html;base64,PGI+", "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/gif;base64,R0lG", "data:image/png;base64,", "data:image/png;base64,hello!", "data:image/png;base64,abcd\n",
    "data:image/png,not-base64",
  ])("rejects unsafe or malformed screenshot %j", (dataUrl) => bad({ ...page, type: "screenshot", dataUrl }))

  it("limits screenshot data length", () => {
    const prefix = "data:image/png;base64,"
    expect(check({ ...page, type: "screenshot", dataUrl: prefix + "a".repeat(12_000_000 - prefix.length) }).type).toBe("screenshot")
    bad({ ...page, type: "screenshot", dataUrl: prefix + "a".repeat(12_000_001 - prefix.length) })
  })

  it("rejects non-object elements and unsafe DOM field shapes", () => {
    for (const value of [null, [], "button", 3]) bad({ ...page, type: "element", element: value })
    for (const patch of [
      { tagName: 1 }, { id: null }, { cssSelector: [] }, { textContent: {} }, { outerHTML: 1 },
      { classList: "button" }, { classList: [1] }, { attributes: [] }, { attributes: null },
      { attributes: { onclick: {} } }, { parentChain: {} }, { parentChain: [1] },
    ]) bad({ ...page, type: "element", element: { ...element, ...patch } })
  })

  it.each([
    ["tagName", 500], ["id", 500], ["cssSelector", 4000], ["textContent", 4000], ["outerHTML", 20_000],
  ] as const)("bounds element %s at %i", (field, max) => {
    expect(check({ ...page, type: "element", element: { ...element, [field]: "x".repeat(max) } }).type).toBe("element")
    bad({ ...page, type: "element", element: { ...element, [field]: "x".repeat(max + 1) } })
  })

  it("bounds element class, attribute, and ancestor collections", () => {
    for (const patch of [
      { classList: Array(101).fill("c") }, { classList: ["c".repeat(501)] },
      { parentChain: Array(101).fill("body") }, { parentChain: ["x".repeat(4001)] },
      { attributes: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, "v"])) },
      { attributes: { ["k".repeat(501)]: "v" } }, { attributes: { title: "v".repeat(4001) } },
    ]) bad({ ...page, type: "element", element: { ...element, ...patch } })
    const bounded = {
      ...element, classList: Array(100).fill("c".repeat(500)), parentChain: Array(100).fill("x".repeat(4000)),
      attributes: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, "v".repeat(4000)])),
    }
    expect(check({ ...page, type: "element", element: bounded }).type).toBe("element")
  })
})

describe("server serialization", () => {
  it("round-trips v3 frames, including unlimited config caps and session routing", () => {
    const message: ServerMessage = { type: "event", sessionId, event: { kind: "text_delta", id: "message:0", text: "<browser-context> & \"quoted\"\n" } }
    expect(JSON.parse(serializeServerMessage(message))).toEqual(message)
    const config: ServerMessage = { type: "config_state", config: { ...DEFAULT_CONFIG, projectDir: "/tmp/project" }, models: [], commands: [], permissionModes: ["default"] }
    expect(JSON.parse(serializeServerMessage(config))).toEqual(config)
    expect(JSON.parse(serializeServerMessage({ type: "pong" }))).toEqual({ type: "pong" })
  })
})


it("validates reset-following history requests", () => {
  const request = { type: "open_session", sessionId: "11111111-2222-4333-8444-555555555555", followResets: true }
  expect(parseClientMessage(JSON.stringify(request))).toEqual(request)
  expect(() => parseClientMessage(JSON.stringify({ ...request, followResets: "true" }))).toThrow(/followResets/)
})
