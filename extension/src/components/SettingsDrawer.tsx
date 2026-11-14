import React, { useEffect, useState } from "react"
import type { StudioConfig } from "@claude-studio/protocol"
import { isValidAgentUrl } from "../lib/connection"
import { DEFAULT_SERVER_URL } from "../lib/storage"
import { Icon } from "./Icons"

interface Props {
  serverUrl: string
  onServerUrl: (url: string) => void
  config: StudioConfig | null
  connected: boolean
  serverVersion: string | null
  onConfig: (patch: Partial<StudioConfig>) => void
  onClose: () => void
}

function numOrNull(s: string): number | null {
  const n = Number(s)
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null
}

export function SettingsDrawer(p: Props) {
  const [url, setUrl] = useState(p.serverUrl)
  const [append, setAppend] = useState(p.config?.systemPromptAppend ?? "")
  const [turns, setTurns] = useState(p.config?.maxTurns?.toString() ?? "")
  const [budget, setBudget] = useState(p.config?.maxBudgetUsd?.toString() ?? "")

  useEffect(() => setUrl(p.serverUrl), [p.serverUrl])
  useEffect(() => {
    setAppend(p.config?.systemPromptAppend ?? "")
    setTurns(p.config?.maxTurns?.toString() ?? "")
    setBudget(p.config?.maxBudgetUsd?.toString() ?? "")
  }, [p.config])

  const urlValid = isValidAgentUrl(url)

  return (
    <div className="drawer" role="dialog" aria-label="Settings">
      <div className="drawer-head">
        <span className="drawer-title">Settings</span>
        <span className="drawer-sub" />
        <button type="button" className="icon-btn" title="Close" aria-label="Close" onClick={p.onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="form">
        <label className="field">
          <span className="field-k">Agent URL</span>
          <div className="field-row">
            <input
              className={`input mono ${url.trim() && !urlValid ? "is-invalid" : ""}`}
              value={url}
              spellCheck={false}
              aria-invalid={!urlValid}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="button" className="btn" disabled={!urlValid || url.trim() === p.serverUrl} onClick={() => p.onServerUrl(url.trim())}>
              Save
            </button>
          </div>
          <span className="field-hint">
            {url.trim() && !urlValid ? <span className="field-err">Use a ws:// or wss:// URL. </span> : null}
            Default {DEFAULT_SERVER_URL}.{" "}
            {url.trim() !== DEFAULT_SERVER_URL ? (
              <button type="button" className="linkish" onClick={() => p.onServerUrl(DEFAULT_SERVER_URL)}>
                Reset
              </button>
            ) : null}
          </span>
        </label>

        <div className="field-sep">
          Agent settings{p.serverVersion ? <span className="dim">, agent {p.serverVersion}</span> : null}
        </div>
        {!p.connected ? <div className="field-hint">Connect to the agent to edit these.</div> : null}

        <label className="field">
          <span className="field-k">Append to system prompt</span>
          <textarea
            className="input"
            rows={4}
            disabled={!p.connected}
            value={append}
            placeholder="Extra instructions for every turn"
            onChange={(e) => setAppend(e.target.value)}
            onBlur={() => append !== (p.config?.systemPromptAppend ?? "") && p.onConfig({ systemPromptAppend: append })}
          />
        </label>
        <div className="field-pair">
          <label className="field">
            <span className="field-k">Max turns</span>
            <input
              className="input mono"
              inputMode="numeric"
              disabled={!p.connected}
              placeholder="no cap"
              value={turns}
              onChange={(e) => setTurns(e.target.value)}
              onBlur={() => numOrNull(turns) !== (p.config?.maxTurns ?? null) && p.onConfig({ maxTurns: numOrNull(turns) })}
            />
          </label>
          <label className="field">
            <span className="field-k">Live-process budget, USD</span>
            <input
              className="input mono"
              inputMode="decimal"
              aria-describedby="budget-help"
              disabled={!p.connected}
              placeholder="no cap"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => numOrNull(budget) !== (p.config?.maxBudgetUsd ?? null) && p.onConfig({ maxBudgetUsd: numOrNull(budget) })}
            />
          </label>
        </div>
        <div id="budget-help" className="field-hint">
          Shared across messages in one live Claude Code process, not the saved conversation. Fresh allowance after process restart, idle eviction, or conversation clear (/clear).
        </div>

        <div className="field-sep">Shortcuts</div>
        <dl className="keys">
          <dt>Alt+Shift+C</dt>
          <dd>Open this panel</dd>
          <dt>Cmd+Shift+E</dt>
          <dd>Pick an element on the page</dd>
          <dt>Enter / Shift+Enter</dt>
          <dd>Send / new line</dd>
          <dt>Up</dt>
          <dd>Recall your last message</dd>
          <dt>Esc</dt>
          <dd>Stop the running turn</dd>
        </dl>
        <div className="field-hint">Change shortcuts at brave://extensions/shortcuts</div>
      </div>
    </div>
  )
}
