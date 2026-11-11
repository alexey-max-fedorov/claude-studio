import React from "react"
import { describe, expect, it } from "vitest"
import { render } from "./render"
import { parseBlocks, parseInline, safeHref } from "../lib/markdown"
import { Markdown } from "../components/Markdown"

function html(text: string) {
  const { container } = render(<Markdown text={text} />)
  return container
}

describe("markdown parser", () => {
  it("parses headings, paragraphs, hr and quotes", () => {
    const b = parseBlocks("# Title\n\nPara one\nline two\n\n---\n\n> quoted\n> more")
    expect(b.map((x) => x.t)).toEqual(["h", "p", "hr", "quote"])
    expect(b[1]).toMatchObject({ text: "Para one\nline two" })
  })

  it("parses fenced code with a language and keeps unclosed fences while streaming", () => {
    const b = parseBlocks("```ts\nconst a = 1\n```\nafter")
    expect(b[0]).toMatchObject({ t: "code", lang: "ts", text: "const a = 1", open: false })
    expect(b[1]).toMatchObject({ t: "p", text: "after" })
    const open = parseBlocks("```py\nprint(1)")
    expect(open[0]).toMatchObject({ t: "code", lang: "py", text: "print(1)", open: true })
  })

  it("parses nested lists", () => {
    const b = parseBlocks("- a\n  - a1\n  - a2\n- b\n\n1. one\n2. two")
    expect(b[0]).toMatchObject({ t: "list", ordered: false })
    const ul = b[0] as any
    expect(ul.items).toHaveLength(2)
    expect(ul.items[0].children[1]).toMatchObject({ t: "list" })
    expect(ul.items[0].children[1].items).toHaveLength(2)
    expect(b[1]).toMatchObject({ t: "list", ordered: true, start: 1 })
  })

  it("parses task lists and ordered start numbers", () => {
    const b = parseBlocks("3. three\n4. four\n\n- [x] done\n- [ ] todo") as any[]
    expect(b[0].start).toBe(3)
    expect(b[1].items.map((i: any) => i.task)).toEqual([true, false])
  })

  it("parses GFM tables with alignment and escaped pipes", () => {
    const b = parseBlocks("| a | b |\n|:--|--:|\n| 1 | x \\| y |\n| `c|d` | 3 |") as any[]
    expect(b[0].t).toBe("table")
    expect(b[0].align).toEqual(["left", "right"])
    expect(b[0].rows[0]).toEqual(["1", "x | y"])
    expect(b[0].rows[1][0]).toBe("`c|d`")
  })

  it("parses inline styles", () => {
    const i = parseInline("**bold** and *it* and `code` and ~~gone~~ and snake_case_name")
    expect(i.map((x) => x.t)).toEqual(["strong", "text", "em", "text", "code", "text", "del", "text"])
    expect((i[7] as any).v).toContain("snake_case_name")
  })

  it("detects file paths in inline code", () => {
    const i = parseInline("see `src/lib/markdown.ts:12` and `npm run build`") as any[]
    expect(i[1]).toMatchObject({ t: "code", path: true })
    expect(i[3]).toMatchObject({ t: "code", path: false })
  })

  it("autolinks bare urls without trailing punctuation", () => {
    const i = parseInline("go to https://example.com/a_b. Then") as any[]
    expect(i[1]).toMatchObject({ t: "link", href: "https://example.com/a_b" })
  })
})

describe("markdown safety", () => {
  it("rejects dangerous hrefs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull()
    expect(safeHref("java\tscript:alert(1)")).toBeNull()
    expect(safeHref(" javascript:alert(1)")).toBeNull()
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(safeHref("vbscript:x")).toBeNull()
    expect(safeHref("/relative")).toBeNull()
    expect(safeHref("https://ok.example")).toBe("https://ok.example")
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c")
  })

  it("renders raw HTML as text, never as elements", () => {
    const c = html('<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned=2">\n\n**<b>hi</b>**')
    expect(c.querySelector("script")).toBeNull()
    expect(c.querySelector("img")).toBeNull()
    expect(c.querySelector("b")).toBeNull()
    expect(c.textContent).toContain("<script>window.__pwned = 1</script>")
    expect((window as any).__pwned).toBeUndefined()
  })

  it("does not create javascript: links", () => {
    const c = html("[click](javascript:alert(1)) and [ok](https://example.com) and <javascript:alert(2)>")
    const links = Array.from(c.querySelectorAll("a"))
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute("href")).toBe("https://example.com")
    expect(links[0].getAttribute("target")).toBe("_blank")
    expect(links[0].getAttribute("rel")).toContain("noopener")
    expect(c.textContent).toContain("click")
  })

  it("does not load remote images", () => {
    const c = html("![tracker](https://evil.example/p.png)")
    expect(c.querySelector("img")).toBeNull()
    expect(c.querySelector("a")?.textContent).toBe("image: tracker")
  })

  it("renders code blocks with a language label and copy button", () => {
    const c = html("```bash\necho <hi>\n```")
    expect(c.querySelector(".md-code-lang")?.textContent).toBe("bash")
    expect(c.querySelector("pre code")?.textContent).toBe("echo <hi>")
    expect(c.querySelector(".copy-btn")).not.toBeNull()
  })

  it("renders tables and nested lists", () => {
    const c = html("| h1 | h2 |\n|---|---|\n| a | **b** |\n\n- one\n  - two")
    expect(c.querySelectorAll("th")).toHaveLength(2)
    expect(c.querySelector("td strong")?.textContent).toBe("b")
    expect(c.querySelector("ul ul li")?.textContent).toBe("two")
  })

  it("survives pathological input", () => {
    const evil = "*".repeat(5000) + "[".repeat(2000) + "`".repeat(3000) + "_a_".repeat(2000)
    const t0 = Date.now()
    parseBlocks(evil).forEach((b) => b.t === "p" && parseInline(b.text))
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})
