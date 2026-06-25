<img width="1672" height="941" alt="image" src="https://github.com/user-attachments/assets/e7c954c6-1206-41b8-b1b5-12244eab05f9" />

# Claude Studio

Claude Studio is a visual AI coding assistant: select an element in your browser, describe a change, and Claude Code edits your source files in real time. It consists of exactly two components — a **browser extension** and an **agent** you run locally via `pnpx claude-studio` — connected over a WebSocket protocol documented in [`protocol/README.md`](protocol/README.md).

---

## Components

| Component | What it does |
|---|---|
| **Extension** (`extension/`) | Plasmo Chrome extension. Lets you pick DOM elements, type prompts, and see streaming Claude responses in the Agent tab. |
| **Agent** (`agent/`) | Node.js process (`claude-studio` npm package). Runs Claude Code locally, exposes a WebSocket server, and manages config. Start it with `pnpx claude-studio`. |

They communicate over a JSON-over-WebSocket protocol — see [`protocol/README.md`](protocol/README.md) for the full message reference.

---

## Quick start

```sh
# 1. In your project directory, start the agent
pnpx claude-studio

# The TUI prints a ws:// URL, e.g.:
#   WebSocket listening on ws://127.0.0.1:3456

# 2. Load the extension in Chrome
#    chrome://extensions → Enable Developer mode → Load unpacked
#    Select: extension/build/chrome-mv3-prod
#    (or install from the Chrome Web Store when available)

# 3. In the extension popup, paste the ws:// URL and connect
```

---

## The TUI

The agent runs an interactive terminal UI:

- Always shows the active `ws://` URL so you can paste it into the extension
- Arrow keys to navigate config fields; edit inline
- Reflects streaming output, tool calls, and cost in real time
- The **Agent tab** in the extension mirrors the TUI — any config change (model, max turns, etc.) syncs to all connected clients instantly

---

## Prerequisites

- **Node ≥ 20**
- **Claude Code CLI** installed and authenticated (`claude --version` should work)
- **Chrome** (Chromium-based browsers)

---

## Development from source

```sh
# Install dependencies (all packages)
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Dev mode — agent (hot-reload)
pnpm dev:agent

# Dev mode — extension (Plasmo watch)
pnpm dev:ext
```

Build the extension zip for distribution:

```sh
pnpm build:extension-zip
# writes dist/claude-studio-extension.zip
```

---

## Repo layout

```
claude-studio/
├── agent/       — claude-studio npm package (WebSocket server + Claude agent)
├── extension/   — Plasmo Chrome extension
├── protocol/    — shared TypeScript types + protocol documentation
├── website/     — marketing/docs site (Next.js)
├── scripts/     — build helpers (build-extension-zip.sh)
└── package.json — pnpm workspace root
```

---

## License

See [LICENSE](LICENSE).
