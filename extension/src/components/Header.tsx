import React from "react"
import type { EffortLevel, ModelOption, PermissionMode, StudioConfig } from "@claude-studio/protocol"
import type { ConnState } from "../lib/connection"
import { Icon } from "./Icons"

export const EFFORTS: EffortLevel[] = ["", "low", "medium", "high", "xhigh", "max"]

export const MODE_LABELS: Record<PermissionMode, string> = {
  default: "Ask first",
  acceptEdits: "Accept edits",
  plan: "Plan only",
  auto: "Auto",
  bypassPermissions: "Bypass all",
  dontAsk: "Don't ask",
}

const CONN_LABEL: Record<ConnState, string> = {
  connecting: "Connecting",
  open: "Connected",
  reconnecting: "Reconnecting",
  down: "Agent offline",
}

interface Props {
  project: string
  conn: ConnState
  config: StudioConfig | null
  models: ModelOption[]
  modes: PermissionMode[]
  running: boolean
  onConfig: (patch: Partial<StudioConfig>) => void
  onNew: () => void
  onSessions: () => void
  onSettings: () => void
  drawer: "sessions" | "settings" | null
  /** Other conversations waiting for a permission answer. */
  sessionsBadge?: number
}

function Pill({ k, children, danger, title }: { k: string; children: React.ReactNode; danger?: boolean; title?: string }) {
  return (
    <label className={`pill ${danger ? "pill-danger" : ""}`} title={title}>
      {k ? <span className="pill-k">{k}</span> : null}
      {children}
      <Icon name="chevronDown" size={9} className="pill-chev" />
    </label>
  )
}

export function Header(p: Props) {
  const c = p.config
  const disabled = !c || p.conn !== "open"
  const models = [...p.models]
  if (c && !models.some((m) => m.value === c.model)) models.unshift({ value: c.model, displayName: c.model || "Default", description: "" })
  const modes = p.modes.length ? p.modes : (["default", "acceptEdits", "plan", "bypassPermissions"] as PermissionMode[])
  const bypass = c?.permissionMode === "bypassPermissions"

  return (
    <header className="hdr">
      <div className="hdr-top">
        <div className="proj" title={c?.projectDir || undefined}>
          <span className={`dot dot-${p.conn}`} title={CONN_LABEL[p.conn]} />
          <span className="proj-name">{p.project || "claude studio"}</span>
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
      <div className="hdr-controls">
        <Pill k="" title={`Model: ${models.find((m) => m.value === c?.model)?.description || "used for the next turn"}`}>
          <select disabled={disabled} value={c?.model ?? ""} onChange={(e) => p.onConfig({ model: e.target.value })} aria-label="Model">
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.displayName || m.value || "Default"}
              </option>
            ))}
          </select>
        </Pill>
        <Pill k="effort" title="Reasoning effort">
          <select disabled={disabled} value={c?.effort ?? ""} onChange={(e) => p.onConfig({ effort: e.target.value as EffortLevel })} aria-label="Effort">
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e === "" ? "default" : e}
              </option>
            ))}
          </select>
        </Pill>
        <Pill k="mode" danger={bypass} title={bypass ? "Bypass: every tool runs without asking" : "Permission mode"}>
          <select
            disabled={disabled}
            value={c?.permissionMode ?? "default"}
            onChange={(e) => p.onConfig({ permissionMode: e.target.value as PermissionMode })}
            aria-label="Permission mode">
            {modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </Pill>
      </div>
    </header>
  )
}
