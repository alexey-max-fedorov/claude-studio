import type { Attachment, AttachmentSummary, Usage } from "@claude-studio/protocol"

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  if (m < 60) return `${m}m ${rs}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function totalTokens(u: Usage | undefined): number {
  if (!u) return 0
  return (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/")
  return parts[parts.length - 1] || p
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

/** Short chip label for an attachment (also sent nowhere: the agent builds its own summaries). */
export function attachmentLabel(a: Attachment): string {
  const where = a.title ? clip(a.title, 48) : hostOf(a.url)
  switch (a.type) {
    case "page":
      return where
    case "selection":
      return `“${clip(a.text, 40)}”`
    case "page_text":
      return `${where}, ${formatCount(a.text.length)} chars`
    case "screenshot":
      return `Screenshot, ${hostOf(a.url)}`
    case "element": {
      const el = a.element
      const id = el.id ? `#${el.id}` : ""
      const cls = el.classList.length ? `.${el.classList.slice(0, 2).join(".")}` : ""
      return `<${el.tagName}${id}${cls}>`
    }
  }
}

export function summarizeAttachment(a: Attachment): AttachmentSummary {
  return { type: a.type, label: attachmentLabel(a) }
}

export const ATTACHMENT_NAMES: Record<Attachment["type"], string> = {
  page: "Page",
  selection: "Selection",
  page_text: "Page text",
  screenshot: "Screenshot",
  element: "Element",
}
