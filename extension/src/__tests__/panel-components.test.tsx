import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act, render } from "./render"
import { AskQuestionCard, PermissionCard, buildAnswers, parseQuestions } from "../components/PermissionCard"
import { matchCommands } from "../components/Composer"
import { backoffDelay } from "../lib/connection"
import { DEFAULT_CONFIG } from "@claude-studio/protocol"
import { SettingsDrawer } from "../components/SettingsDrawer"

const questions = {
  questions: [
    { question: "Which db?", header: "DB", multiSelect: false, options: [{ label: "Postgres", description: "solid" }, { label: "SQLite" }] },
    { question: "Features?", header: "Scope", multiSelect: true, options: [{ label: "Auth" }, { label: "Billing" }] },
  ],
}

function click(el: Element | null) {
  if (!el) throw new Error("missing element")
  act(() => {
    ;(el as HTMLElement).click()
  })
}

describe("SettingsDrawer budget", () => {
  it.each([null, 2])("shows live-process scope and preserves maxBudgetUsd with initial value %s", (maxBudgetUsd) => {
    const onConfig = vi.fn()
    const r = render(
      <SettingsDrawer
        serverUrl="ws://127.0.0.1:7281"
        onServerUrl={vi.fn()}
        config={{ ...DEFAULT_CONFIG, maxBudgetUsd }}
        connected={true}
        serverVersion="3.0.0"
        onConfig={onConfig}
        onClose={vi.fn()}
      />,
    )
    const label = Array.from(r.container.querySelectorAll("label")).find((el) => el.querySelector(".field-k")?.textContent === "Live-process budget, USD")!
    expect(label).toBeDefined()
    const input = label.querySelector("input")!
    expect(input.value).toBe(maxBudgetUsd?.toString() ?? "")
    expect(input.placeholder).toBe("no cap")
    const help = r.container.querySelector(`#${input.getAttribute("aria-describedby")}`)!
    expect(help.textContent).toBe("Shared across messages in one live Claude Code process, not the saved conversation. Fresh allowance after process restart, idle eviction, or conversation clear (/clear).")
    expect(help.className).toBe("field-hint")
    expect(label.closest(".field-pair")?.nextElementSibling).toBe(help)
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "3")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => void input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    expect(onConfig).toHaveBeenLastCalledWith({ maxBudgetUsd: 3 })
    r.unmount()
  })
})

describe("AskUserQuestion", () => {
  it("builds answers keyed by question text", () => {
    const qs = parseQuestions(questions)
    expect(
      buildAnswers(qs, [
        { picked: ["SQLite"], other: "", otherOn: false },
        { picked: ["Auth", "Billing"], other: "Search", otherOn: true },
      ]),
    ).toEqual({ "Which db?": "SQLite", "Features?": "Auth, Billing, Search" })
  })

  it("replies allow with updatedInput.answers once every question is answered", () => {
    const onReply = vi.fn()
    const req = { kind: "permission_request" as const, requestId: "q1", toolName: "AskUserQuestion", input: questions, canAlwaysAllow: false }
    const { container } = render(<AskQuestionCard req={req} onReply={onReply} />)
    const answer = () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Answer")!
    expect(answer().disabled).toBe(true)
    const radios = container.querySelectorAll<HTMLInputElement>("fieldset")[0].querySelectorAll("input")
    click(radios[0]) // Postgres
    const boxes = container.querySelectorAll<HTMLInputElement>("fieldset")[1].querySelectorAll("input[type=checkbox]")
    click(boxes[1]) // Billing
    expect(answer().disabled).toBe(false)
    click(answer())
    expect(onReply).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: { ...questions, answers: { "Which db?": "Postgres", "Features?": "Billing" } },
    })
  })
})

describe("PermissionCard", () => {
  it("offers Always allow only when the SDK allows it", () => {
    const onReply = vi.fn()
    const base = { kind: "permission_request" as const, requestId: "p", toolName: "Bash", input: { command: "rm -rf build" } }
    const a = render(<PermissionCard req={{ ...base, canAlwaysAllow: true }} onReply={onReply} />)
    expect(a.container.textContent).toContain("$ rm -rf build")
    const always = Array.from(a.container.querySelectorAll("button")).find((b) => b.textContent === "Always allow")
    click(always!)
    expect(onReply).toHaveBeenCalledWith({ behavior: "allow", always: true })
    const b = render(<PermissionCard req={{ ...base, canAlwaysAllow: false }} onReply={onReply} />)
    expect(Array.from(b.container.querySelectorAll("button")).some((x) => x.textContent === "Always allow")).toBe(false)
    click(Array.from(b.container.querySelectorAll("button")).find((x) => x.textContent === "Deny")!)
    expect(onReply).toHaveBeenLastCalledWith({ behavior: "deny", message: undefined })
  })
})

describe("slash commands", () => {
  const cmds = [
    { name: "compact", description: "", argumentHint: "" },
    { name: "/clear", description: "", argumentHint: "" },
    { name: "review-pr", description: "", argumentHint: "<n>" },
  ]
  it("matches by prefix first, then substring, only before a space", () => {
    expect(matchCommands(cmds, "/").map((c) => c.name)).toEqual(["compact", "/clear", "review-pr"])
    expect(matchCommands(cmds, "/c").map((c) => c.name)).toEqual(["compact", "/clear"])
    expect(matchCommands(cmds, "/pr").map((c) => c.name)).toEqual(["review-pr"])
    expect(matchCommands(cmds, "/compact now")).toEqual([])
    expect(matchCommands(cmds, "hello /c")).toEqual([])
  })
})

describe("connection backoff", () => {
  it("doubles from 0.5s and caps at 10s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(backoffDelay)).toEqual([500, 1000, 2000, 4000, 8000, 10000, 10000])
  })
})

describe("permission card recovery", () => {
  it("re-enables the buttons when the reply could not be sent, and when the request is re-sent", () => {
    const req = { kind: "permission_request" as const, requestId: "p", toolName: "Bash", input: { command: "ls" }, canAlwaysAllow: false }
    let ok = false
    const onReply = vi.fn(() => ok)
    const r = render(<PermissionCard req={req} onReply={onReply} />)
    const allow = () => Array.from(r.container.querySelectorAll("button")).find((b) => b.textContent === "Allow") as HTMLButtonElement
    click(allow())
    expect(onReply).toHaveBeenCalledTimes(1)
    expect(allow().disabled).toBe(false)
    ok = true
    click(allow())
    expect(allow().disabled).toBe(true)
    // same requestId comes back in session_history.pending after a reconnect
    r.rerender(<PermissionCard req={{ ...req }} onReply={onReply} />)
    expect(allow().disabled).toBe(false)
  })
})

describe("agent url", () => {
  it("accepts only ws/wss URLs with a host", async () => {
    const { isValidAgentUrl } = await import("../lib/connection")
    expect(isValidAgentUrl("ws://127.0.0.1:7281")).toBe(true)
    expect(isValidAgentUrl("wss://host.example/ws")).toBe(true)
    expect(isValidAgentUrl("http://127.0.0.1:7281")).toBe(false)
    expect(isValidAgentUrl("ws://")).toBe(false)
    expect(isValidAgentUrl("ws:// spaces")).toBe(false)
    expect(isValidAgentUrl("nonsense")).toBe(false)
  })

  it("counts a throwing WebSocket constructor as a failed attempt", async () => {
    vi.useFakeTimers()
    const { AgentConnection } = await import("../lib/connection")
    const states: string[] = []
    const Throwing = function () {
      throw new SyntaxError("bad url")
    } as unknown as typeof WebSocket
    const c = new AgentConnection({ url: "ws://x", onMessage() {}, onState: (s) => states.push(s), WebSocketImpl: Throwing })
    c.start()
    vi.advanceTimersByTime(600)
    vi.advanceTimersByTime(1100)
    c.stop()
    vi.useRealTimers()
    expect(states).toContain("down")
  })
})

describe("outbox", () => {
  it("rejects frames over the agent payload limit and invalid messages", async () => {
    const { prepareSend, MAX_FRAME_BYTES } = await import("../lib/outbox")
    const sid = "11111111-1111-4111-8111-111111111111"
    const shot = (n: number) => ({ type: "screenshot" as const, url: "https://a", title: "", dataUrl: "data:image/jpeg;base64," + "A".repeat(n) })
    const big = prepareSend(sid, "hi", [shot(8_000_000), shot(8_000_000)])
    expect(big.ok).toBe(false)
    if (!big.ok) expect(big.error).toMatch(/too large/)
    expect(MAX_FRAME_BYTES).toBe(15 * 1024 * 1024)
    const bad = prepareSend("not-a-uuid", "hi", [])
    expect(bad.ok).toBe(false)
    expect(prepareSend(sid, "hi", []).ok).toBe(true)
    expect(prepareSend(sid, "", []).ok).toBe(false)
  })
})

describe("window-scoped storage keys", () => {
  it("prefers the window key and falls back to the global key", async () => {
    const { windowScoped, windowKey } = await import("../lib/storage")
    expect(windowKey("currentSessionId", 7)).toBe("currentSessionId:7")
    expect(windowKey("currentSessionId", null)).toBe("currentSessionId")
    expect(windowScoped("k", 7, "v")).toEqual({ k: "v", "k:7": "v" })
    expect(windowScoped("k", null, "v")).toEqual({ k: "v" })
  })
})
