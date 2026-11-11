import React, { useEffect, useState } from "react"
import type { PermissionRequest } from "../lib/transcript"
import { relPath, summarizeTool } from "../lib/tool-summary"
import { Icon } from "./Icons"

export interface PermissionReply {
  behavior: "allow" | "deny"
  always?: boolean
  message?: string
  updatedInput?: Record<string, unknown>
}

interface Props {
  req: PermissionRequest
  projectDir?: string
  /** Returns false when the reply could not be sent; the card becomes usable again. */
  onReply: (r: PermissionReply) => boolean
}

/** Busy flag for a card: set while a reply is in flight, cleared on send failure or when the request is re-sent (reconnect). */
function useReplyBusy(req: PermissionRequest, onReply: (r: PermissionReply) => boolean) {
  const [busy, setBusy] = useState(false)
  useEffect(() => setBusy(false), [req])
  const reply = (r: PermissionReply) => {
    setBusy(true)
    if (!onReply(r)) setBusy(false)
  }
  return { busy, reply }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function Preview({ req, projectDir }: { req: PermissionRequest; projectDir?: string }) {
  const i = req.input ?? {}
  if (req.toolName === "Bash") return <pre className="perm-pre">{"$ " + str(i.command)}</pre>
  if (["Edit", "MultiEdit", "Write", "Read", "NotebookEdit"].includes(req.toolName)) {
    return <div className="perm-path mono">{relPath(str(i.file_path ?? i.notebook_path), projectDir)}</div>
  }
  if (req.toolName === "WebFetch") return <div className="perm-path mono">{str(i.url)}</div>
  let text = ""
  try {
    text = JSON.stringify(i, null, 2)
  } catch {
    text = String(i)
  }
  return <pre className="perm-pre">{text.length > 3000 ? text.slice(0, 3000) + "\n…" : text}</pre>
}

export function PermissionCard({ req, projectDir, onReply }: Props) {
  const { busy, reply } = useReplyBusy(req, onReply)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState("")
  const s = summarizeTool(req.toolName, req.input, projectDir)

  return (
    <div className="perm" role="group" aria-label="Permission request">
      <div className="perm-head">
        <span className="perm-k">
          <Icon name="lock" size={11} /> Permission
        </span>
        <span className="perm-tool mono">{s.label}</span>
      </div>
      <div className="perm-title">{req.title || `Allow ${s.label}?`}</div>
      <Preview req={req} projectDir={projectDir} />
      {req.blockedPath ? (
        <div className="perm-blocked">
          Outside allowed paths: <span className="mono">{relPath(req.blockedPath, projectDir)}</span>
        </div>
      ) : null}
      {reasonOpen ? (
        <input
          className="perm-reason"
          placeholder="Tell Claude why (optional)"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reply({ behavior: "deny", message: reason.trim() || undefined })
          }}
        />
      ) : null}
      <div className="perm-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => reply({ behavior: "allow" })}>
          Allow
        </button>
        {req.canAlwaysAllow ? (
          <button type="button" className="btn" disabled={busy} onClick={() => reply({ behavior: "allow", always: true })} title="Allow and remember for this session">
            Always allow
          </button>
        ) : null}
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => reply({ behavior: "deny", message: reason.trim() || undefined })}>
          Deny
        </button>
        {!reasonOpen ? (
          <button type="button" className="linkish" onClick={() => setReasonOpen(true)}>
            Add reason
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AskUserQuestion

interface QOption {
  label: string
  description?: string
  preview?: string
}
interface Question {
  question: string
  header?: string
  options: QOption[]
  multiSelect?: boolean
}

export function parseQuestions(input: Record<string, unknown>): Question[] {
  const qs = Array.isArray(input?.questions) ? (input.questions as any[]) : []
  return qs
    .filter((q) => q && typeof q.question === "string")
    .map((q) => ({
      question: q.question,
      header: typeof q.header === "string" ? q.header : undefined,
      multiSelect: !!q.multiSelect,
      options: (Array.isArray(q.options) ? q.options : [])
        .filter((o: any) => o && typeof o.label === "string")
        .map((o: any) => ({
          label: o.label,
          description: typeof o.description === "string" ? o.description : undefined,
          preview: typeof o.preview === "string" ? o.preview : undefined,
        })),
    }))
}

interface Answer {
  picked: string[]
  other: string
  otherOn: boolean
}

/** Build the answers map the SDK expects: { [question]: label | "a, b" | typed text }. */
export function buildAnswers(questions: Question[], answers: Answer[]): Record<string, string> {
  const out: Record<string, string> = {}
  questions.forEach((q, i) => {
    const a = answers[i]
    if (!a) return
    const parts = [...a.picked]
    if (a.otherOn && a.other.trim()) parts.push(a.other.trim())
    if (parts.length) out[q.question] = parts.join(", ")
  })
  return out
}

export function AskQuestionCard({ req, onReply }: Props) {
  const questions = parseQuestions(req.input)
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ picked: [], other: "", otherOn: false })))
  const { busy, reply } = useReplyBusy(req, onReply)

  const update = (i: number, fn: (a: Answer) => Answer) => setAnswers((prev) => prev.map((a, j) => (j === i ? fn(a) : a)))
  const result = buildAnswers(questions, answers)
  const complete = questions.length > 0 && questions.every((q) => result[q.question])

  const submit = () => {
    if (!complete || busy) return
    reply({ behavior: "allow", updatedInput: { ...req.input, answers: result } })
  }

  return (
    <div className="perm ask" role="group" aria-label="Claude has a question">
      <div className="perm-head">
        <span className="perm-k">
          <Icon name="question" size={11} /> Question
        </span>
      </div>
      {questions.map((q, i) => {
        const a = answers[i]
        return (
          <fieldset key={i} className="ask-q" disabled={busy}>
            <legend className="ask-text">
              {q.header ? <span className="ask-h">{q.header}</span> : null}
              {q.question}
            </legend>
            <div className="ask-opts">
              {q.options.map((o) => {
                const on = a.picked.includes(o.label)
                return (
                  <label key={o.label} className={`ask-opt ${on ? "on" : ""}`}>
                    <input
                      type={q.multiSelect ? "checkbox" : "radio"}
                      name={`q${req.requestId}-${i}`}
                      checked={on}
                      onChange={() =>
                        update(i, (prev) =>
                          q.multiSelect
                            ? { ...prev, picked: on ? prev.picked.filter((p) => p !== o.label) : [...prev.picked, o.label] }
                            : { ...prev, picked: [o.label], otherOn: false },
                        )
                      }
                    />
                    <span className="ask-opt-body">
                      <span className="ask-label">{o.label}</span>
                      {o.description ? <span className="ask-desc">{o.description}</span> : null}
                      {o.preview && on ? <pre className="ask-preview">{o.preview}</pre> : null}
                    </span>
                  </label>
                )
              })}
              <label className={`ask-opt ${a.otherOn ? "on" : ""}`}>
                <input
                  type={q.multiSelect ? "checkbox" : "radio"}
                  name={`q${req.requestId}-${i}`}
                  checked={a.otherOn}
                  onChange={() => update(i, (prev) => (q.multiSelect ? { ...prev, otherOn: !prev.otherOn } : { ...prev, picked: [], otherOn: true }))}
                />
                <span className="ask-opt-body">
                  <span className="ask-label">Other</span>
                  {a.otherOn ? (
                    <input
                      className="ask-other"
                      autoFocus
                      placeholder="Type your answer"
                      value={a.other}
                      onChange={(e) => update(i, (prev) => ({ ...prev, other: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submit()
                      }}
                    />
                  ) : null}
                </span>
              </label>
            </div>
          </fieldset>
        )
      })}
      <div className="perm-actions">
        <button type="button" className="btn btn-primary" disabled={!complete || busy} onClick={submit}>
          Answer
        </button>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => reply({ behavior: "deny", message: "The user dismissed the question." })}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
