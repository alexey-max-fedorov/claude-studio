import React, { useCallback, useEffect, useReducer, useRef, useState } from "react"
import type { Attachment, ModelOption, PermissionMode, ServerMessage, SessionSummary, SlashCommand, StudioConfig } from "@claude-studio/protocol"
import { PROTOCOL_VERSION } from "@claude-studio/protocol"
import { captureAttachment, startPicker, stopPicker } from "./lib/capture"
import { AgentConnection, type ConnState } from "./lib/connection"
import { basename, summarizeAttachment } from "./lib/format"
import { ECHO_TIMEOUT_MS, prepareMessage, prepareSend, restoreDraft } from "./lib/outbox"
import { DEFAULT_SERVER_URL, KEYS, getLocal, getWindowScoped, removeLocal, setLocal, takePending, windowScoped } from "./lib/storage"
import { relPath } from "./lib/tool-summary"
import { initialTranscript, isEchoOf, transcriptReducer, type PermissionRequest, type TranscriptState } from "./lib/transcript"
import { Composer, type CaptureKind, type Notice } from "./components/Composer"
import { CopyButton } from "./components/CopyButton"
import { Header } from "./components/Header"
import { Icon } from "./components/Icons"
import type { PermissionReply } from "./components/PermissionCard"
import { SessionsDrawer } from "./components/SessionsDrawer"
import { SettingsDrawer } from "./components/SettingsDrawer"
import { Transcript } from "./components/Transcript"
import "./sidepanel.css"

const START_CMD = "pnpm dlx claude-studio@3 --project /path/to/your/project"
const MAX_ATTACHMENTS = 12
const SESSION_PAGE = 30
const HISTORY_MAX = 50
const DRAFT_DEBOUNCE_MS = 300

function newId(): string {
  return crypto.randomUUID()
}

async function currentWindowId(): Promise<number | null> {
  try {
    const w = await chrome.windows.getCurrent()
    return w.id ?? null
  } catch {
    return null
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** A message sent to the agent that has not been echoed back yet. */
interface PendingSend {
  nonce: string
  sessionId: string
  text: string
  attachments: Attachment[]
  ts: number
  failed: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/** What we know about conversations other than the visible one, from their live events. */
export interface OtherSession {
  running: boolean
  pending: string[]
}

export function SidePanel() {
  // Connection + agent state
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [conn, setConn] = useState<ConnState>("connecting")
  const [retryIn, setRetryIn] = useState<number | null>(null)
  const [hello, setHello] = useState<Extract<ServerMessage, { type: "hello" }> | null>(null)
  const [config, setConfig] = useState<StudioConfig | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [modes, setModes] = useState<PermissionMode[]>([])

  // Conversation
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [t, dispatch] = useReducer(transcriptReducer, undefined, () => initialTranscript(null))
  const [runningSince, setRunningSince] = useState<number | null>(null)
  const [others, setOthers] = useState<Record<string, OtherSession>>({})

  // Sessions drawer
  const [drawer, setDrawer] = useState<"sessions" | "settings" | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [sessLoading, setSessLoading] = useState(false)

  // Composer
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [capturing, setCapturing] = useState<CaptureKind | null>(null)
  const [picking, setPicking] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [windowId, setWindowId] = useState<number | null>(null)

  const connRef = useRef<AgentConnection | null>(null)
  const historyRequestRef = useRef<string | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const sessionRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const windowRef = useRef<number | null>(null)
  const drawerRef = useRef(drawer)
  const tRef = useRef<TranscriptState>(t)
  const othersRef = useRef(others)
  const pendingSends = useRef(new Map<string, PendingSend>())
  const draftTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; value: string }>())
  drawerRef.current = drawer
  tRef.current = t
  othersRef.current = others

  const send = useCallback((msg: Parameters<AgentConnection["send"]>[0]) => connRef.current?.send(msg) ?? false, [])

  const requestHistory = useCallback((id: string, connection = connRef.current, followResets = true) => {
    const requestId = newId()
    historyRequestRef.current = requestId
    dispatch({ type: "begin_history" })
    connection?.send({ type: "open_session", sessionId: id, requestId, followResets })
  }, [])

  // ---------------------------------------------------------------------------
  // Drafts: debounced per session, flushed on session switch and when the panel hides.

  const writeDraft = (id: string, value: string) => {
    if (value) void setLocal({ [KEYS.draftPrefix + id]: value })
    else void removeLocal(KEYS.draftPrefix + id)
  }

  const flushDrafts = useCallback(() => {
    for (const [id, d] of draftTimers.current) {
      clearTimeout(d.timer)
      writeDraft(id, d.value)
    }
    draftTimers.current.clear()
  }, [])

  const saveDraftSoon = useCallback((id: string, value: string) => {
    const prev = draftTimers.current.get(id)
    if (prev) clearTimeout(prev.timer)
    const timer = setTimeout(() => {
      draftTimers.current.delete(id)
      writeDraft(id, value)
    }, DRAFT_DEBOUNCE_MS)
    draftTimers.current.set(id, { timer, value })
  }, [])

  useEffect(() => {
    const onHide = () => flushDrafts()
    const onVis = () => document.visibilityState === "hidden" && flushDrafts()
    window.addEventListener("pagehide", onHide)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.removeEventListener("pagehide", onHide)
      document.removeEventListener("visibilitychange", onVis)
      flushDrafts()
    }
  }, [flushDrafts])

  // ---------------------------------------------------------------------------
  // Session switching

  const loadDraft = useCallback(async (id: string) => {
    const d = await getLocal<string>(KEYS.draftPrefix + id, "")
    if (sessionRef.current === id) setDraft(d)
  }, [])

  const activate = useCallback(
    (id: string, started: boolean) => {
      flushDrafts()
      sessionRef.current = id
      startedRef.current = started
      setSessionId(id)
      dispatch({ type: "reset", sessionId: id, loaded: !started })
      setRunningSince(null)
      setDraft("")
      void loadDraft(id)
      const w = windowRef.current
      void setLocal({ ...windowScoped(KEYS.currentSession, w, id), ...windowScoped(KEYS.sessionStarted, w, started) })
      if (started) requestHistory(id, connRef.current, false)
      // Local bubbles of still-pending sends for this session come back after the reset.
      for (const p of pendingSends.current.values()) {
        if (p.sessionId !== id) continue
        dispatch({ type: "local_user", nonce: p.nonce, text: p.text, attachments: p.attachments.map(summarizeAttachment), ts: p.ts })
        if (p.failed) dispatch({ type: "local_status", nonce: p.nonce, failed: true })
      }
    },
    [loadDraft, requestHistory, flushDrafts],
  )

  const newChat = useCallback(() => {
    activate(newId(), false)
    setDrawer(null)
  }, [activate])

  const openSession = useCallback(
    (id: string) => {
      activate(id, true)
      setDrawer(null)
    },
    [activate],
  )

  // ---------------------------------------------------------------------------
  // Pending sends (optimistic bubbles waiting for the agent's echo)

  const resolveSend = useCallback((nonce: string) => {
    const p = pendingSends.current.get(nonce)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    pendingSends.current.delete(nonce)
  }, [])

  const armEchoTimer = useCallback((nonce: string) => {
    const p = pendingSends.current.get(nonce)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    p.timer = setTimeout(() => {
      const cur = pendingSends.current.get(nonce)
      if (!cur) return
      // A busy session queues the message server-side; the echo comes when it starts.
      const busy =
        cur.sessionId === sessionRef.current ? tRef.current.status !== "idle" : !!othersRef.current[cur.sessionId]?.running
      if (busy) {
        armEchoTimer(nonce)
        return
      }
      cur.failed = true
      cur.timer = null
      if (cur.sessionId === sessionRef.current) dispatch({ type: "local_status", nonce, failed: true })
    }, ECHO_TIMEOUT_MS)
  }, [])

  /** Undelivered (or possibly undelivered) sends go back into the composer. */
  const restoreSends = useCallback((list: PendingSend[], reason: string) => {
    if (!list.length) return
    const current = sessionRef.current
    const mine: PendingSend[] = []
    for (const p of list) {
      if (p.timer) clearTimeout(p.timer)
      pendingSends.current.delete(p.nonce)
      if (p.sessionId === current) {
        dispatch({ type: "local_remove", nonce: p.nonce })
        mine.push(p)
      } else {
        // Another conversation: put the text into that conversation's saved draft.
        void getLocal<string>(KEYS.draftPrefix + p.sessionId, "").then((d) => writeDraft(p.sessionId, restoreDraft(d, [p.text])))
      }
    }
    if (mine.length) {
      setDraft((d) => {
        const next = restoreDraft(d, mine.map((p) => p.text))
        if (current) saveDraftSoon(current, next)
        return next
      })
      setAttachments((a) => [...mine.flatMap((p) => p.attachments), ...a].slice(0, MAX_ATTACHMENTS))
    }
    setNotice({ kind: "error", text: reason })
  }, [saveDraftSoon])

  // ---------------------------------------------------------------------------
  // Server messages

  const trackOther = useCallback((sid: string, fn: (o: OtherSession) => OtherSession) => {
    setOthers((prev) => {
      const next = fn(prev[sid] ?? { running: false, pending: [] })
      return { ...prev, [sid]: next }
    })
  }, [])

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "hello":
          setHello(msg)
          break
        case "config_state":
          setConfig(msg.config)
          setModels(msg.models ?? [])
          setCommands(msg.commands ?? [])
          setModes(msg.permissionModes ?? [])
          break
        case "config_error":
          setNotice({ kind: "error", text: `Setting not saved: ${msg.error}` })
          break
        case "session_list":
          setSessLoading(false)
          setHasMore(msg.hasMore)
          setSessions((prev) => {
            if (msg.offset === 0) return msg.sessions
            const seen = new Set(prev.map((s) => s.sessionId))
            return [...prev, ...msg.sessions.filter((s) => !seen.has(s.sessionId))]
          })
          break
        case "live_sessions":
          setOthers(Object.fromEntries(msg.sessions.map((s) => [s.sessionId, { running: s.running, pending: s.pending }])))
          break
        case "session_reset": {
          const { previousSessionId: previous, sessionId: next } = msg
          flushDrafts()
          for (const p of pendingSends.current.values()) if (p.sessionId === previous) p.sessionId = next
          setOthers((prev) => {
            const { [previous]: old, ...rest } = prev
            return { ...rest, [next]: { running: old?.running ?? true, pending: [] } }
          })
          if (sessionRef.current === previous) {
            sessionRef.current = next
            startedRef.current = true
            setSessionId(next)
            dispatch({ type: "reset", sessionId: next })
            setRunningSince(null)
            saveDraftSoon(next, draftRef.current)
            void setLocal({ ...windowScoped(KEYS.currentSession, windowRef.current, next), ...windowScoped(KEYS.sessionStarted, windowRef.current, true) })
            for (const p of pendingSends.current.values()) {
              if (p.sessionId === next) dispatch({ type: "local_user", nonce: p.nonce, text: p.text, attachments: p.attachments.map(summarizeAttachment), ts: p.ts })
            }
            requestHistory(next)
          }
          break
        }
        case "session_history": {
          if (msg.sessionId === sessionRef.current && msg.requestId && msg.requestId !== historyRequestRef.current) break
          trackOther(msg.sessionId, () => ({ running: msg.running, pending: (msg.pending ?? []).map((p) => p.requestId) }))
          // Sends whose echo is already in history are delivered.
          const used = new Set<string>()
          const sends = [...pendingSends.current.values()].filter((p) => p.sessionId === msg.sessionId).sort((a, b) => a.ts - b.ts)
          for (const p of sends) {
            const echo = msg.items.find((i) => i.kind === "user" && !used.has(i.id) && isEchoOf(p, i))
            if (echo && echo.kind === "user") {
              used.add(echo.id)
              resolveSend(p.nonce)
            }
          }
          if (msg.sessionId === sessionRef.current) dispatch({ type: "history", msg })
          break
        }
        case "event": {
          const { sessionId: sid, event } = msg
          if (event.kind === "item" && event.item.kind === "user") {
            const item = event.item
            const p = [...pendingSends.current.values()].filter((x) => x.sessionId === sid && isEchoOf(x, item)).sort((a, b) => a.ts - b.ts)[0]
            if (p) resolveSend(p.nonce)
          }
          if (event.kind === "status") {
            const running = event.state !== "idle"
            trackOther(sid, (o) => ({ ...o, running }))
            setSessions((prev) => prev.map((s) => (s.sessionId === sid ? { ...s, running, live: true } : s)))
          } else if (event.kind === "permission_request") {
            trackOther(sid, (o) => (o.pending.includes(event.requestId) ? o : { ...o, pending: [...o.pending, event.requestId] }))
          } else if (event.kind === "permission_resolved") {
            trackOther(sid, (o) => ({ ...o, pending: o.pending.filter((r) => r !== event.requestId) }))
          }
          if (sid === sessionRef.current) dispatch({ type: "event", sessionId: sid, event, sequence: msg.sequence })
          break
        }
        case "error":
          if (msg.sessionId) {
            if (msg.sessionId === sessionRef.current) dispatch({ type: "local_error", text: msg.error, ts: Date.now() })
            else setNotice({ kind: "error", text: msg.error })
            break
          }
          {
            // A session-less error right after a send is the agent rejecting that send.
            const latest = [...pendingSends.current.values()].filter((p) => !p.failed).sort((a, b) => b.ts - a.ts)[0]
            if (latest && Date.now() - latest.ts < ECHO_TIMEOUT_MS) restoreSends([latest], `Not delivered: ${msg.error}. Your message is back in the box.`)
            else setNotice({ kind: "error", text: msg.error })
          }
          break
        default:
          break
      }
    },
    [resolveSend, restoreSends, trackOther, flushDrafts, saveDraftSoon, requestHistory],
  )

  // Boot: restore state (per window), then connect.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const win = await currentWindowId()
      const [url, cur, started, hist] = await Promise.all([
        getLocal<string>(KEYS.serverUrl, DEFAULT_SERVER_URL),
        getWindowScoped<string | null>(KEYS.currentSession, win, null),
        getWindowScoped<boolean>(KEYS.sessionStarted, win, false),
        getLocal<string[]>(KEYS.sentHistory, []),
      ])
      if (cancelled) return
      windowRef.current = win
      setWindowId(win)
      setHistory(Array.isArray(hist) ? hist : [])
      activate(cur || newId(), !!cur && !!started)
      setServerUrl(url || DEFAULT_SERVER_URL)
    })()
    return () => {
      cancelled = true
    }
  }, [activate])

  useEffect(() => {
    if (!serverUrl) return
    let wasOpen = false
    const c = new AgentConnection({
      url: serverUrl,
      onMessage,
      onState: (state, info) => {
        setConn(state)
        setRetryIn(info.nextRetryMs)
        if (wasOpen && state !== "open") {
          const list = [...pendingSends.current.values()]
          restoreSends(list, "Connection dropped while sending. Your message is back in the box; check the conversation before resending.")
        }
        wasOpen = state === "open"
      },
      onOpen: () => {
        c.send({ type: "get_state" })
        if (sessionRef.current && startedRef.current) requestHistory(sessionRef.current, c)
        if (drawerRef.current === "sessions") c.send({ type: "list_sessions", limit: SESSION_PAGE, offset: 0 })
      },
    })
    connRef.current = c
    c.start()
    return () => {
      c.stop()
      if (connRef.current === c) connRef.current = null
    }
  }, [serverUrl, onMessage, restoreSends, requestHistory])

  // Running timer
  useEffect(() => {
    if (t.status === "idle") setRunningSince(null)
    else setRunningSince((s) => s ?? Date.now())
  }, [t.status])

  // ---------------------------------------------------------------------------
  // Attachments

  const addAttachments = useCallback((list: Attachment[]) => {
    if (!list.length) return
    setAttachments((prev) => {
      const next = [...prev]
      for (const a of list) {
        if (a.type === "page" && next.some((x) => x.type === "page" && x.url === a.url)) continue
        next.push(a)
      }
      if (next.length > MAX_ATTACHMENTS) {
        setNotice({ kind: "error", text: `At most ${MAX_ATTACHMENTS} attachments per message` })
        return next.slice(0, MAX_ATTACHMENTS)
      }
      return next
    })
    if (list.some((a) => a.type === "element")) {
      setPicking(false)
      setNotice((n) => (n?.kind === "info" ? null : n))
    }
  }, [])

  // Pending attachments from the context menu and the element picker. Only once this panel
  // knows its window: the background hands over that window's items (and untargeted ones).
  useEffect(() => {
    if (windowId == null || typeof chrome === "undefined" || !chrome.storage?.onChanged) return
    const pull = () =>
      takePending(windowId)
        .then(addAttachments)
        .catch(() => {})
    pull()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session" || !changes[KEYS.pending]) return
      const v = changes[KEYS.pending].newValue
      if (Array.isArray(v) && v.length) pull()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [windowId, addAttachments])

  // Picker state announced by the content script (pick, Esc, toggled by the shortcut).
  useEffect(() => {
    if (windowId == null || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return
    const onRuntime = (message: any, sender: chrome.runtime.MessageSender) => {
      if (!message || message.action !== "picker-state" || sender.tab?.windowId !== windowId) return
      setPicking(!!message.active)
      if (message.active) setNotice({ kind: "info", text: "Click an element on the page. Esc cancels." })
      else setNotice((n) => (n?.kind === "info" ? null : n))
    }
    chrome.runtime.onMessage.addListener(onRuntime)
    return () => chrome.runtime.onMessage.removeListener(onRuntime)
  }, [windowId])

  const attach = useCallback(
    async (kind: CaptureKind) => {
      const win = windowId ?? (await currentWindowId())
      if (win == null) {
        setNotice({ kind: "error", text: "No browser window found for this panel" })
        return
      }
      if (kind === "element") {
        if (picking) {
          await stopPicker(win)
          setPicking(false)
          setNotice((n) => (n?.kind === "info" ? null : n))
          return
        }
        try {
          const active = await startPicker(win)
          setPicking(active)
          if (active) setNotice({ kind: "info", text: "Click an element on the page. Esc cancels." })
        } catch (e) {
          setPicking(false)
          setNotice({ kind: "error", text: errText(e) })
        }
        return
      }
      setCapturing(kind)
      try {
        const a = await captureAttachment(kind, win)
        addAttachments([a])
        setNotice(null)
      } catch (e) {
        setNotice({ kind: "error", text: errText(e) })
      } finally {
        setCapturing(null)
      }
    },
    [windowId, picking, addAttachments],
  )

  // ---------------------------------------------------------------------------
  // Composer actions

  const onDraft = useCallback(
    (v: string) => {
      setDraft(v)
      if (sessionRef.current) saveDraftSoon(sessionRef.current, v)
    },
    [saveDraftSoon],
  )

  const canSend = conn === "open" && !!sessionId && (draft.trim().length > 0 || attachments.length > 0)

  const sendMessage = useCallback(() => {
    const id = sessionRef.current
    const text = draft.trim()
    if (!id || (!text && !attachments.length)) return
    if (!connRef.current?.isOpen) {
      setNotice({ kind: "error", text: "Not connected to the agent. Your message is kept." })
      return
    }
    const prepared = prepareSend(id, text, attachments)
    if (!prepared.ok) {
      setNotice({ kind: "error", text: prepared.error })
      return
    }
    if (!connRef.current.sendRaw(prepared.json)) {
      setNotice({ kind: "error", text: "Could not send. Your message is kept." })
      return
    }
    const nonce = newId()
    const ts = Date.now()
    pendingSends.current.set(nonce, { nonce, sessionId: id, text, attachments, ts, failed: false, timer: null })
    armEchoTimer(nonce)
    dispatch({ type: "local_user", nonce, text, attachments: attachments.map(summarizeAttachment), ts })
    if (!startedRef.current) {
      startedRef.current = true
      void setLocal(windowScoped(KEYS.sessionStarted, windowRef.current, true))
    }
    setDraft("")
    setAttachments([])
    setNotice(null)
    const timer = draftTimers.current.get(id)
    if (timer) clearTimeout(timer.timer)
    draftTimers.current.delete(id)
    void removeLocal(KEYS.draftPrefix + id)
    if (text) {
      setHistory((h) => {
        const next = [...h.filter((x) => x !== text), text].slice(-HISTORY_MAX)
        void setLocal({ [KEYS.sentHistory]: next })
        return next
      })
    }
  }, [draft, attachments, armEchoTimer])

  const retrySend = useCallback(
    (nonce: string) => {
      const p = pendingSends.current.get(nonce)
      if (!p) return
      if (!connRef.current?.isOpen) {
        setNotice({ kind: "error", text: "Not connected to the agent yet" })
        return
      }
      const prepared = prepareSend(p.sessionId, p.text, p.attachments)
      if (!prepared.ok || !connRef.current.sendRaw(prepared.json)) {
        setNotice({ kind: "error", text: prepared.ok ? "Could not send" : prepared.error })
        return
      }
      p.failed = false
      p.ts = Date.now()
      armEchoTimer(nonce)
      dispatch({ type: "local_status", nonce, failed: false, ts: p.ts })
    },
    [armEchoTimer],
  )

  const editSend = useCallback(
    (nonce: string) => {
      const p = pendingSends.current.get(nonce)
      if (!p) return
      restoreSends([p], "Moved back to the box")
      setNotice(null)
    },
    [restoreSends],
  )

  const stop = useCallback(() => {
    if (sessionRef.current) send({ type: "interrupt", sessionId: sessionRef.current })
  }, [send])

  const onPermission = useCallback(
    (req: PermissionRequest, r: PermissionReply): boolean => {
      const sid = sessionRef.current
      if (!sid) return false
      const prepared = prepareMessage({ type: "permission_response", sessionId: sid, requestId: req.requestId, ...r })
      if (!prepared.ok) {
        setNotice({ kind: "error", text: prepared.error })
        return false
      }
      const ok = connRef.current?.sendRaw(prepared.json) ?? false
      if (!ok) setNotice({ kind: "error", text: "Not connected. Answer again once the agent is back." })
      return ok
    },
    [],
  )

  const onConfig = useCallback(
    (patch: Partial<StudioConfig>) => {
      setConfig((c) => (c ? { ...c, ...patch } : c))
      if (!send({ type: "set_config", patch })) setNotice({ kind: "error", text: "Not connected to the agent" })
    },
    [send],
  )

  const toggleSessions = useCallback(() => {
    if (drawerRef.current === "sessions") {
      setDrawer(null)
      return
    }
    setDrawer("sessions")
    setSessLoading(send({ type: "list_sessions", limit: SESSION_PAGE, offset: 0 }))
  }, [send])

  const saveServerUrl = useCallback((url: string) => {
    setServerUrl(url)
    void setLocal({ [KEYS.serverUrl]: url })
  }, [])

  // ---------------------------------------------------------------------------

  const projectDir = hello?.projectDir || config?.projectDir || ""
  const project = projectDir ? basename(projectDir) : ""
  const running = t.status !== "idle"
  const protoMismatch = hello && hello.protocol !== PROTOCOL_VERSION
  const waiting = Object.entries(others)
    .filter(([sid, o]) => sid !== sessionId && o.pending.length > 0)
    .map(([sid]) => sid)
  const waitingTitle = (sid: string) => sessions.find((s) => s.sessionId === sid)?.title

  const empty =
    startedRef.current && !t.loaded ? (
      <div className="empty">
        <div className="empty-sub">
          <span className="spin" /> Loading conversation
        </div>
      </div>
    ) : (
      <div className="empty">
        <div className="empty-mark">
          {project || "claude"}
          <span className="caret caret-static" aria-hidden />
        </div>
        <div className="empty-sub">
          Claude Code in <span className="mono">{projectDir ? relPath(projectDir) : "your project"}</span>
        </div>
        <ul className="empty-tips">
          <li>
            <kbd>/</kbd> lists commands and skills.
          </li>
          <li>The buttons under the box attach this page, your selection, the page text, a screenshot or a picked element.</li>
          <li>Sessions shows terminal sessions too. Open one to continue it here.</li>
        </ul>
      </div>
    )

  return (
    <div className="app">
      <Header
        project={project}
        conn={conn}
        config={config}
        models={models}
        modes={modes}
        running={running}
        onConfig={onConfig}
        onNew={newChat}
        onSessions={toggleSessions}
        onSettings={() => setDrawer((d) => (d === "settings" ? null : "settings"))}
        drawer={drawer}
        sessionsBadge={waiting.length}
      />
      {conn === "down" ? (
        <div className="banner">
          <div className="banner-line">
            <strong>Agent not running.</strong> Start it:
          </div>
          <div className="banner-cmd">
            <code>{START_CMD}</code>
            <CopyButton text={START_CMD} />
          </div>
          <div className="banner-line dim">
            {retryIn ? `Retrying in ${Math.round(retryIn / 1000)}s. ` : ""}
            <button type="button" className="linkish" onClick={() => connRef.current?.retry()}>
              Retry now
            </button>
          </div>
        </div>
      ) : null}
      {protoMismatch ? (
        <div className="banner banner-warn">
          Agent speaks protocol v{hello!.protocol}, this panel expects v{PROTOCOL_VERSION}. Update one of them.
        </div>
      ) : null}
      {waiting.length && drawer !== "sessions" ? (
        <button type="button" className="waiting" onClick={() => openSession(waiting[0])}>
          <Icon name="lock" size={12} />
          <span className="waiting-text">
            {waiting.length === 1 ? "Another chat is waiting for approval" : `${waiting.length} other chats are waiting for approval`}
            {waiting.length === 1 && waitingTitle(waiting[0]) ? <span className="dim">: {waitingTitle(waiting[0])}</span> : null}
          </span>
          <span className="waiting-go">Open</span>
        </button>
      ) : null}
      <main className="main">
        <Transcript
          rows={t.rows}
          status={t.status}
          permissions={t.permissions}
          projectDir={projectDir}
          runningSince={runningSince}
          empty={empty}
          onPermission={onPermission}
          onRetry={retrySend}
          onEdit={editSend}
        />
        {drawer === "sessions" ? (
          <SessionsDrawer
            sessions={sessions}
            hasMore={hasMore}
            loading={sessLoading}
            currentId={sessionId}
            waiting={waiting}
            onOpen={openSession}
            onRename={(id, title) => {
              send({ type: "rename_session", sessionId: id, title })
              setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, title } : s)))
            }}
            onMore={() => {
              setSessLoading(true)
              send({ type: "list_sessions", limit: SESSION_PAGE, offset: sessions.length })
            }}
            onRefresh={() => {
              setSessLoading(true)
              send({ type: "list_sessions", limit: SESSION_PAGE, offset: 0 })
            }}
            onClose={() => setDrawer(null)}
          />
        ) : null}
        {drawer === "settings" ? (
          <SettingsDrawer
            serverUrl={serverUrl ?? DEFAULT_SERVER_URL}
            onServerUrl={saveServerUrl}
            config={config}
            connected={conn === "open"}
            serverVersion={hello?.serverVersion ?? null}
            onConfig={onConfig}
            onClose={() => setDrawer(null)}
          />
        ) : null}
      </main>
      <Composer
        value={draft}
        onChange={onDraft}
        onSend={sendMessage}
        onStop={stop}
        running={running}
        canSend={canSend}
        commands={commands}
        history={history}
        attachments={attachments}
        onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
        onAttach={attach}
        capturing={capturing}
        picking={picking}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        placeholder={running ? "Queue a follow-up" : `Message ${project || "Claude"}`}
      />
    </div>
  )
}

export default SidePanel
