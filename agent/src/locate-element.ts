import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { ElementSelection } from "@claude-studio/protocol"

export interface SourceLocation { file: string; line: number; snippet: string }

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "out", "coverage", ".cache"])
const EXT = new Set([".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte", ".astro", ".html", ".htm", ".mdx", ".php", ".erb", ".hbs"])
const MAX_FILES = 4000
const MAX_FILE_BYTES = 512 * 1024
const MAX_HITS = 5

/** Distinctive, low-noise signals to search for, strongest first. */
function signals(el: ElementSelection): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(el.attributes)) {
    if (/^(data-|aria-label|name|href|alt|placeholder|title)/.test(k) && v && v.length >= 3) out.push(v)
  }
  if (el.id && el.id.length >= 3 && !/^[0-9]/.test(el.id)) out.push(el.id)
  const text = el.textContent.trim()
  if (text.length >= 4) out.push(text.length > 60 ? text.slice(0, 60) : text)
  for (const c of el.classList) {
    // skip utility/atomic classes (tailwind-ish) — too noisy to locate by
    if (c.length >= 6 && !/^(p|m|w|h|text|bg|flex|grid|gap|rounded|border|items|justify|space|font|leading|tracking)[-:]/.test(c)) out.push(c)
  }
  // de-dup, keep order, cap
  return [...new Set(out)].slice(0, 6)
}

function walk(root: string, dir: string, files: string[]): void {
  if (files.length >= MAX_FILES) return
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (files.length >= MAX_FILES) return
    if (IGNORE_DIRS.has(name) || name.startsWith(".")) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(root, full, files)
    else if (EXT.has(name.slice(name.lastIndexOf(".")).toLowerCase()) && st.size <= MAX_FILE_BYTES) files.push(full)
  }
}

/** Best-effort grep of the project for where the selected element is defined. */
export function locateElement(projectDir: string, el: ElementSelection): SourceLocation[] {
  if (!projectDir) return []
  const needles = signals(el)
  if (needles.length === 0) return []
  const files: string[] = []
  walk(projectDir, projectDir, files)
  const hits: SourceLocation[] = []
  const seen = new Set<string>()
  for (const needle of needles) {            // strongest signal first
    for (const file of files) {
      let content: string
      try { content = readFileSync(file, "utf-8") } catch { continue }
      const idx = content.indexOf(needle)
      if (idx === -1) continue
      const line = content.slice(0, idx).split("\n").length
      const key = `${file}:${line}`
      if (seen.has(key)) continue
      seen.add(key)
      const snippet = content.split("\n")[line - 1]?.trim().slice(0, 120) ?? ""
      hits.push({ file: relative(projectDir, file), line, snippet })
      if (hits.length >= MAX_HITS) return hits
    }
    if (hits.length >= MAX_HITS) break
  }
  return hits
}
