import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { locateElement } from "../locate-element.js"
import type { ElementSelection } from "@claude-studio/protocol"

const el = (over: Partial<ElementSelection>): ElementSelection => ({
  tagName: "button", id: "", classList: [], cssSelector: "", textContent: "",
  outerHTML: "", attributes: {}, boundingRect: { top: 0, left: 0, width: 0, height: 0 },
  computedStyles: { color: "", backgroundColor: "", fontSize: "", fontFamily: "", padding: "", margin: "" },
  parentChain: [], siblingCount: 0, childCount: 0, ...over,
})

describe("locateElement", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "loc-")) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("finds a file:line by distinctive text content", () => {
    writeFileSync(join(dir, "Page.tsx"), 'export const X = () => <button>Subscribe now</button>\n')
    const hits = locateElement(dir, el({ textContent: "Subscribe now" }))
    expect(hits[0]?.file).toMatch(/Page\.tsx$/)
    expect(hits[0]?.line).toBe(1)
  })

  it("finds by data-testid attribute", () => {
    writeFileSync(join(dir, "Nav.tsx"), 'line1\n<a data-testid="cta-buy">Go</a>\n')
    const hits = locateElement(dir, el({ attributes: { "data-testid": "cta-buy" } }))
    expect(hits[0]?.line).toBe(2)
  })

  it("ignores node_modules and returns [] when nothing matches", () => {
    mkdirSync(join(dir, "node_modules"))
    writeFileSync(join(dir, "node_modules", "x.js"), "Subscribe now\n")
    expect(locateElement(dir, el({ textContent: "Subscribe now" }))).toEqual([])
  })
})
