# claude-studio

The local agent daemon for **Claude Studio**, a browser side panel that is a full chat client for Claude Code running in one project dir. The daemon runs Claude Code (Agent SDK) with your normal setup (CLAUDE.md, memory, MCP servers, skills, plugins, hooks) and serves it to the side panel over a localhost WebSocket.

## Usage

```sh
claude-studio --project /path/to/project
```

```
--project <dir>         project dir Claude Code runs in (default: cwd)
-p, --port <n>          port (default 7281, or $PORT)
--host <h>              bind host (default 127.0.0.1, loopback only)
--unsafe-bind           allow a non-loopback --host
--allow-origin <o>      extra allowed WebSocket Origin (repeatable), also
                        $CLAUDE_STUDIO_ALLOWED_ORIGINS (comma-separated)
-v, --version           print version
-h, --help              show this help
```

Environment: `CLAUDE_STUDIO_ALLOW_NO_ORIGIN=1` admits connections without an Origin header (local test scripts only). `CLAUDE_STUDIO_CONFIG=<file>` overrides the config path (default `~/.claude-studio/config.json`).

Logs are timestamped lines on stdout/stderr, so it runs fine under a macOS LaunchAgent. SIGINT/SIGTERM close live sessions, deny pending permission prompts and stop the server.

## How it works

- Each conversation is a real Claude Code session (UUID minted by the panel). One live Claude Code process per active conversation, fed in streaming input mode; messages sent mid-turn are queued like in the terminal. Idle processes stop after 20 minutes and resume on the next message.
- Panel disconnects never stop a session. Reopening a conversation returns its history from the transcript on disk, plus any pending permission prompts.
- Only the Claude Studio extension origin and loopback Host headers are accepted.
- `GET /health` returns `{status, version, projectDir, live}`.

The message contract is in the [`protocol/`](../protocol/README.md) package (v3).

## Prerequisites

- Node 20 or newer
- Claude Code authenticated on this machine

## License

Elastic-2.0, see [LICENSE](./LICENSE).
