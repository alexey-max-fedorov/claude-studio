# e2e

End-to-end tests for the Claude Studio daemon (protocol v3). They talk to the real daemon over its WebSocket and run real Claude Code turns with model `haiku`, so a run costs a few cents and needs Claude Code to be logged in.

## Run

```sh
pnpm --filter claude-studio build   # the suite runs agent/dist/cli.js
pnpm e2e                            # from the repo root
pnpm e2e:selftest                   # client + validator only, no daemon, no API calls
pnpm --filter e2e test              # no-model config isolation and restoration regressions
pnpm --filter e2e typecheck
```

By default the suite creates a throwaway project under the OS temp dir (README.md + notes.txt) and gives the daemon its own config file inside that scratch directory. It spawns `node agent/dist/cli.js --project <it> --port <free port>` with secure defaults, runs every scenario, then kills the daemon and deletes the scratch directory and its Claude Code transcripts. The developer's configured settings files remain untouched.

Each scenario prints `PASS` or `FAIL` with its time, failed checks (`x`), notes (`-`), and on failure a trace of the messages that client saw. The process exits non-zero on any failure. Global timeout: 6 minutes.

## Scenarios

| id | what |
|----|------|
| a | Origin and Host guards (evil origin, no origin, spoofed Host on WS and HTTP), `/health` |
| b | `hello` then `config_state` on connect; `set_config` is broadcast to a second client |
| c | new chat "Reply with exactly: PONG": status, text deltas, assistant item, result, idle; delta ids match the final item |
| d | `open_session` on a new connection returns the history; `list_sessions` has the session with a title |
| e | Bash `cp notes.txt notes-copy.txt && cat notes-copy.txt` in `default` mode: permission request, allow, `toolu_` tool_use, matching tool_result (a bare `cat` is auto-approved by Claude Code as read-only, so it never prompts) |
| f | Bash `touch denied.txt`: deny, file must not exist, turn finishes |
| g | `page_text` attachment with a secret word and an injection line; tiny PNG screenshot; history shows chips and the bare user text |
| h | disconnect mid-turn, reconnect, turn still completes and the session stays live |
| i | interrupt after the first delta: idle quickly, no more deltas |
| j | malformed messages get `error` replies and the socket stays open |
| k | `/clear` migrates to the canonical transcript ID; fresh history and remembered context survive process close/resumption |

Every server message is checked against the protocol shapes (`lib/validate.ts`). Unknown types or kinds and missing fields fail the run; extra keys are listed as warnings.

## Options (env)

| var | effect |
|-----|--------|
| `E2E_URL=ws://127.0.0.1:7281` | use an already running daemon; skips e and f (they need the scratch project). Its project gets real test sessions, and its model and permission mode are set back at the end |
| `E2E_DAEMON=<path>` | daemon entry file (default `agent/dist/cli.js`) |
| `E2E_PORT=<n>` | port for the spawned daemon |
| `E2E_ONLY=a,c,d` | run only these scenarios (d needs c) |
| `E2E_KEEP=1` | keep the scratch dir, daemon log and transcripts |
| `E2E_VERBOSE=1` | print every raw server frame |

## Layout

- `lib/client.ts`: typed test client (`connect`, `send`, `waitFor`, `probeConnect`), collects every message and validates it on arrival
- `lib/validate.ts`: hand-written shape checks for every ServerMessage, LiveEvent and ChatItem variant, keyed by the protocol unions so `tsc` breaks when the protocol changes
- `lib/util.ts`: free port, raw HTTP GET with a Host override, tiny PNG encoder
- `run.ts`: the scenarios
- `test-fixtures/`: a tiny fake server and the self test for the client and validator
