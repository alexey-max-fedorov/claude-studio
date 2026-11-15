import React from "react"
import type { EffortLevel, ModelOption, PermissionMode, StudioConfig } from "@claude-studio/protocol"
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

interface Props {
  config: StudioConfig | null
  connected: boolean
  models: ModelOption[]
  modes: PermissionMode[]
  onConfig: (patch: Partial<StudioConfig>) => void
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

export function SessionControls(p: Props) {
  const c = p.config
  const disabled = !c || !p.connected
  const models = [...p.models]
  if (c && !models.some((m) => m.value === c.model)) models.unshift({ value: c.model, displayName: c.model || "Default", description: "" })
  const modes = p.modes.length ? p.modes : (["default", "acceptEdits", "plan", "bypassPermissions"] as PermissionMode[])
  const bypass = c?.permissionMode === "bypassPermissions"

  return (
    <div className="composer-controls" role="group" aria-label="Session settings">
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
  )
}
