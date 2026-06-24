import { describe, it, expect } from "vitest"
import { ConnectionManager } from "../connection-manager.js"

function fakeWs() {
  const sent: string[] = []
  return { readyState: 1, send: (s: string) => sent.push(s), sent } as any
}

describe("ConnectionManager", () => {
  it("adds clients and returns unique ids, tracking count", () => {
    const cm = new ConnectionManager()
    const id1 = cm.add(fakeWs())
    const id2 = cm.add(fakeWs())
    expect(id1).not.toBe(id2)
    expect(cm.count).toBe(2)
  })

  it("emits count on add and remove", () => {
    const cm = new ConnectionManager()
    const counts: number[] = []
    cm.on("count", (n) => counts.push(n))
    const id = cm.add(fakeWs())
    cm.remove(id)
    expect(counts).toEqual([1, 0])
  })

  it("send only writes to an open socket", () => {
    const cm = new ConnectionManager()
    const ws = fakeWs()
    const id = cm.add(ws)
    cm.send(id, { type: "pong" })
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "pong" })
  })

  it("broadcast writes to every open client", () => {
    const cm = new ConnectionManager()
    const a = fakeWs(), b = fakeWs()
    cm.add(a); cm.add(b)
    cm.broadcast({ type: "pong" })
    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(1)
  })
})
