import React, { useState } from "react"
import type { ToolNode } from "../lib/transcript"
import { relPath, summarizeTool } from "../lib/tool-summary"
import { Icon } from "./Icons"

const RESULT_PREVIEW = 6000

function Spinner() {
  return <span className="spin" aria-label="Running" />
}

function Pre({ text, className }: { text: string; className?: string }) {
  return <pre className={`tool-pre ${className ?? ""}`}>{text}</pre>
}

function Diff({ oldText, newText }: { oldText: string; newText: string }) {
  const del = oldText ? oldText.split("\n") : []
  const add = newText ? newText.split("\n") : []
  return (
    <pre className="tool-pre diff">
      {del.map((l, i) => (
        <div key={`d${i}`} className="diff-del">
          {"- " + l}
        </div>
      ))}
      {add.map((l, i) => (
        <div key={`a${i}`} className="diff-add">
          {"+ " + l}
        </div>
      ))}
    </pre>
  )
}

function json(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** Tool-specific view of the input. Returns null to fall back to raw JSON. */
function InputView({ name, input, projectDir }: { name: string; input: Record<string, unknown>; projectDir?: string }) {
  switch (name) {
    case "Bash":
      return (
        <>
          {str(input.description) ? <div className="tool-note">{str(input.description)}</div> : null}
          <Pre text={"$ " + str(input.command)} className="cmd" />
        </>
      )
    case "Edit":
      return (
        <>
          <div className="tool-note mono">{relPath(str(input.file_path), projectDir)}{input.replace_all ? "  (replace all)" : ""}</div>
          <Diff oldText={str(input.old_string)} newText={str(input.new_string)} />
        </>
      )
    case "MultiEdit": {
      const edits = Array.isArray(input.edits) ? (input.edits as any[]) : []
      return (
        <>
          <div className="tool-note mono">{relPath(str(input.file_path), projectDir)}</div>
          {edits.map((e, i) => (
            <Diff key={i} oldText={str(e?.old_string)} newText={str(e?.new_string)} />
          ))}
        </>
      )
    }
    case "Write": {
      const content = str(input.content)
      return (
        <>
          <div className="tool-note mono">
            {relPath(str(input.file_path), projectDir)}, {content.split("\n").length} lines
          </div>
          <Pre text={content.length > RESULT_PREVIEW ? content.slice(0, RESULT_PREVIEW) + "\n…" : content} />
        </>
      )
    }
    case "TodoWrite": {
      const todos = Array.isArray(input.todos) ? (input.todos as any[]) : []
      return (
        <ul className="todos">
          {todos.map((t, i) => (
            <li key={i} className={`todo todo-${t?.status ?? "pending"}`}>
              <span className="todo-box">{t?.status === "completed" ? <Icon name="check" size={10} /> : null}</span>
              {str(t?.content) || str(t?.activeForm)}
            </li>
          ))}
        </ul>
      )
    }
    case "Task":
    case "Agent":
      return str(input.prompt) ? <Pre text={str(input.prompt)} className="prose" /> : null
    default:
      return null
  }
}

function ResultView({ text, isError }: { text: string; isError: boolean }) {
  const [all, setAll] = useState(false)
  const long = text.length > RESULT_PREVIEW
  const shown = long && !all ? text.slice(0, RESULT_PREVIEW) : text
  return (
    <div className="tool-sec">
      <div className="tool-sec-k">{isError ? "Error" : "Result"}</div>
      <Pre text={shown || "(empty)"} className={isError ? "err" : undefined} />
      {long ? (
        <button type="button" className="linkish" onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show all, ${text.length.toLocaleString()} chars`}
        </button>
      ) : null}
    </div>
  )
}

export function ToolCall({ node, projectDir, running }: { node: ToolNode; projectDir?: string; running: boolean }) {
  const [open, setOpen] = useState(false)
  const [kidsOpen, setKidsOpen] = useState<boolean | null>(null)
  const s = summarizeTool(node.name, node.input, projectDir)
  const status = node.result ? (node.result.isError ? "err" : "ok") : running ? "run" : "none"
  const special = InputView({ name: node.name, input: node.input, projectDir })
  const kids = node.children
  const showKids = kidsOpen ?? !node.result

  return (
    <div className={`tool tool-${status}`}>
      <button type="button" className="tool-row" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={s.detail || s.label}>
        <span className="tool-ic">
          <Icon name={s.icon} size={13} />
        </span>
        <span className="tool-name">{s.label}</span>
        <span className="tool-detail">{s.detail}</span>
        <span className="tool-status">
          {status === "run" ? <Spinner /> : status === "ok" ? <Icon name="check" size={12} /> : status === "err" ? <Icon name="x" size={12} /> : null}
        </span>
      </button>
      {open ? (
        <div className="tool-body">
          {special ? (
            <>
              {special}
              <details className="tool-json">
                <summary>Input JSON</summary>
                <Pre text={json(node.input)} />
              </details>
            </>
          ) : (
            <div className="tool-sec">
              <div className="tool-sec-k">Input</div>
              <Pre text={json(node.input)} />
            </div>
          )}
          {node.result ? <ResultView text={node.result.text} isError={node.result.isError} /> : <div className="tool-note">{running ? "Waiting for result" : "No result recorded"}</div>}
        </div>
      ) : null}
      {kids.length ? (
        <div className="tool-kids">
          <button type="button" className="kids-toggle" onClick={() => setKidsOpen(!showKids)}>
            <Icon name={showKids ? "chevronDown" : "chevron"} size={10} />
            {kids.length} subagent call{kids.length === 1 ? "" : "s"}
          </button>
          {showKids ? kids.map((k) => <ToolCall key={k.id} node={k} projectDir={projectDir} running={running} />) : null}
        </div>
      ) : null}
    </div>
  )
}
