# @claude-studio/protocol

Human-readable reference for the WebSocket protocol between the Claude Studio agent and its clients (browser extension, TUI, or any other integrator).

---

## Transport

| Property | Value |
|---|---|
| Protocol | WebSocket |
| Frame format | JSON text frames (UTF-8) |
| Bind address | `127.0.0.1` (loopback only, by default) |
| Max payload | 1 MB |
| Discriminator | Every message has a required `type: string` field |

All messages are plain JSON objects. The `type` field is the discriminated-union tag. Unknown `type` values are rejected with an error.

---

## Connection Handshake

On every new client connection the server immediately sends two messages in sequence:

1. `connected` — identifies the client and the server version.
2. `config_state` — a full snapshot of the current config, available models, plugins, and skills.

Clients do not need to send `get_config` on startup; they receive the state automatically.

---

## Client → Server Messages

Messages sent from a client (extension or TUI) to the agent.

| `type` | Fields | Description |
|---|---|---|
| `ping` | _(none)_ | Keepalive. Server replies with `pong`. |
| `prompt` | `route: string`, `element: ElementSelection`, `prompt: string` | Run a prompt in the context of a picked DOM element. `route` is the current page route (max 1 000 chars). `prompt` is the user instruction (max 50 000 chars). |
| `raw_prompt` | `prompt: string` | Run a prompt with no element context (max 50 000 chars). |
| `reset_session` | _(none)_ | Discard the current agent session and start a fresh one. Server replies with `session_reset`. |
| `interrupt` | _(none)_ | Abort the in-flight agent turn. |
| `get_config` | _(none)_ | Request the current config. Server replies with `config_state`. |
| `set_config` | `patch: Partial<StudioConfig>` | Merge a partial config update. See [Config sync rule](#config-sync-rule). |
| `query_capabilities` | _(none)_ | Ask what slash commands the agent exposes. Server replies with `capabilities`. |

### `ElementSelection` shape (used in `prompt`)

```ts
interface ElementSelection {
  tagName: string            // e.g. "DIV"
  id: string                 // element id attribute (may be empty)
  classList: string[]        // CSS classes (max 50 entries, each max 200 chars)
  cssSelector: string        // unique CSS selector (max 2 000 chars)
  textContent: string        // visible text (max 2 000 chars)
  outerHTML: string          // serialised HTML (max 2 000 chars)
  attributes: Record<string, string>  // element attributes (max 50 keys)
  boundingRect: { top: number; left: number; width: number; height: number }
  computedStyles: {
    color: string            // max 200 chars (validated)
    backgroundColor: string  // max 200 chars (validated)
    fontSize: string         // max 200 chars (validated)
    fontFamily: string       // not validated for size
    padding: string          // not validated for size
    margin: string           // not validated for size
  }
  parentChain: string[]      // ancestor selectors, root-first (max 50 entries)
  siblingCount: number
  childCount: number
}
```

---

## Server → Client Messages

Messages sent from the agent to all connected clients.

| `type` | Fields | Description |
|---|---|---|
| `connected` | `clientId: string`, `serverVersion: string` | First message on connect. Gives the client a unique id and the server version string. |
| `pong` | _(none)_ | Reply to `ping`. |
| `ai_streaming` | `chunk: string` | Incremental text chunk from the model during a streaming response. |
| `tool_use` | `tool: string`, `input: Record<string, unknown>` | Emitted each time the agent calls a tool (e.g. `Read`, `Edit`). |
| `ai_complete` | `result: string`, `sessionId: string`, `cost: number`, `turns: number`, `usage: Usage`, `duration_ms: number`, `model: string` | The agent turn finished. Includes total cost (USD), turn count, token usage, wall-clock duration, and the model that was used. |
| `ai_error` | `error: string` | The agent turn failed. Contains a human-readable error message. |
| `session_reset` | `newSessionId: string` | Confirms the session was reset. `newSessionId` is the fresh session identifier. |
| `session_info` | `model: string`, `cumulativeCost: number`, `cumulativeInputTokens: number`, `cumulativeOutputTokens: number`, `turnCount: number` | Periodic snapshot of session-level stats. |
| `capabilities` | `commands: SlashCommand[]` | Reply to `query_capabilities`. Lists the slash commands the agent exposes. |
| `command_output` | `content: string` | Output from a slash command invocation. |
| `config_state` | `config: StudioConfig`, `availableModels: ModelInfo[]`, `availablePlugins: PluginInfo[]`, `availableSkills: SkillInfo[]` | Full config snapshot. Sent on connect and after every `set_config`. |
| `config_error` | `error: string` | A `set_config` patch was rejected (validation failed). |

### Supporting types

```ts
interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

interface ModelInfo {
  id: string    // Claude model alias or full model id
  name: string  // Human-readable display name
}

interface PluginInfo {
  name: string
  description: string
  path: string  // Absolute path to the plugin on disk
}

interface SkillInfo {
  name: string
  description: string
  source: string  // Skill source (file path or identifier)
}

interface SlashCommand {
  name: string
  description: string
  argumentHint: string  // Placeholder shown in the UI, e.g. "<file>"
}
```

---

## `StudioConfig` Shape

The agent holds a single `StudioConfig` object as its source of truth. It is persisted to `claude-studio.config.json` and broadcast to all clients after every change.

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `"sonnet"` | Claude model alias (`"sonnet"`, `"opus"`, `"haiku"`, `"fable"`) or a full model id. Applied on every `query()` call. |
| `projectDir` | `string` | `""` | Absolute working directory Claude Code operates in. Used for display / informational purposes. Max 1 000 chars. |
| `maxTurns` | `number` | `20` | Max agentic turns per prompt. Clamped to **1–100**. |
| `maxBudgetUsd` | `number` | `2` | Max spend (USD) per session. Clamped to **0–1 000**. |
| `permissionMode` | `PermissionMode` | `"acceptEdits"` | SDK permission mode. One of `"default"`, `"acceptEdits"`, `"plan"`, `"bypassPermissions"`. |
| `allowBash` | `boolean` | `false` | When `true`, `"Bash"` is added to the agent's allowed tools alongside the base set. |
| `systemPromptAppend` | `string` | `""` | Extra instructions appended to the agent's system prompt. Max 50 000 chars. |
| `routeHints` | `boolean` | `true` | When `true`, framework route→file hints are included in element-edit prompts. |
| `enabledPlugins` | `string[]` | `[]` | Names of discovered Claude Code plugins that are active. Max 50 entries. |
| `enabledSkills` | `string[]` | `[]` | Names of discovered Claude Code skills that are active. Max 50 entries. |

### Base allowed tools

The agent always has these tools available:

```
Read, Edit, MultiEdit, Glob, Grep
```

`Bash` is added when `allowBash: true`.

### Known models

The curated default model list (refined at runtime by discovery):

| Alias | Display name |
|---|---|
| `sonnet` | Claude Sonnet 4.6 |
| `opus` | Claude Opus 4.8 |
| `haiku` | Claude Haiku 4.5 |
| `fable` | Claude Fable 5 |

---

## Config Sync Rule

Any client can send `set_config` at any time. The flow is:

1. The agent receives `set_config { patch }`.
2. It validates and sanitizes the patch (unknown keys dropped, ranges clamped — see [Validation limits](#validation-limits)).
3. The sanitized patch is merged into the live config.
4. The merged config is persisted to `claude-studio.config.json`.
5. The agent broadcasts `config_state` to **all** connected clients.

This is bidirectional and realtime: both the TUI and the extension see every config change, no matter which client initiated it.

On a valid `set_config`, the agent validates the patch (silently clamping out-of-range numbers and dropping unknown or wrong-typed keys), merges it into the live config, persists to `claude-studio.config.json`, and broadcasts `config_state` to all clients. A `set_config` whose `patch` is not a JSON object is rejected at message-parse time (the sending client receives an `ai_error`). `config_error` is reserved for the rare case where applying an otherwise-parsed config update fails.

---

## Reliable Model Switching

Model is a standard config field — there is no `/model` slash command. To switch models:

```json
{ "type": "set_config", "patch": { "model": "opus" } }
```

The agent applies `config.model` on **every** `query()` call. This means the model override takes effect even inside a resumed session — it always wins over whatever model the session was originally started with.

---

## Validation Limits

These limits are enforced by the server on incoming `ClientMessage` frames. Payloads that exceed them are rejected.

| Field / context | Limit |
|---|---|
| `prompt` (in `prompt` and `raw_prompt`) | 50 000 chars |
| `route` (in `prompt`) | 1 000 chars |
| Element string fields (`cssSelector`, `tagName`, `id`, `textContent`, `outerHTML`) | 2 000 chars each |
| `computedStyles.color`, `computedStyles.backgroundColor`, `computedStyles.fontSize` | 200 chars each |
| List fields (`classList`, `parentChain`, `attributes`, `enabledPlugins`, `enabledSkills`) | 50 entries max |
| `StudioConfig.maxTurns` | Clamped to 1–100 |
| `StudioConfig.maxBudgetUsd` | Clamped to 0–1 000 (USD) |
| Global max payload | 1 MB |
