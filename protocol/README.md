# @claude-studio/protocol

The WebSocket contract between the Claude Studio agent daemon and the browser side panel. Version **3** (`PROTOCOL_VERSION = 3`). The TypeScript source of truth is [`src/protocol.ts`](src/protocol.ts), [`src/config.ts`](src/config.ts) and [`src/validation.ts`](src/validation.ts); this file is the readable summary.

## Model

One agent daemon runs Claude Code (Agent SDK) in a single project dir. The side panel is a chat client for that project:

- A conversation is a real Claude Code session keyed by a UUID `sessionId`. The **client mints** the UUID for a new conversation. On the first `send` the agent resumes it if a transcript exists on disk, otherwise starts a new session with that id.
- Every conversation event carries its `sessionId`. A client receives events for sessions it has opened (`open_session`), sent to (`send`), or recovered through `get_state`.
- Transcripts on disk, including terminal sessions in the same project, can be listed and resumed.
- Closing the panel does not stop anything. A live Claude Code process stays up until 20 minutes idle, `close_session`, or the daemon stops.

## Transport and security

| Property | Value |
|---|---|
| URL | `ws://127.0.0.1:7281` (default) |
| Frames | JSON text, every message has a `type` |
| Max payload | 16 MB (screenshots) |
| Origin | must be in the allowlist; default only `chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol` |
| Host header | must be `127.0.0.1`, `localhost` or `[::1]` (DNS rebinding guard), HTTP and WS |
| Bind | loopback only; a non-loopback `--host` is refused unless `--unsafe-bind` is passed |
| Health | `GET /health` returns `{status, version, projectDir, live}` |
| Heartbeat | server pings every 30 s; the client may also send `ping` and get `pong` |

Rejected connections get HTTP 403 and are logged. `CLAUDE_STUDIO_ALLOW_NO_ORIGIN=1` admits connections with no Origin header (local test scripts only).

## Handshake

On connect the server sends `hello { serverVersion, protocol, projectDir }`, then `config_state`.

## Client to server

| `type` | Fields | Notes |
|---|---|---|
| `ping` | | replies `pong` |
| `get_state` | | replies `config_state` and `live_sessions`; subscribes to all currently live sessions |
| `set_config` | `patch: Partial<StudioConfig>` | sanitized by `validateConfigPatch`; success broadcasts `config_state` to all clients, nothing valid replies `config_error` |
| `list_sessions` | `limit?` (default 40), `offset?` | replies `session_list` |
| `open_session` | `sessionId, requestId?, followResets?` | subscribes, replies `session_history` (see below) |
| `send` | `sessionId, text, attachments` | subscribes; starts or resumes the session; queued if a turn is running |
| `interrupt` | `sessionId` | stops the running turn (Esc in the terminal) |
| `permission_response` | `sessionId, requestId, behavior, always?, message?, updatedInput?` | first answer wins; a late answer gets `error` |
| `close_session` | `sessionId` | stops the live process; history stays on disk |
| `rename_session` | `sessionId, title` | replies with a fresh `session_list` (offset 0) |

Every inbound frame goes through `parseClientMessage`; failures reply `error`.

## Server to client

| `type` | Fields |
|---|---|
| `hello` | `serverVersion, protocol, projectDir` |
| `pong` | |
| `config_state` | `config, models, commands, permissionModes` (sent on connect and on every config change. At boot the daemon reads the real model and slash command lists from Claude Code without a model call, about 2 s; until then `models` is a static fallback and `commands` is empty, and a fresh `config_state` is broadcast when they arrive) |
| `config_error` | `error` |
| `session_list` | `sessions: SessionSummary[], offset, hasMore` |
| `session_history` | `sessionId, requestId?, sequence?, items: ChatItem[], running, pending` (pending permission requests to re-show) |
| `live_sessions` | `sessions: {sessionId, running, pending: string[]}[]` (pending request IDs) |
| `session_reset` | `previousSessionId, sessionId` (migrate subscriptions and current conversation to the new ID) |
| `event` | `sessionId, event: LiveEvent, sequence?` |
| `error` | `error, sessionId?` |

## LiveEvent

| `kind` | Meaning |
|---|---|
| `status` | `starting` (process launching), `running` (a turn is in progress), `idle` |
| `text_delta` / `thinking_delta` | streamed text for block `id`; append to that block |
| `item` | a finished `ChatItem` (see below) |
| `permission_request` | `requestId, toolName, input, title?, blockedPath?, canAlwaysAllow` |
| `permission_resolved` | `requestId, behavior` (sent to every subscriber, so other panels can hide the prompt) |

Typical turn: `status:starting` (new process only), `item:user`, `status:running`, deltas, `item:thinking` / `item:assistant` / `item:tool_use` / `item:tool_result` ..., `item:result`, `status:idle`.

## ChatItem ids

Live events and `session_history` use the same ids, so clients should **upsert by id**:

- `user`: the id of the SDK user message (a UUID the agent mints on `send`). The agent echoes the user item to all subscribers, including the sender.
- `assistant` / `thinking`: `${apiMessageId}:${blockIndex}`, identical to the `text_delta` / `thinking_delta` id, so the final item replaces the streamed text.
- `tool_use`: the real tool_use id (`toolu_...`). `tool_result.toolUseId` is that same id. Subagent tool calls carry `parentToolUseId` = the parent Task/Agent call's `toolu_` id; subagent text and thinking are not sent.
- `result`: `costUsd` is the cost of this turn. For a session resumed from outside this daemon (for example a terminal session) the prior total is unknown, so the first result after resuming reports 0. `errorText` is set when the turn stopped early ("Interrupted by the user.", max turns, budget cap, API error).
- `system`: compaction, API retries, interrupts, local slash-command output. In history a slash command shows as a `user` item (`/model opus`) followed by a `system` item with its output; `!cmd` shell entries likewise. History does not include subagent tool calls (they live in separate transcripts); live events do.
- `error`: the Claude Code process failed.
- `result`, `error`, and `system` may carry a stable `id` for upserting live-only rows across history snapshots. The daemon retains these rows in bounded in-memory buffers; daemon restart or cache eviction can discard information absent from the saved transcript.

Empty thinking blocks (models that hide thinking) are not sent.

`session_history` for a live session merges the transcript on disk with what the current turn emitted that the transcript does not have yet (so a brand-new session reopened mid-turn still shows the user message), deduped by id, appending only items newer than the last one already on disk. Recent completed items remain in a bounded live buffer so a disk snapshot taken before completion can still include the final reply. Blocks still streaming are included as `assistant` / `thinking` items holding the text so far, with their block id; keep appending later `text_delta` / `thinking_delta` events to them, and the final item with the same id replaces them.

The agent sequences live events monotonically for its lifetime. A history response's `sequence` covers the live items and partial blocks included in that snapshot. While history is loading, clients retain incoming events, apply the snapshot, and replay only events with a greater sequence. `requestId` is echoed from `open_session`; clients ignore superseded responses. Both fields are optional for compatibility with earlier v3 agents.

Claude Code can reset a conversation, including through `/clear` or plan exit with fresh context. `session_reset` migrates the live process and its subscribers to the new SDK conversation ID. Clients clear the transcript, preserve drafts and queued sends under the new ID, and request its history. In-flight sends and controls follow per-client reset aliases. Automatic history refreshes set `followResets: true`; an explicit archive selection clears that client's alias for the selected ID. The old transcript remains available in the session list. The subsequent SDK initialization ID is authoritative for the saved transcript; the agent reconciles it if it differs from the announced reset ID.

## Attachments

`send.attachments` carry browser context: `page`, `selection`, `page_text`, `screenshot` (data URL, png/jpeg/webp) and `element` (`ElementSelection`; `id`, `classList` (max 100 x 500 chars), `attributes` (max 100) and `parentChain` (max 100) are type-checked). The agent turns each into a `<browser-context type="..." url="..." title="...">` text block (screenshots add an image block), followed by the user's typed text as the **last** block. Claude is told this is untrusted page data. History shows them as `AttachmentSummary { type, label }`, where label is the title or URL, and the user item's `text` is exactly what was typed (empty for an attachments-only message, live and in history).

Page data is made inert: every `@` in attachment-derived text (including url and title) gets an invisible U+2060 after it, so Claude Code never expands a page's `@/path` or `@server:resource` mention into a file read, and `<browser-context` tags in page data (any spacing or case) are escaped. Only `@` mentions the user typed work, as in the terminal.

A `send` with no attachments goes to Claude Code as a plain string, exactly like the terminal, so slash commands (for example `/compact`) work.

## Permissions

`permission_request` is raised by the SDK `canUseTool` callback, depending on `config.permissionMode` and the project's permission rules (read-only commands such as `echo` or `ls` are usually auto-approved).

- allow: `{behavior: "allow", always?: true}`. `always` applies the SDK's "always allow" suggestions (only when `canAlwaysAllow`).
- deny: `{behavior: "deny", message?}`. Claude sees the message (default "User denied this in the browser panel.").
- AskUserQuestion also arrives as a `permission_request` (toolName `AskUserQuestion`). Answer with `behavior: "allow"` and `updatedInput: {...input, answers: {"<question text>": "<chosen label(s), comma-joined>"}}`.

## StudioConfig

Persisted in `~/.claude-studio/config.json` (never in the project). `projectDir` comes from the daemon's `--project` flag and is read-only.

| Field | Default | Applies |
|---|---|---|
| `model` | `""` (Claude Code default) | live (`setModel`) |
| `permissionMode` | `acceptEdits` | live (`setPermissionMode`) |
| `effort` | `""` | next process start |
| `systemPromptAppend` | `""` | next process start |
| `maxBudgetUsd` | `null` | next process start |
| `maxTurns` | `null` | next process start |

`maxBudgetUsd` caps cumulative spending across messages in one live SDK process. A process restart (including after idle eviction) or conversation clear (`/clear`) gives a fresh allowance. `null` means no cap. The pinned SDK has no budget-reset setter.

When a "next process start" field changes, idle live sessions are closed right away (busy ones when their turn ends), and the next `send` resumes them with the new options.

## Validation limits

See `src/validation.ts`: text 200k chars, page text 400k, screenshot data URL 12 MB, 12 attachments per message, session ids must be UUIDs.
