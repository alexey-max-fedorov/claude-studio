/*
 * Small, dependency-free Markdown parser (GFM subset) producing a plain AST.
 * The renderer (components/Markdown.tsx) turns the AST into React elements, so no
 * HTML string is ever injected: raw HTML in the source renders as literal text.
 * Links are kept only for http(s) and mailto URLs.
 */

export type Align = "left" | "center" | "right" | null

export type Block =
  | { t: "p"; text: string }
  | { t: "h"; level: number; text: string }
  | { t: "code"; lang: string; text: string; open: boolean }
  | { t: "hr" }
  | { t: "quote"; children: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "table"; align: Align[]; head: string[]; rows: string[][] }

export interface ListItem {
  task: boolean | null
  children: Block[]
}

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string; path: boolean }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "del"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" }

// ---------------------------------------------------------------------------
// Blocks

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE_RE = /^ {0,3}>\s?(.*)$/
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/
const LIST_EMPTY_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s*$/

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function isBlank(line: string): boolean {
  return line.trim() === ""
}

export function isTableDelimiter(line: string): boolean {
  return line.includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)
}

export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith("|")) s = s.slice(1)
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ""
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|"
      i++
      continue
    }
    if (ch === "`") inCode = !inCode
    if (ch === "|" && !inCode) {
      cells.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line) ||
    (line.includes("|") && next !== undefined && isTableDelimiter(next))
  )
}

function parseList(lines: string[], start: number): { block: Block; end: number } {
  const first = lines[start].match(LIST_RE) || lines[start].match(LIST_EMPTY_RE)!
  const base = first[1].length
  const ordered = /\d/.test(first[2])
  const items: { lines: string[] }[] = []
  let i = start
  let contentIndent = 0
  let sawBlank = false

  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(LIST_RE) || line.match(LIST_EMPTY_RE)
    const ind = indentOf(line)
    if (m && ind >= base && ind <= base + 3 && /\d/.test(m[2]) === ordered && (ind < contentIndent || items.length === 0 || ind === base)) {
      const spaces = (m[3] ?? " ").length
      contentIndent = ind + m[2].length + Math.min(spaces, 4)
      items.push({ lines: [m[4] ?? ""] })
      sawBlank = false
      i++
      continue
    }
    if (isBlank(line)) {
      // A blank line continues the item only if the next non-blank line is indented into it.
      let j = i + 1
      while (j < lines.length && isBlank(lines[j])) j++
      if (j < lines.length && (indentOf(lines[j]) > base || (lines[j].match(LIST_RE) && indentOf(lines[j]) === base))) {
        items[items.length - 1].lines.push("")
        sawBlank = true
        i++
        continue
      }
      break
    }
    if (ind > base) {
      items[items.length - 1].lines.push(line.slice(Math.min(ind, contentIndent)))
      i++
      continue
    }
    // Lazy paragraph continuation (unindented line right after item text).
    if (!sawBlank && !startsBlock(line, lines[i + 1])) {
      items[items.length - 1].lines.push(line.trimStart())
      i++
      continue
    }
    break
  }

  const startNum = ordered ? parseInt(first[2], 10) : 1
  return {
    block: {
      t: "list",
      ordered,
      start: Number.isFinite(startNum) ? startNum : 1,
      items: items.map((it) => {
        let task: boolean | null = null
        const tm = it.lines[0].match(/^\[([ xX])\]\s+(.*)$/)
        if (tm) {
          task = tm[1] !== " "
          it.lines[0] = tm[2]
        }
        return { task, children: parseBlocks(it.lines) }
      }),
    },
    end: i,
  }
}

export function parseBlocks(input: string | string[]): Block[] {
  const lines = typeof input === "string" ? input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n") : input
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isBlank(line)) {
      i++
      continue
    }

    const fence = line.match(FENCE_RE)
    if (fence) {
      const indent = fence[1].length
      const marker = fence[2]
      const body: string[] = []
      let j = i + 1
      let closed = false
      while (j < lines.length) {
        const l = lines[j]
        const t = l.trim()
        if (t.startsWith(marker[0].repeat(marker.length)) && /^([`~])\1*$/.test(t) && t[0] === marker[0]) {
          closed = true
          break
        }
        body.push(indent ? l.replace(new RegExp(`^ {0,${indent}}`), "") : l)
        j++
      }
      out.push({ t: "code", lang: fence[3] || "", text: body.join("\n"), open: !closed })
      i = closed ? j + 1 : j
      continue
    }

    const h = line.match(HEADING_RE)
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2] ?? "" })
      i++
      continue
    }

    if (HR_RE.test(line)) {
      out.push({ t: "hr" })
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].match(QUOTE_RE)![1])
        i++
      }
      out.push({ t: "quote", children: parseBlocks(body) })
      continue
    }

    if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const head = splitRow(line)
      const align: Align[] = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(":")
        const r = c.endsWith(":")
        return l && r ? "center" : r ? "right" : l ? "left" : null
      })
      const rows: string[][] = []
      i += 2
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]))
        i++
      }
      out.push({ t: "table", align, head, rows })
      continue
    }

    if (LIST_RE.test(line) || (LIST_EMPTY_RE.test(line) && !HR_RE.test(line))) {
      const r = parseList(lines, i)
      out.push(r.block)
      i = r.end
      continue
    }

    // Paragraph
    const para: string[] = [line.trim()]
    i++
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) {
      para.push(lines[i].trim())
      i++
    }
    out.push({ t: "p", text: para.join("\n") })
  }
  return out
}

// ---------------------------------------------------------------------------
// Inline

const SAFE_URL_RE = /^(https?:\/\/|mailto:)/i
const PATH_RE = /^(~|\.{1,2})?\/?[\w@.+-]+(\/[\w@.+\-()[\] ]*)+(:\d+(-\d+)?)?$|^[\w@.+-]+\.[a-zA-Z0-9]{1,8}(:\d+(-\d+)?)?$/

/** Only http(s) and mailto URLs become links. Everything else (javascript:, data:, vbscript:, relative) is rejected. */
export function safeHref(raw: string): string | null {
  // Strip control chars and whitespace browsers ignore inside schemes ("java\tscript:").
  const url = raw.replace(/[\u0000- \u007f-\u009f]/g, "")
  if (!SAFE_URL_RE.test(url)) return null
  return url
}

export function looksLikePath(s: string): boolean {
  if (s.length > 200 || /\s{2,}/.test(s) || s.includes("://")) return false
  return PATH_RE.test(s) && /[/.]/.test(s)
}

function pushText(out: Inline[], v: string) {
  if (!v) return
  const last = out[out.length - 1]
  if (last && last.t === "text") last.v += v
  else out.push({ t: "text", v })
}

const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

function findClosing(s: string, from: number, delim: string): number {
  let i = from
  while (i < s.length) {
    const ch = s[i]
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "`") {
      // skip code spans
      let run = 1
      while (s[i + run] === "`") run++
      const close = s.indexOf("`".repeat(run), i + run)
      if (close < 0) {
        i += run
        continue
      }
      i = close + run
      continue
    }
    if (s.startsWith(delim, i)) {
      // single-char delimiters must not be part of a double run
      if (delim.length === 1 && (s[i + 1] === delim || s[i - 1] === delim)) {
        i += 2
        continue
      }
      if (i > from && !/\s/.test(s[i - 1])) return i
    }
    i++
  }
  return -1
}

function findLinkEnd(s: string, open: number): { textEnd: number; urlStart: number; urlEnd: number } | null {
  // s[open] === "["
  let depth = 0
  let i = open
  for (; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) break
    }
  }
  if (i >= s.length || s[i + 1] !== "(") return null
  let j = i + 2
  let pd = 1
  for (; j < s.length; j++) {
    if (s[j] === "(") pd++
    else if (s[j] === ")") {
      pd--
      if (pd === 0) break
    } else if (s[j] === "\n") return null
  }
  if (j >= s.length) return null
  return { textEnd: i, urlStart: i + 2, urlEnd: j }
}

export function parseInline(s: string, depth = 0): Inline[] {
  const out: Inline[] = []
  if (depth > 12) {
    pushText(out, s)
    return out
  }
  let i = 0
  let buf = ""
  const flush = () => {
    pushText(out, buf)
    buf = ""
  }
  while (i < s.length) {
    const ch = s[i]

    if (ch === "\\" && i + 1 < s.length && PUNCT.includes(s[i + 1])) {
      buf += s[i + 1]
      i += 2
      continue
    }

    if (ch === "\n") {
      flush()
      out.push({ t: "br" })
      i++
      continue
    }

    if (ch === "`") {
      let run = 1
      while (s[i + run] === "`") run++
      const close = s.indexOf("`".repeat(run), i + run)
      if (close > 0 && s[close + run] !== "`") {
        flush()
        let v = s.slice(i + run, close)
        if (v.startsWith(" ") && v.endsWith(" ") && v.trim()) v = v.slice(1, -1)
        out.push({ t: "code", v, path: looksLikePath(v) })
        i = close + run
        continue
      }
      buf += "`".repeat(run)
      i += run
      continue
    }

    if (ch === "*" || ch === "_" || ch === "~") {
      const dbl = s[i + 1] === ch
      if (ch === "~" && !dbl) {
        buf += ch
        i++
        continue
      }
      // "_" only opens at a word boundary (snake_case stays literal)
      if (ch === "_" && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1])) {
        buf += dbl ? "__" : "_"
        i += dbl ? 2 : 1
        continue
      }
      const delim = dbl ? ch + ch : ch
      const innerStart = i + delim.length
      if (innerStart < s.length && !/\s/.test(s[innerStart])) {
        const close = findClosing(s, innerStart, delim)
        if (close > innerStart && !(ch === "_" && /[\p{L}\p{N}]/u.test(s[close + delim.length] ?? ""))) {
          flush()
          const c = parseInline(s.slice(innerStart, close), depth + 1)
          out.push(ch === "~" ? { t: "del", c } : dbl ? { t: "strong", c } : { t: "em", c })
          i = close + delim.length
          continue
        }
      }
      buf += delim
      i += delim.length
      continue
    }

    if (ch === "!" && s[i + 1] === "[") {
      const l = findLinkEnd(s, i + 1)
      if (l) {
        flush()
        const alt = s.slice(i + 2, l.textEnd)
        const href = safeHref(s.slice(l.urlStart, l.urlEnd).trim().split(/\s+/)[0] ?? "")
        const label: Inline[] = [{ t: "text", v: `image: ${alt || "untitled"}` }]
        if (href) out.push({ t: "link", href, c: label })
        else out.push(...label)
        i = l.urlEnd + 1
        continue
      }
    }

    if (ch === "[") {
      const l = findLinkEnd(s, i)
      if (l) {
        flush()
        const text = s.slice(i + 1, l.textEnd)
        const rawUrl = s.slice(l.urlStart, l.urlEnd).trim().replace(/^<|>$/g, "").split(/\s+/)[0] ?? ""
        const href = safeHref(rawUrl)
        const c = parseInline(text, depth + 1)
        if (href) out.push({ t: "link", href, c })
        else out.push(...c)
        i = l.urlEnd + 1
        continue
      }
    }

    if (ch === "<") {
      const m = s.slice(i).match(/^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i)
      if (m) {
        flush()
        const href = safeHref(m[1])
        if (href) out.push({ t: "link", href, c: [{ t: "text", v: m[1] }] })
        else pushText(out, m[0])
        i += m[0].length
        continue
      }
    }

    if ((ch === "h" || ch === "H") && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const m = s.slice(i).match(/^https?:\/\/[^\s<>"'`]+/i)
      if (m) {
        let url = m[0]
        while (/[.,;:!?)\]}*_]$/.test(url)) {
          if (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) break
          url = url.slice(0, -1)
        }
        const href = safeHref(url)
        if (href) {
          flush()
          out.push({ t: "link", href, c: [{ t: "text", v: url }] })
          i += url.length
          continue
        }
      }
    }

    buf += ch
    i++
  }
  flush()
  return out
}
