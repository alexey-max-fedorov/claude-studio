/*
 * One-line summaries for tool calls, shown in collapsed tool rows and permission cards.
 */

export interface ToolSummary {
  /** Short display name ("Bash", "Read", "github: create_issue"). */
  label: string
  /** The interesting argument, single line. May be "". */
  detail: string
  /** Icon key for the row. */
  icon: ToolIcon
}

export type ToolIcon = "terminal" | "file" | "edit" | "search" | "globe" | "agent" | "list" | "plug" | "question" | "tool"

const MAX_DETAIL = 240

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function clip(s: string, n = MAX_DETAIL): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

/** Make an absolute path relative to the project dir (or ~ for home) when possible. */
export function relPath(p: string, projectDir?: string): string {
  if (!p) return p
  if (projectDir) {
    const base = projectDir.replace(/\/+$/, "")
    if (base && (p === base || p === base + "/")) return "."
    if (base && p.startsWith(base + "/")) return p.slice(base.length + 1)
  }
  const home = p.match(/^\/Users\/[^/]+(?=\/|$)/) || p.match(/^\/home\/[^/]+(?=\/|$)/)
  if (home) return "~" + p.slice(home[0].length)
  return p
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined
}

export function firstStringArg(input: Record<string, unknown> | undefined): string {
  if (!input) return ""
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.trim()) return v
  }
  return ""
}

export function summarizeTool(name: string, input: Record<string, unknown> = {}, projectDir?: string): ToolSummary {
  const path = (v: unknown) => (str(v) ? relPath(v as string, projectDir) : "")
  let label = name
  let detail = ""
  let icon: ToolIcon = "tool"

  if (name.startsWith("mcp__")) {
    const parts = name.slice(5).split("__")
    const tool = parts.length > 1 ? parts.pop()! : parts[0]
    const server = parts.join("__").replace(/^plugin_[^_]+_/, "") || "mcp"
    label = `${server}: ${tool}`
    detail = firstStringArg(input)
    icon = "plug"
    return { label, detail: clip(oneLine(detail)), icon }
  }

  switch (name) {
    case "Bash":
    case "BashOutput":
    case "KillShell":
    case "KillBash":
      icon = "terminal"
      detail = str(input.command) ?? str(input.bash_id) ?? str(input.shell_id) ?? firstStringArg(input)
      break
    case "Read":
      icon = "file"
      detail = path(input.file_path)
      if (typeof input.offset === "number") detail += `:${input.offset}`
      break
    case "Edit":
    case "MultiEdit":
    case "Write":
      icon = "edit"
      detail = path(input.file_path)
      break
    case "NotebookEdit":
    case "NotebookRead":
      icon = "edit"
      detail = path(input.notebook_path ?? input.file_path)
      break
    case "Grep": {
      icon = "search"
      detail = str(input.pattern) ?? ""
      const where = path(input.path) || str(input.glob) || ""
      if (where) detail += `  in ${where}`
      break
    }
    case "Glob": {
      icon = "search"
      detail = str(input.pattern) ?? ""
      const where = path(input.path)
      if (where) detail += `  in ${where}`
      break
    }
    case "LS":
      icon = "file"
      detail = path(input.path)
      break
    case "WebFetch":
      icon = "globe"
      detail = str(input.url) ?? ""
      break
    case "WebSearch":
      icon = "globe"
      detail = str(input.query) ?? ""
      break
    case "Task":
    case "Agent": {
      icon = "agent"
      detail = str(input.description) ?? str(input.prompt) ?? ""
      const type = str(input.subagent_type)
      if (type) label = `${name} (${type})`
      break
    }
    case "TodoWrite": {
      icon = "list"
      const todos = Array.isArray(input.todos) ? (input.todos as any[]) : []
      const done = todos.filter((t) => t?.status === "completed").length
      detail = `${todos.length} todo${todos.length === 1 ? "" : "s"}, ${done} done`
      break
    }
    case "AskUserQuestion": {
      icon = "question"
      const qs = Array.isArray(input.questions) ? (input.questions as any[]) : []
      detail = str(qs[0]?.question) ?? ""
      break
    }
    case "Skill":
      icon = "tool"
      detail = str(input.skill) ?? str(input.command) ?? firstStringArg(input)
      break
    default:
      detail = firstStringArg(input)
  }
  return { label, detail: clip(oneLine(detail)), icon }
}
