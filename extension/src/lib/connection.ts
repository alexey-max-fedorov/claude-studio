import type { ClientMessage, ServerMessage } from "@claude-studio/protocol"

/*
 * WebSocket connection to the agent, owned by the side panel page (an MV3 service
 * worker would be killed when idle). Reconnects with exponential backoff and pings
 * every 20 s so idle sockets stay open.
 */

export type ConnState = "connecting" | "open" | "reconnecting" | "down"

export interface ConnectionOptions {
  url: string
  onMessage: (msg: ServerMessage) => void
  onState: (state: ConnState, info: { attempts: number; nextRetryMs: number | null }) => void
  onOpen?: () => void
  /** Injectable for tests. */
  WebSocketImpl?: typeof WebSocket
}

export const MIN_BACKOFF_MS = 500
export const MAX_BACKOFF_MS = 10_000
export const PING_MS = 20_000
/** Failed attempts (without ever opening) before we call the agent "not running". */
export const DOWN_AFTER = 2

/** A usable agent URL: parses, ws: or wss:, has a host. */
export function isValidAgentUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return (u.protocol === "ws:" || u.protocol === "wss:") && !!u.hostname
  } catch {
    return false
  }
}

export function backoffDelay(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.max(0, attempt))
}

export class AgentConnection {
  private ws: WebSocket | null = null
  private attempts = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  private url: string
  state: ConnState = "connecting"

  constructor(private opts: ConnectionOptions) {
    this.url = opts.url
  }

  start(): void {
    this.closed = false
    this.open()
  }

  stop(): void {
    this.closed = true
    this.clearTimers()
    if (this.ws) {
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
  }

  setUrl(url: string): void {
    if (url === this.url) return
    this.url = url
    this.stop()
    this.attempts = 0
    this.start()
  }

  /** Reconnect now (user clicked Retry). */
  retry(): void {
    this.stop()
    this.attempts = 0
    this.start()
  }

  get isOpen(): boolean {
    return this.ws?.readyState === 1
  }

  send(msg: ClientMessage): boolean {
    return this.sendRaw(JSON.stringify(msg))
  }

  /** Send an already-serialized (and validated) ClientMessage. */
  sendRaw(json: string): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false
    try {
      this.ws.send(json)
      return true
    } catch {
      return false
    }
  }

  private setState(state: ConnState, nextRetryMs: number | null = null) {
    this.state = state
    this.opts.onState(state, { attempts: this.attempts, nextRetryMs })
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.retryTimer = null
    this.pingTimer = null
  }

  private open() {
    const Impl = this.opts.WebSocketImpl ?? WebSocket
    this.setState(this.attempts === 0 ? "connecting" : this.attempts >= DOWN_AFTER ? "down" : "reconnecting")
    let ws: WebSocket
    try {
      ws = new Impl(this.url)
    } catch {
      // Bad URL or blocked scheme: counts as a failed attempt so backoff grows and "down" shows.
      this.attempts++
      this.scheduleRetry()
      return
    }
    this.ws = ws
    let opened = false
    ws.onopen = () => {
      opened = true
      this.attempts = 0
      this.setState("open")
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS)
      this.opts.onOpen?.()
    }
    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data))
      } catch {
        return
      }
      if (msg && typeof (msg as any).type === "string") this.opts.onMessage(msg)
    }
    ws.onerror = () => {
      /* onclose follows */
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearTimers()
      if (this.closed) return
      if (!opened) this.attempts++
      else this.attempts = 1
      this.scheduleRetry()
    }
  }

  private scheduleRetry() {
    if (this.closed) return
    const delay = backoffDelay(this.attempts - 1)
    this.setState(this.attempts >= DOWN_AFTER ? "down" : "reconnecting", delay)
    this.retryTimer = setTimeout(() => this.open(), delay)
  }
}
