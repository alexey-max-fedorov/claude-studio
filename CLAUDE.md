# Claude Studio 3

A browser side panel that is a chat client for Claude Code running in one project dir.
Two components plus a shared contract:

- `protocol/`: `@claude-studio/protocol`, WS message types (v3) + validators. Source of truth for both sides.
- `agent/`: `claude-studio` daemon. Runs Claude Code via `@anthropic-ai/claude-agent-sdk` (streaming input, one live Query per session), WebSocket on 127.0.0.1:7281. `claude-studio --project <dir>`; on macOS it can run as a LaunchAgent (`scripts/install-launchagent.sh`). Log at `~/.claude-studio/agent.log`, config at `~/.claude-studio/config.json`.
- `extension/`: Plasmo MV3 extension (Chrome, Brave, other Chromium). The side panel owns the WebSocket; the background only does context menus, picker toggling and the pending-attachment queue. The extension ID is pinned via the manifest `key`, and the agent's default allowed Origin is that ID.
- `e2e/`: end-to-end suite against a real daemon on a scratch project (`pnpm e2e`).

## Key invariants
- Security: the daemon accepts WS only from the allowed extension Origin(s) and only with a loopback Host header, and refuses non-loopback binds without `--unsafe-bind`. Never loosen this; any web page could otherwise drive Claude Code with Bash.
- Sessions are real Claude Code sessions keyed by a client-minted UUID; transcripts (terminal ones included) are listed and resumed from disk. Client disconnects never kill sessions.
- Attachments are untrusted page data, wrapped in `<browser-context>` blocks, with `@` mentions neutralized and the user's typed text sent last (Claude Code expands `@path` in the last text block).
- Item ids: assistant/thinking `${messageId}:${index}` (shared by deltas and final items); tool_use = real `toolu_` id.
- UI copy: no em or en dashes.

## Commands
- Build all: `pnpm -r build`; tests: `pnpm -r test`; e2e: `pnpm e2e`.
- Run the agent: `node agent/dist/cli.js --project <dir>` or `PROJECT_DIR=<dir> scripts/install-launchagent.sh` (macOS).
- Extension: Load unpacked from `extension/build/chrome-mv3-prod`, reload after rebuilds.
