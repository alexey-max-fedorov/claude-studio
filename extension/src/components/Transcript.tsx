import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { AttachmentSummary } from "@claude-studio/protocol"
import { buildView, type PermissionRequest, type Row, type RunStatus, type ViewRow } from "../lib/transcript"
import { formatCount, formatDuration, totalTokens } from "../lib/format"
import { CopyButton } from "./CopyButton"
import { Icon } from "./Icons"
import { Markdown } from "./Markdown"
import { AskQuestionCard, PermissionCard, type PermissionReply } from "./PermissionCard"
import { ToolCall } from "./ToolCall"

export const ATTACHMENT_ICONS: Record<AttachmentSummary["type"], string> = {
  page: "link",
  selection: "selection",
  page_text: "doc",
  screenshot: "camera",
  element: "target",
}

function UserMessage({ row, onRetry, onEdit }: { row: Extract<Row, { kind: "user" }>; onRetry?: (nonce: string) => void; onEdit?: (nonce: string) => void }) {
  const [more, setMore] = useState(false)
  const long = row.text.length > 1400
  return (
    <div className={`msg-user ${row.local ? "is-local" : ""} ${row.failed ? "is-failed" : ""}`}>
      {row.text ? <div className="msg-user-text">{long && !more ? row.text.slice(0, 1400) + "…" : row.text}</div> : null}
      {long ? (
        <button type="button" className="linkish" onClick={() => setMore((v) => !v)}>
          {more ? "Show less" : "Show more"}
        </button>
      ) : null}
      {row.attachments.length ? (
        <div className="chips">
          {row.attachments.map((a, i) => (
            <span key={i} className="chip chip-static" title={a.label}>
              <Icon name={ATTACHMENT_ICONS[a.type] ?? "file"} size={11} />
              <span className="chip-label">{a.label}</span>
            </span>
          ))}
        </div>
      ) : null}
      {row.failed && row.nonce ? (
        <div className="msg-failed">
          <Icon name="alert" size={11} />
          <span>Not confirmed by the agent.</span>
          <button type="button" className="linkish" onClick={() => onRetry?.(row.nonce!)}>
            Retry
          </button>
          <button type="button" className="linkish" onClick={() => onEdit?.(row.nonce!)}>
            Edit
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Thinking({ row }: { row: Extract<Row, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false)
  const first = row.text.trim().split("\n")[0] ?? ""
  return (
    <div className="think">
      <button type="button" className="think-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "chevronDown" : "chevron"} size={10} />
        <span className="think-k">{row.streaming ? "Thinking" : "Thought"}</span>
        {!open ? <span className="think-preview">{first}</span> : null}
      </button>
      {open ? <div className="think-body">{row.text}</div> : null}
    </div>
  )
}

function ResultFoot({ row }: { row: Extract<Row, { kind: "result" }> }) {
  const u = row.usage
  const tip = u
    ? [
        `Input ${u.input_tokens?.toLocaleString() ?? 0}`,
        `Output ${u.output_tokens?.toLocaleString() ?? 0}`,
        `Cache read ${u.cache_read_input_tokens?.toLocaleString() ?? 0}`,
        `Cache write ${u.cache_creation_input_tokens?.toLocaleString() ?? 0}`,
        `API-equivalent cost $${(row.costUsd ?? 0).toFixed(2)} (covered by the Max plan)`,
      ].join("\n")
    : undefined
  return (
    <div className={`turn-foot ${row.isError ? "is-error" : ""}`} title={tip}>
      {row.isError ? (
        <span className="turn-err">
          <Icon name="alert" size={11} /> {row.errorText || "Turn ended with an error"}
        </span>
      ) : null}
      <span>{formatDuration(row.durationMs)}</span>
      <span>
        {row.turns} turn{row.turns === 1 ? "" : "s"}
      </span>
      <span>{formatCount(u ? (u.input_tokens || 0) + (u.output_tokens || 0) : 0)} tok</span>
      {u && u.cache_read_input_tokens ? <span className="dim">{formatCount(totalTokens(u))} with cache</span> : null}
    </div>
  )
}

function Working({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="working" aria-live="polite">
      <span className="spin" />
      <span>Working</span>
      <span className="dim">{formatDuration(Math.max(0, now - since))}</span>
      <span className="dim working-hint">Esc to stop</span>
    </div>
  )
}

interface Props {
  rows: Row[]
  status: RunStatus
  permissions: PermissionRequest[]
  projectDir?: string
  runningSince: number | null
  empty: React.ReactNode
  onPermission: (req: PermissionRequest, r: PermissionReply) => boolean
  onRetry?: (nonce: string) => void
  onEdit?: (nonce: string) => void
}

function renderRow(r: ViewRow, props: Props, running: boolean) {
  switch (r.kind) {
    case "user":
      return <UserMessage key={r.id} row={r} onRetry={props.onRetry} onEdit={props.onEdit} />
    case "assistant":
      return (
        <div key={r.id} className="msg-assistant">
          <Markdown text={r.text} caret={r.streaming} />
          {!r.streaming && r.text ? <CopyButton className="msg-copy" text={r.text} /> : null}
        </div>
      )
    case "thinking":
      return <Thinking key={r.id} row={r} />
    case "tool":
      return <ToolCall key={r.id} node={r} projectDir={props.projectDir} running={running} />
    case "orphan_result":
      return (
        <div key={r.id} className={`tool tool-${r.isError ? "err" : "ok"}`}>
          <pre className={`tool-pre ${r.isError ? "err" : ""}`}>{r.text.slice(0, 4000)}</pre>
        </div>
      )
    case "result":
      return <ResultFoot key={r.id} row={r} />
    case "error":
      return (
        <div key={r.id} className="row-error">
          <Icon name="alert" size={12} />
          <span>{r.text}</span>
        </div>
      )
    case "system":
      return (
        <div key={r.id} className="row-system">
          {r.text}
        </div>
      )
  }
}

export function Transcript(props: Props) {
  const { rows, status, permissions, runningSince } = props
  const view = useMemo(() => buildView(rows), [rows])
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const running = status !== "idle"

  const emptyRef = useRef(false)

  const onScroll = () => {
    const el = scroller.current
    if (!el || emptyRef.current) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    stick.current = atBottom
    setShowJump(!atBottom)
  }

  const isEmpty = rows.length === 0 && permissions.length === 0 && !running

  useLayoutEffect(() => {
    const el = scroller.current
    emptyRef.current = isEmpty
    if (!el) return
    if (isEmpty) {
      // The empty state reads top-down; the first real row re-pins to the bottom.
      el.scrollTop = 0
      stick.current = true
    } else if (stick.current) el.scrollTop = el.scrollHeight
  })

  // Keep pinned to bottom when content grows without a React update (images, details toggles).
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === "undefined") return
    const inner = el.firstElementChild
    if (!inner) return
    const ro = new ResizeObserver(() => {
      if (stick.current) {
        el.scrollTop = el.scrollHeight
        setShowJump(false)
      }
    })
    ro.observe(inner)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const jump = () => {
    const el = scroller.current
    if (!el) return
    stick.current = true
    el.scrollTop = el.scrollHeight
    setShowJump(false)
  }

  return (
    <div className="log-wrap">
      <div className="log" ref={scroller} onScroll={onScroll}>
        <div className="log-inner">
          {isEmpty ? props.empty : null}
          {view.map((r) => renderRow(r, props, running))}
          {permissions.map((p) =>
            p.toolName === "AskUserQuestion" ? (
              <AskQuestionCard key={p.requestId} req={p} projectDir={props.projectDir} onReply={(r) => props.onPermission(p, r)} />
            ) : (
              <PermissionCard key={p.requestId} req={p} projectDir={props.projectDir} onReply={(r) => props.onPermission(p, r)} />
            ),
          )}
          {running && permissions.length === 0 ? <Working since={runningSince ?? Date.now()} /> : null}
        </div>
      </div>
      {showJump && !isEmpty ? (
        <button type="button" className="jump" onClick={jump}>
          <Icon name="arrowDown" size={12} /> Latest
        </button>
      ) : null}
    </div>
  )
}
