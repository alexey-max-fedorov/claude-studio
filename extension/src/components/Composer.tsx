import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Attachment, SlashCommand } from "@claude-studio/protocol"
import { attachmentLabel, formatBytes, formatCount } from "../lib/format"
import { Icon } from "./Icons"
import { ATTACHMENT_ICONS } from "./Transcript"
import { AttachmentPreview, screenshotSource } from "./AttachmentPreview"

export type CaptureKind = "page" | "selection" | "page_text" | "screenshot" | "element"

const ATTACH_BUTTONS: { kind: CaptureKind; icon: string; tip: string }[] = [
  { kind: "page", icon: "link", tip: "Attach this page (URL and title)" },
  { kind: "selection", icon: "selection", tip: "Attach the selected text" },
  { kind: "page_text", icon: "doc", tip: "Attach the page text" },
  { kind: "screenshot", icon: "camera", tip: "Attach a screenshot of the visible tab" },
  { kind: "element", icon: "target", tip: "Pick an element on the page" },
]

export interface Notice {
  kind: "info" | "error"
  text: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  canSend: boolean
  commands: SlashCommand[]
  history: string[]
  attachments: Attachment[]
  onRemoveAttachment: (i: number) => void
  onAttach: (kind: CaptureKind) => void
  capturing: CaptureKind | null
  /** Element picker is active on the page. */
  picking?: boolean
  notice: Notice | null
  onDismissNotice: () => void
  placeholder: string
}

function cmdName(c: SlashCommand): string {
  return c.name.replace(/^\//, "")
}

export function matchCommands(commands: SlashCommand[], value: string): SlashCommand[] {
  const m = value.match(/^\/([^\s]*)$/)
  if (!m) return []
  const q = m[1].toLowerCase()
  const starts = commands.filter((c) => cmdName(c).toLowerCase().startsWith(q))
  const contains = q ? commands.filter((c) => !starts.includes(c) && cmdName(c).toLowerCase().includes(q)) : []
  return [...starts, ...contains].slice(0, 50)
}

function Chip({ a, onRemove, onPreview }: { a: Attachment; onRemove: () => void; onPreview: () => void }) {
  const label = attachmentLabel(a)
  const image = useMemo(() => screenshotSource(a), [a])
  let tip = `${a.title || a.url}\n${a.url}`
  if (a.type === "page_text") tip += `\n${formatCount(a.text.length)} chars`
  if (a.type === "screenshot") tip += `\n${formatBytes(Math.round((a.dataUrl.length * 3) / 4))}`
  if (a.type === "selection") tip = a.text.slice(0, 400)
  if (a.type === "element") tip = `${a.element.cssSelector}\n${a.url}`
  return (
    <span className="chip" title={tip}>
      <button type="button" className="chip-preview" aria-label={`Review ${label}`} onClick={onPreview}>
        {image ? <img className="chip-thumb" src={image} alt="" /> : <Icon name={ATTACHMENT_ICONS[a.type]} size={11} />}
        <span className="chip-label">{label}</span>
      </button>
      <button type="button" className="chip-x" aria-label={`Remove ${label}`} onClick={onRemove}>
        <Icon name="x" size={10} />
      </button>
    </span>
  )
}

export function Composer(props: Props) {
  const { value, onChange, running, commands } = props
  const ta = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const previousAttachments = useRef<Attachment[]>([])
  useEffect(() => {
    const added = props.attachments.filter((a) => a.type === "screenshot" && !previousAttachments.current.includes(a))
    previousAttachments.current = props.attachments
    setPreview((current) => added.at(-1) ?? (current && props.attachments.includes(current) ? current : null))
  }, [props.attachments])
  const [menuIdx, setMenuIdx] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const [recall, setRecall] = useState(-1)
  const matches = useMemo(() => (menuClosed ? [] : matchCommands(commands, value)), [commands, value, menuClosed])
  const menuOpen = matches.length > 0

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4)) + "px"
  }, [value])

  useEffect(() => setMenuIdx(0), [matches.length])
  useEffect(() => {
    if (!value.startsWith("/")) setMenuClosed(false)
  }, [value])

  // Focus on mount and when the panel regains focus.
  useEffect(() => {
    ta.current?.focus()
    const f = () => ta.current?.focus()
    window.addEventListener("focus", f)
    return () => window.removeEventListener("focus", f)
  }, [])

  const pick = (c: SlashCommand) => {
    onChange(`/${cmdName(c)} `)
    setMenuClosed(true)
    ta.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMenuIdx((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMenuIdx((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        const c = matches[menuIdx]
        // Enter on an exact match sends it right away.
        if (e.key === "Enter" && c && value.trim() === `/${cmdName(c)}`) {
          props.onSend()
          setRecall(-1)
          return
        }
        if (c) pick(c)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setMenuClosed(true)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (props.canSend) {
        props.onSend()
        setRecall(-1)
      }
      return
    }
    if (e.key === "ArrowUp" && (value === "" || recall >= 0) && props.history.length) {
      const el = e.currentTarget
      if (value !== "" && el.selectionStart !== 0) return
      e.preventDefault()
      const next = Math.min(recall + 1, props.history.length - 1)
      setRecall(next)
      onChange(props.history[props.history.length - 1 - next])
      return
    }
    if (e.key === "ArrowDown" && recall >= 0) {
      const el = e.currentTarget
      if (el.selectionEnd !== value.length) return
      e.preventDefault()
      const next = recall - 1
      setRecall(next)
      onChange(next >= 0 ? props.history[props.history.length - 1 - next] : "")
      return
    }
    if (e.key === "Escape" && running) {
      e.preventDefault()
      props.onStop()
    }
  }

  return (
    <div className="composer">
      {preview && props.attachments.includes(preview) ? (
        <AttachmentPreview
          attachment={preview}
          fallbackFocus={ta.current}
          onClose={() => setPreview(null)}
          onRemove={() => {
            const index = props.attachments.indexOf(preview)
            if (index >= 0) props.onRemoveAttachment(index)
            setPreview(null)
          }}
        />
      ) : null}
      {props.attachments.length ? (
        <div className="chips chips-pending">
          {props.attachments.map((a, i) => (
            <Chip key={i} a={a} onRemove={() => props.onRemoveAttachment(i)} onPreview={() => setPreview(a)} />
          ))}
        </div>
      ) : null}
      {props.notice ? (
        <div className={`notice notice-${props.notice.kind}`} role={props.notice.kind === "error" ? "alert" : "status"}>
          <span>{props.notice.text}</span>
          <button type="button" className="chip-x" aria-label="Dismiss" onClick={props.onDismissNotice}>
            <Icon name="x" size={10} />
          </button>
        </div>
      ) : null}
      <div className="box">
        {menuOpen ? (
          <div className="slash-menu" role="listbox">
            {matches.map((c, i) => (
              <div
                key={c.name}
                role="option"
                aria-selected={i === menuIdx}
                className={`slash-item ${i === menuIdx ? "on" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
                onMouseEnter={() => setMenuIdx(i)}>
                <span className="slash-name">
                  /{cmdName(c)}
                  {c.argumentHint ? <span className="slash-arg"> {c.argumentHint}</span> : null}
                </span>
                <span className="slash-desc">{c.description}</span>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ta}
          rows={1}
          value={value}
          placeholder={props.placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setRecall(-1)
          }}
          onKeyDown={onKeyDown}
          spellCheck
        />
        <div className="box-bar">
          <div className="attach">
            {ATTACH_BUTTONS.map((b) => {
              const on = b.kind === "element" && !!props.picking
              const tip = on ? "Stop picking" : b.tip
              return (
                <button
                  key={b.kind}
                  type="button"
                  className={`icon-btn ${props.capturing === b.kind ? "is-busy" : ""} ${on ? "is-picking" : ""}`}
                  title={tip}
                  aria-label={tip}
                  aria-pressed={b.kind === "element" ? on : undefined}
                  disabled={props.capturing !== null && props.capturing !== b.kind}
                  onClick={() => props.onAttach(b.kind)}>
                  <Icon name={b.icon} size={15} />
                </button>
              )
            })}
          </div>
          <div className="send-group">
            {running ? (
              <button type="button" className="btn-stop" title="Stop (Esc)" aria-label="Stop" onClick={props.onStop}>
                <Icon name="stop" size={12} />
                <span>Stop</span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn-send"
              title={running ? "Queue message (Enter)" : "Send (Enter)"}
              aria-label="Send"
              disabled={!props.canSend}
              onClick={() => {
                props.onSend()
                setRecall(-1)
              }}>
              <Icon name="arrowUp" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
