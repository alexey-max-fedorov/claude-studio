type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"
type StateListener = (state: ConnectionState) => void
type MessageListener = (msg: unknown) => void

export class WsClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempt = 0
  private maxReconnectDelay = 30_000
  private stateListeners: StateListener[] = []
  private messageListeners: MessageListener[] = []
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingMessages: object[] = []
  private maxPendingMessages = 50
  state: ConnectionState = "disconnected"

  constructor(url: string) {
    this.url = url
  }

  setUrl(url: string): void {
    this.url = url
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.setState("connecting")

    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.reconnectAttempt = 0
      this.setState("connected")
      this.flushPendingMessages()
      this.startKeepalive()
    }
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string)
      this.messageListeners.forEach((fn) => fn(msg))
    }
    this.ws.onclose = () => {
      this.stopKeepalive()
      this.scheduleReconnect()
    }
    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  disconnect(): void {
    this.stopKeepalive()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.ws = null
    this.setState("disconnected")
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      if (this.pendingMessages.length >= this.maxPendingMessages) {
        this.pendingMessages.shift()
      }
      this.pendingMessages.push(msg)
    }
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.push(fn)
    return () => { this.stateListeners = this.stateListeners.filter((l) => l !== fn) }
  }

  onMessage(fn: MessageListener): () => void {
    this.messageListeners.push(fn)
    return () => { this.messageListeners = this.messageListeners.filter((l) => l !== fn) }
  }

  private setState(state: ConnectionState): void {
    this.state = state
    this.stateListeners.forEach((fn) => fn(state))
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting")
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, this.maxReconnectDelay)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      this.send({ type: "ping" })
    }, 20_000)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
    this.keepaliveTimer = null
  }

  private flushPendingMessages(): void {
    const queued = this.pendingMessages.splice(0)
    for (const msg of queued) {
      this.send(msg)
    }
  }
}
