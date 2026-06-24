import { describe, it, expect } from "vitest"
import { parseClientMessage, serializeServerMessage } from "../protocol.js"

describe("parseClientMessage", () => {
  it("parses a ping message", () => {
    const msg = parseClientMessage('{"type":"ping"}')
    expect(msg).toEqual({ type: "ping" })
  })

  it("parses a prompt message with element data", () => {
    const raw = JSON.stringify({
      type: "prompt",
      route: "/about",
      element: {
        tagName: "h1", id: "", classList: ["title"], cssSelector: "h1.title",
        textContent: "About Us", outerHTML: '<h1 class="title">About Us</h1>',
        attributes: {}, boundingRect: { top: 100, left: 50, width: 400, height: 40 },
        computedStyles: { color: "black", backgroundColor: "white", fontSize: "32px", fontFamily: "sans-serif", padding: "0px", margin: "0px" },
        parentChain: ["body", "main"], siblingCount: 2, childCount: 0
      },
      prompt: "Make this red",
    })
    const msg = parseClientMessage(raw)
    expect(msg.type).toBe("prompt")
  })

  it("parses a raw_prompt message", () => {
    const msg = parseClientMessage('{"type":"raw_prompt","prompt":"hello"}')
    expect(msg).toEqual({ type: "raw_prompt", prompt: "hello" })
  })

  it("parses a reset_session message", () => {
    const msg = parseClientMessage('{"type":"reset_session"}')
    expect(msg).toEqual({ type: "reset_session" })
  })

  it("throws on invalid JSON", () => {
    expect(() => parseClientMessage("not json")).toThrow()
  })

  it("throws on missing type field", () => {
    expect(() => parseClientMessage('{"data":"hello"}')).toThrow("missing type")
  })

  it("throws on non-object message", () => {
    expect(() => parseClientMessage('"just a string"')).toThrow("missing type")
  })

  const validElement = {
    tagName: "h1", id: "", classList: ["title"], cssSelector: "h1.title",
    textContent: "About", outerHTML: "<h1>About</h1>",
    attributes: {}, boundingRect: { top: 0, left: 0, width: 0, height: 0 },
    computedStyles: { color: "black", backgroundColor: "white", fontSize: "32px", fontFamily: "x", padding: "0", margin: "0" },
    parentChain: ["body"], siblingCount: 0, childCount: 0,
  }
  const buildPromptMsg = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    type: "prompt", route: "/", element: validElement, prompt: "x", ...overrides,
  })
  const buildElementMsg = (elementOverrides: Record<string, unknown>) => JSON.stringify({
    type: "prompt", route: "/", prompt: "x",
    element: { ...validElement, ...elementOverrides },
  })

  it("throws when element.id is not a string", () => {
    expect(() => parseClientMessage(buildElementMsg({ id: 123 }))).toThrow("element.id must be a string")
  })

  it("throws when element.attributes is not an object", () => {
    expect(() => parseClientMessage(buildElementMsg({ attributes: "x" }))).toThrow("element.attributes must be an object")
  })

  it("throws when element.attributes is an array", () => {
    expect(() => parseClientMessage(buildElementMsg({ attributes: [] }))).toThrow("element.attributes must be an object")
  })

  it("throws when element.attributes value is not a string", () => {
    expect(() => parseClientMessage(buildElementMsg({ attributes: { foo: 1 } }))).toThrow("element.attributes")
  })

  it("throws when element.attributes has too many entries", () => {
    const big: Record<string, string> = {}
    for (let i = 0; i < 51; i++) big[`k${i}`] = "v"
    expect(() => parseClientMessage(buildElementMsg({ attributes: big }))).toThrow("exceeds max entries")
  })

  it("throws when element.parentChain contains non-strings", () => {
    expect(() => parseClientMessage(buildElementMsg({ parentChain: [1, 2] }))).toThrow("element.parentChain[0] must be a string")
  })

  it("throws when element.classList contains non-strings", () => {
    expect(() => parseClientMessage(buildElementMsg({ classList: [{}] }))).toThrow("element.classList[0] must be a string")
  })

  it("throws when element.computedStyles is missing", () => {
    expect(() => parseClientMessage(buildElementMsg({ computedStyles: null }))).toThrow("element.computedStyles must be an object")
  })

  it("throws when element.computedStyles.color is not a string", () => {
    expect(() => parseClientMessage(buildElementMsg({ computedStyles: { ...validElement.computedStyles, color: 1 } }))).toThrow("element.computedStyles.color must be a string")
  })

  it("accepts a fully-valid prompt message", () => {
    const msg = parseClientMessage(buildPromptMsg())
    expect(msg.type).toBe("prompt")
  })
})

describe("serializeServerMessage", () => {
  it("serializes a connected message", () => {
    const json = serializeServerMessage({ type: "connected", clientId: "abc-123" })
    const parsed = JSON.parse(json)
    expect(parsed.type).toBe("connected")
    expect(parsed.clientId).toBe("abc-123")
  })

  it("serializes a streaming message", () => {
    const json = serializeServerMessage({ type: "ai_streaming", chunk: "Hello " })
    expect(JSON.parse(json).chunk).toBe("Hello ")
  })

  it("serializes a pong message", () => {
    const json = serializeServerMessage({ type: "pong" })
    expect(JSON.parse(json).type).toBe("pong")
  })

  it("serializes an ai_complete message", () => {
    const json = serializeServerMessage({
      type: "ai_complete", result: "Done", sessionId: "s1", cost: 0.05, turns: 3,
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      duration_ms: 1500, model: "sonnet"
    })
    const parsed = JSON.parse(json)
    expect(parsed.sessionId).toBe("s1")
    expect(parsed.cost).toBe(0.05)
  })

  it("serializes an ai_error message", () => {
    const json = serializeServerMessage({ type: "ai_error", error: "something broke" })
    expect(JSON.parse(json).error).toBe("something broke")
  })
})
