import React, { useState } from "react"
import type { SessionSummary } from "@claude-studio/protocol"
import { relativeTime } from "../lib/format"
import { Icon } from "./Icons"

interface Props {
  sessions: SessionSummary[]
  hasMore: boolean
  loading: boolean
  currentId: string | null
  /** Session ids waiting for a permission answer. */
  waiting?: string[]
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => void
  onMore: () => void
  onRefresh: () => void
  onClose: () => void
}

function Item({
  s,
  current,
  waiting,
  onOpen,
  onRename,
}: {
  s: SessionSummary
  current: boolean
  waiting: boolean
  onOpen: () => void
  onRename: (t: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(s.title)
  const commit = () => {
    const t = title.trim()
    if (t && t !== s.title) onRename(t)
    setEditing(false)
  }
  return (
    <li className={`sess ${current ? "is-current" : ""}`}>
      {editing ? (
        <input
          className="sess-edit"
          value={title}
          autoFocus
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
              setTitle(s.title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button type="button" className="sess-main" onClick={onOpen}>
          <span className="sess-title">{s.title || "Untitled session"}</span>
          <span className="sess-meta">
            {s.running ? <span className="sess-live is-run" title="Running now" /> : s.live ? <span className="sess-live" title="Live in the agent" /> : null}
            {waiting ? <span className="sess-waiting">needs approval</span> : null}
            <span>{relativeTime(s.lastModified)}</span>
            {s.gitBranch ? <span className="sess-branch">{s.gitBranch}</span> : null}
          </span>
        </button>
      )}
      {!editing ? (
        <button
          type="button"
          className="icon-btn sess-rename"
          title="Rename"
          aria-label="Rename session"
          onClick={() => {
            setTitle(s.title)
            setEditing(true)
          }}>
          <Icon name="pencil" size={12} />
        </button>
      ) : null}
    </li>
  )
}

export function SessionsDrawer(p: Props) {
  return (
    <div className="drawer" role="dialog" aria-label="Sessions">
      <div className="drawer-head">
        <span className="drawer-title">Sessions</span>
        <span className="drawer-sub">this project, terminal ones included</span>
        <button type="button" className="icon-btn" title="Refresh" aria-label="Refresh" onClick={p.onRefresh}>
          <Icon name="refresh" size={14} />
        </button>
        <button type="button" className="icon-btn" title="Close" aria-label="Close" onClick={p.onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <ul className="sess-list">
        {p.sessions.map((s) => (
          <Item key={s.sessionId} s={s} current={s.sessionId === p.currentId} waiting={!!p.waiting?.includes(s.sessionId)} onOpen={() => p.onOpen(s.sessionId)} onRename={(t) => p.onRename(s.sessionId, t)} />
        ))}
      </ul>
      {!p.sessions.length && !p.loading ? <div className="drawer-empty">No sessions yet.</div> : null}
      {p.loading ? <div className="drawer-empty"><span className="spin" /> Loading</div> : null}
      {p.hasMore && !p.loading ? (
        <button type="button" className="btn more-btn" onClick={p.onMore}>
          Load more
        </button>
      ) : null}
    </div>
  )
}
