# claude-studio

The local agent for **Claude Studio** — a visual AI coding assistant. Pick an
element in your browser, describe a change in plain English, and Claude Code
edits your source files. The agent runs Claude Code locally, exposes a
WebSocket server, and pairs with the [Claude Studio browser extension](https://chromewebstore.google.com/detail/claude-studio/bpcmnngncojfbddicenjebaglkdplodk).

## Usage

In your project directory:

```sh
pnpx claude-studio
```

An interactive terminal UI starts and prints the WebSocket URL (default
`ws://127.0.0.1:7281`). Paste that URL into the extension's side panel to
connect.

### Options

```
-p, --port <n>     WebSocket port (default 7281, or $PORT)
    --host <h>     bind host (default 127.0.0.1, or $BIND_HOST)
    --no-tui       headless mode (print URL, log to stderr)
-v, --version      print version
-h, --help         show this help
```

## Prerequisites

- **Node ≥ 20**
- **Claude Code** installed and authenticated

## How it works

Config lives in the agent and is the single source of truth — model,
permissions, turn and budget caps, plugins, and skills. Change it from the TUI
or the extension and the update broadcasts to every connected client over the
WebSocket in real time. Model switching is applied on every turn, so it never
drifts.

The full message contract is documented in the
[`protocol/`](https://github.com/alexey-max-fedorov/claude-studio/tree/master/protocol)
package.

## License

Elastic-2.0 — see [LICENSE](./LICENSE).

---

Part of the [Claude Studio](https://github.com/alexey-max-fedorov/claude-studio)
project.
