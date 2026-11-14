import type { ElementSelection } from "./element-selection.js"
import type { StudioConfig, Usage, ModelOption, SlashCommand, PermissionMode } from "./config.js"

/*
 * Claude Studio protocol v3.
 *
 * One agent daemon runs Claude Code (Agent SDK) in a single project dir.
 * The browser side panel is a chat client for that project:
 *   - conversations are real Claude Code sessions, keyed by sessionId (UUID).
 *     The CLIENT mints the UUID for a new conversation; the agent passes it as
 *     options.sessionId, or as options.resume when that session already exists on disk.
 *   - every conversation event carries its sessionId; a client receives events for
 *     sessions it has opened (open_session), sent to (send), or recovered (get_state).
 *   - transcripts on disk (terminal sessions included) can be listed and resumed.
 */

export const PROTOCOL_VERSION = 3

// ---------------------------------------------------------------------------
// Browser context the user attaches to a message. All of it is UNTRUSTED page data.
// ---------------------------------------------------------------------------
export type Attachment =
  | { type: "page"; url: string; title: string }
  | { type: "selection"; url: string; title: string; text: string }
  | { type: "page_text"; url: string; title: string; text: string }
  /** dataUrl = "data:image/jpeg;base64,..." or "data:image/png;base64,..." (<= 8 MB) */
  | { type: "screenshot"; url: string; title: string; dataUrl: string }
  | { type: "element"; url: string; title: string; element: ElementSelection }

// ---------------------------------------------------------------------------
// Conversation items. Used both for live events and for rendered history,
// so the panel has one renderer.
// ---------------------------------------------------------------------------
export interface AttachmentSummary {
  type: Attachment["type"]
  label: string
}

export type ChatItem =
  | { kind: "user"; id: string; text: string; attachments: AttachmentSummary[]; ts: number }
  /** A finished assistant text block. id = stable block id (msgId:index). */
  | { kind: "assistant"; id: string; text: string; ts: number }
  | { kind: "thinking"; id: string; text: string; ts: number }
  | { kind: "tool_use"; id: string; name: string; input: Record<string, unknown>; ts: number; parentToolUseId: string | null }
  | { kind: "tool_result"; toolUseId: string; text: string; isError: boolean; ts: number }
  /** Turn summary. */
  | {
      kind: "result"
      id?: string
      ts: number
      isError: boolean
      errorText?: string
      durationMs: number
      turns: number
      costUsd: number
      usage: Usage
    }
  | { kind: "error"; id?: string; text: string; ts: number }
  | { kind: "system"; id?: string; text: string; ts: number }

/** Live-only events (not persisted in history). */
export type LiveEvent =
  | { kind: "item"; item: ChatItem }
  /** Token streaming for the assistant/thinking block with this id. Final text arrives later as an item with the same id. */
  | { kind: "text_delta"; id: string; text: string }
  | { kind: "thinking_delta"; id: string; text: string }
  | { kind: "status"; state: "starting" | "running" | "idle" }
  | {
      kind: "permission_request"
      requestId: string
      toolName: string
      input: Record<string, unknown>
      /** Human-readable reason/title from the SDK if any. */
      title?: string
      blockedPath?: string
      /** True when the SDK offered "always allow" suggestions. */
      canAlwaysAllow: boolean
    }
  | { kind: "permission_resolved"; requestId: string; behavior: "allow" | "deny" }

export interface SessionSummary {
  sessionId: string
  title: string
  lastModified: number
  gitBranch?: string
  /** True when a live Claude Code process currently holds this session in the agent. */
  live: boolean
  running: boolean
}

export interface LiveSessionState {
  sessionId: string
  running: boolean
  pending: string[]
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------
export type ClientMessage =
  | { type: "ping" }
  | { type: "get_state" }
  | { type: "set_config"; patch: Partial<StudioConfig> }
  | { type: "list_sessions"; limit?: number; offset?: number }
  /** Subscribe to a session and receive its history (session_history) plus any live state. */
  | { type: "open_session"; sessionId: string; requestId?: string; followResets?: boolean }
  /** Send a user message. Creates the session if sessionId is new. Queued if a turn is running. */
  | { type: "send"; sessionId: string; text: string; attachments: Attachment[] }
  | { type: "interrupt"; sessionId: string }
  | {
      type: "permission_response"
      sessionId: string
      requestId: string
      behavior: "allow" | "deny"
      /** Apply the SDK's "always allow" suggestions for this session. */
      always?: boolean
      /** Deny reason shown to Claude. */
      message?: string
      /** Replacement tool input (used to answer AskUserQuestion). */
      updatedInput?: Record<string, unknown>
    }
  /** Stop the live Claude Code process for a session (history stays on disk). */
  | { type: "close_session"; sessionId: string }
  | { type: "rename_session"; sessionId: string; title: string }

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------
export type ServerMessage =
  | { type: "hello"; serverVersion: string; protocol: number; projectDir: string }
  | { type: "pong" }
  | {
      type: "config_state"
      config: StudioConfig
      models: ModelOption[]
      commands: SlashCommand[]
      permissionModes: PermissionMode[]
    }
  | { type: "config_error"; error: string }
  | { type: "session_list"; sessions: SessionSummary[]; offset: number; hasMore: boolean }
  | { type: "live_sessions"; sessions: LiveSessionState[] }
  | { type: "session_reset"; previousSessionId: string; sessionId: string }
  | {
      type: "session_history"
      sessionId: string
      requestId?: string
      /** Events through this sequence are included in the snapshot. */
      sequence?: number
      items: ChatItem[]
      running: boolean
      /** Pending permission requests (re-sent so a reopened panel can answer them). */
      pending: Extract<LiveEvent, { kind: "permission_request" }>[]
    }
  | { type: "event"; sessionId: string; event: LiveEvent; sequence?: number }
  | { type: "error"; error: string; sessionId?: string }
