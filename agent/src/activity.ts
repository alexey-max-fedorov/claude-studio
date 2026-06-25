import { EventEmitter } from "node:events"

export type ActivityKind = "thinking" | "text" | "tool"
export interface ActivityEntry { kind: ActivityKind; text: string }

const MAX = 100

class ActivityBuffer extends EventEmitter {
  private buf: ActivityEntry[] = []

  append(kind: ActivityKind, text: string): void {
    const last = this.buf[this.buf.length - 1]
    if (last && last.kind === kind && kind !== "tool") {
      last.text += text
    } else {
      this.buf.push({ kind, text })
      if (this.buf.length > MAX) this.buf.shift()
    }
    this.emit("update")
  }

  entries(): ActivityEntry[] {
    return this.buf.slice()
  }

  clear(): void {
    this.buf = []
    this.emit("update")
  }
}

export const activityBuffer = new ActivityBuffer()
