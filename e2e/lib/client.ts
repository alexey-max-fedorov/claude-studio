/*
 * Typed WebSocket test client for the Claude Studio daemon (protocol v3).
 * Collects every ServerMessage, validates each one's shape on arrival, and
 * lets scenarios wait for a message matching a predicate.
 */
import WebSocket from "ws"
import type { ChatItem, ClientMessage, LiveEvent, ServerMessage } from "../../protocol/src/protocol.js"
import { validateServerMessage } from "./validate.js"

export const EXTENSION_ORIGIN = "chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol"

export interface ConnectOptions {
  /** Origin header; null sends none. Default: the extension origin. */
  origin?: string | null
  /** Extra handshake headers (e.g. a spoofed Host). */
  headers?: Record<string, string>
  timeoutMs?: number
  /** Name used in error messages. */
  label?: string
}

export interface WaitOptions {
  /** Only consider messages at index >= from (use client.mark()). Default 0. */
  from?: number
  /** Description used in the timeout error. */
  label?: string
}

export class ShapeError extends Error {}
export class WaitTimeout extends Error {}

type Waiter = {
  pred: (m: ServerMessage, i: number) => boolean
  from: number
  resolve: (v: { msg: ServerMessage; index: number }) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export class TestClient {
  readonly messages: ServerMessage[] = []
  /** Arrival time (ms since epoch) of messages[i]. */
  readonly times: number[] = []
  /** Contract violations: "[#index type] problem" plus the offending frame. */
  readonly violations: string[] = []
  /** Extra keys not in the protocol (drift; not fatal). */
  readonly warnings: string[] = []
  readonly closed: Promise<{ code: number; reason: string }>
  private waiters = new Set<Waiter>()
  private isClosed = false

  private constructor(
    readonly ws: WebSocket,
    readonly label: string,
  ) {
    this.closed = new Promise((resolve) => {
      ws.on("close", (code, reason) => {
        this.isClosed = true
        for (const w of this.waiters) {
          clearTimeout(w.timer)
          w.reject(new Error(`${this.label}: socket closed (code ${code}${reason.length ? `, ${reason}` : ""}) while waiting`))
        }
        this.waiters.clear()
        resolve({ code, reason: reason.toString() })
      })
    })
    ws.on("message", (data, isBinary) => this.onFrame(data, isBinary))
  }

  /** Open a socket; resolves once the handshake completes (does not wait for hello). */
  static connect(url: string, opts: ConnectOptions = {}): Promise<TestClient> {
    const origin = opts.origin === undefined ? EXTENSION_ORIGIN : opts.origin
    const headers: Record<string, string> = { ...(opts.headers ?? {}) }
    const label = opts.label ?? "client"
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers, ...(origin === null ? {} : { origin }), handshakeTimeout: opts.timeoutMs ?? 5000 })
      // Attach listeners synchronously so early frames are not lost.
      const client = new TestClient(ws, label)
      const fail = (e: Error) => reject(e)
      ws.once("error", fail)
      ws.once("unexpected-response", (_req, res) => {
        reject(new Error(`${label}: handshake rejected with HTTP ${res.statusCode}`))
        res.resume()
        ws.terminate()
      })
      ws.once("open", () => {
        ws.off("error", fail)
        ws.on("error", () => {}) // later errors surface via close
        resolve(client)
      })
    })
  }

  get open(): boolean {
    return !this.isClosed && this.ws.readyState === WebSocket.OPEN
  }

  /** Index the next message will get. Pass as `from` to wait only for newer messages. */
  mark(): number {
    return this.messages.length
  }

  send(msg: ClientMessage): void {
    this.sendRaw(JSON.stringify(msg))
  }

  sendRaw(raw: string): void {
    if (!this.open) throw new Error(`${this.label}: send on a closed socket`)
    this.ws.send(raw)
  }

  /**
   * Resolve with the first message (index >= from) matching pred. Rejects on
   * timeout, on socket close, or immediately when a shape violation was seen.
   */
  waitFor<T extends ServerMessage = ServerMessage>(pred: (m: ServerMessage, i: number) => boolean, timeoutMs: number, opts: WaitOptions = {}): Promise<T> {
    return this.waitForIndexed<T>(pred, timeoutMs, opts).then((x) => x.msg)
  }

  waitForIndexed<T extends ServerMessage = ServerMessage>(
    pred: (m: ServerMessage, i: number) => boolean,
    timeoutMs: number,
    opts: WaitOptions = {},
  ): Promise<{ msg: T; index: number }> {
    const from = opts.from ?? 0
    const what = opts.label ?? "matching message"
    if (this.violations.length) return Promise.reject(new ShapeError(`${this.label}: protocol violation: ${this.violations[0]}`))
    for (let i = from; i < this.messages.length; i++) {
      if (pred(this.messages[i], i)) return Promise.resolve({ msg: this.messages[i] as T, index: i })
    }
    if (this.isClosed) return Promise.reject(new Error(`${this.label}: socket already closed while waiting for ${what}`))
    return new Promise((resolve, reject) => {
      const w: Waiter = {
        pred,
        from,
        resolve: resolve as Waiter["resolve"],
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(w)
          reject(new WaitTimeout(`${this.label}: timed out after ${timeoutMs} ms waiting for ${what}. Last messages: ${this.tail(6)}`))
        }, timeoutMs),
      }
      this.waiters.add(w)
    })
  }

  /** Live events for one session, from an index on. */
  events(sessionId: string, from = 0): { event: LiveEvent; index: number }[] {
    const out: { event: LiveEvent; index: number }[] = []
    for (let i = from; i < this.messages.length; i++) {
      const m = this.messages[i]
      if (m.type === "event" && m.sessionId === sessionId) out.push({ event: m.event, index: i })
    }
    return out
  }

  /** Live ChatItems for one session, from an index on. */
  items(sessionId: string, from = 0): { item: ChatItem; index: number }[] {
    return this.events(sessionId, from).flatMap((e) => (e.event.kind === "item" ? [{ item: e.event.item, index: e.index }] : []))
  }

  /** Short printable summary of the last n messages. */
  tail(n: number): string {
    return this.messages
      .slice(-n)
      .map((m) => summarize(m))
      .join(" | ")
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    this.ws.close()
    await Promise.race([this.closed, new Promise((r) => setTimeout(r, 2000))])
    if (!this.isClosed) this.ws.terminate()
  }

  private onFrame(data: WebSocket.RawData, isBinary: boolean): void {
    const index = this.messages.length
    let parsed: unknown
    if (isBinary) {
      this.violations.push(`[#${index}] binary frame received`)
      this.failWaiters()
      return
    }
    try {
      parsed = JSON.parse(data.toString())
    } catch {
      this.violations.push(`[#${index}] non-JSON frame: ${data.toString().slice(0, 200)}`)
      this.failWaiters()
      return
    }
    const report = validateServerMessage(parsed)
    const type = (parsed as { type?: unknown })?.type
    for (const w of report.warnings) if (!this.warnings.includes(w)) this.warnings.push(w)
    if (report.errors.length) {
      this.violations.push(`[#${index} ${String(type)}] ${report.errors.join("; ")} :: ${JSON.stringify(parsed).slice(0, 400)}`)
      this.failWaiters()
      return
    }
    const msg = parsed as ServerMessage
    this.messages.push(msg)
    this.times.push(Date.now())
    for (const w of [...this.waiters]) {
      if (index >= w.from && w.pred(msg, index)) {
        clearTimeout(w.timer)
        this.waiters.delete(w)
        w.resolve({ msg, index })
      }
    }
  }

  private failWaiters(): void {
    const v = this.violations[this.violations.length - 1]
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      w.reject(new ShapeError(`${this.label}: protocol violation: ${v}`))
    }
    this.waiters.clear()
  }
}

export type ConnectOutcome =
  | { accepted: true; client: TestClient; detail: string }
  | { accepted: false; detail: string }

/**
 * Try a connection and classify it. "Accepted" = handshake ok AND a hello
 * arrived. A socket that opens and is closed by the server before hello
 * counts as rejected (with the close code in detail).
 */
export async function probeConnect(url: string, opts: ConnectOptions & { helloTimeoutMs?: number } = {}): Promise<ConnectOutcome> {
  let client: TestClient
  try {
    client = await TestClient.connect(url, opts)
  } catch (e) {
    return { accepted: false, detail: (e as Error).message }
  }
  const hello = client.waitFor((m) => m.type === "hello", opts.helloTimeoutMs ?? 3000, { label: "hello" }).then(
    () => "hello" as const,
    () => "nohello" as const,
  )
  const closed = client.closed.then((c) => c)
  const first = await Promise.race([hello, closed])
  if (first === "hello") return { accepted: true, client, detail: "handshake ok, hello received" }
  if (first === "nohello") {
    await client.close()
    return { accepted: false, detail: "handshake ok but no hello (treated as rejected)" }
  }
  return { accepted: false, detail: `opened then closed by server (code ${first.code}${first.reason ? `, "${first.reason}"` : ""})` }
}

export function summarize(m: ServerMessage): string {
  switch (m.type) {
    case "event": {
      const e = m.event
      const sid = m.sessionId.slice(0, 8)
      if (e.kind === "item") {
        const it = e.item
        const txt = "text" in it ? ` ${JSON.stringify(it.text.slice(0, 60))}` : ""
        const extra = it.kind === "tool_use" ? ` ${it.name} ${it.id}` : it.kind === "tool_result" ? ` ${it.toolUseId}` : it.kind === "result" ? ` isError=${it.isError}${it.errorText ? ` ${it.errorText}` : ""}` : ""
        return `event(${sid}) item:${it.kind}${extra}${txt}`
      }
      if (e.kind === "text_delta" || e.kind === "thinking_delta") return `event(${sid}) ${e.kind} ${JSON.stringify(e.text.slice(0, 30))}`
      if (e.kind === "status") return `event(${sid}) status:${e.state}`
      if (e.kind === "permission_request") return `event(${sid}) permission_request ${e.toolName}`
      return `event(${sid}) ${e.kind}`
    }
    case "error":
      return `error ${JSON.stringify(m.error.slice(0, 120))}`
    case "session_history":
      return `session_history(${m.sessionId.slice(0, 8)}) items=${m.items.length} running=${m.running}`
    default:
      return m.type
  }
}
