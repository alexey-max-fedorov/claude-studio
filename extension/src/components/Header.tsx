import React from "react"
import type { ConnState } from "../lib/connection"
import { Icon } from "./Icons"
import brand from "../../../brand.json"
import logo from "url:../../assets/icon-128.png"

const CONN_LABEL: Record<ConnState, string> = {
  connecting: "Connecting",
  open: "Connected",
  reconnecting: "Reconnecting",
  down: "Agent offline",
}

interface Props {
  project: string
  conn: ConnState
  projectDir: string
  running: boolean
  onNew: () => void
  onSessions: () => void
  onSettings: () => void
  drawer: "sessions" | "settings" | null
  /** Other conversations waiting for a permission answer. */
  sessionsBadge?: number
}

export function Header(p: Props) {
  return (
    <header className="hdr">
      <div className="brand-row">
        <img className="brand-logo" src={logo} alt="" width={30} height={30} />
        <span className="brand-name">{brand.name}</span>
      </div>
      <div className="hdr-top">
        <div className="proj" title={p.projectDir || undefined}>
          <span className={`dot dot-${p.conn}`} title={CONN_LABEL[p.conn]} />
          <span className="proj-name">{p.project || "Your project"}</span>
          {p.conn !== "open" ? <span className="conn-label">{CONN_LABEL[p.conn]}</span> : p.running ? <span className="conn-label is-run">working</span> : null}
        </div>
        <div className="hdr-actions">
          <button type="button" className="icon-btn" title="New chat" aria-label="New chat" onClick={p.onNew}>
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn badge-host ${p.drawer === "sessions" ? "is-on" : ""}`}
            title={p.sessionsBadge ? `Sessions (${p.sessionsBadge} waiting for approval)` : "Sessions"}
            aria-label={p.sessionsBadge ? `Sessions, ${p.sessionsBadge} waiting for approval` : "Sessions"}
            onClick={p.onSessions}>
            <Icon name="list" size={16} />
            {p.sessionsBadge ? <span className="badge">{p.sessionsBadge}</span> : null}
          </button>
          <button type="button" className={`icon-btn ${p.drawer === "settings" ? "is-on" : ""}`} title="Settings" aria-label="Settings" onClick={p.onSettings}>
            <Icon name="gear" size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
