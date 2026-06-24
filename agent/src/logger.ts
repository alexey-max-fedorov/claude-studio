import { EventEmitter } from "node:events"

export interface LogEntry {
  time: number
  level: "info" | "event" | "error" | "success" | "dim"
  tag: string
  msg: string
}

const MAX = 200

class LogBuffer extends EventEmitter {
  private buf: LogEntry[] = []
  push(entry: LogEntry): void {
    this.buf.push(entry)
    if (this.buf.length > MAX) this.buf.shift()
    this.emit("entry", entry)
  }
  entries(): LogEntry[] {
    return this.buf.slice()
  }
  clear(): void {
    this.buf = []
  }
}

export const logBuffer = new LogBuffer()

const COLORS: Record<LogEntry["level"], string> = {
  info: "\x1b[36m", event: "\x1b[35m", error: "\x1b[31m", success: "\x1b[32m", dim: "\x1b[90m",
}
const RESET = "\x1b[0m"

function emit(level: LogEntry["level"], tag: string, msg: string): void {
  const entry: LogEntry = { time: Date.now(), level, tag, msg }
  logBuffer.push(entry)
  // stderr keeps stdout free for the Ink TUI
  process.stderr.write(`${COLORS[level]}[${tag}]${RESET} ${msg}\n`)
}

export const log = {
  info: (tag: string, msg: string) => emit("info", tag, msg),
  event: (tag: string, msg: string) => emit("event", tag, msg),
  error: (tag: string, msg: string) => emit("error", tag, msg),
  success: (tag: string, msg: string) => emit("success", tag, msg),
  dim: (tag: string, msg: string) => emit("dim", tag, msg),
}
