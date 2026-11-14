<img width="1672" height="941" alt="image" src="https://github.com/user-attachments/assets/e7c954c6-1206-41b8-b1b5-12244eab05f9" />

# Claude Studio

Claude Studio is a browser side panel that works as a full chat client for Claude Code running in one project dir, so you can talk to that project from the browser the same way you would in the terminal. Page info, selected text, page text, a screenshot or a picked element can be attached to any message. It consists of a **browser extension** (the side panel) and an **agent daemon** that runs Claude Code locally, connected over a localhost WebSocket protocol documented in [`protocol/README.md`](protocol/README.md) (protocol v3).

---

## Components

| Component | What it does |
|---|---|
| **Extension** (`extension/`) | Plasmo Chrome/Brave extension. Side panel chat: conversations, streaming replies, tool calls, permission prompts, browser context attachments. |
| **Agent** (`agent/`) | `claude-studio` daemon. Runs Claude Code (Agent SDK) in one project dir with your full Claude Code setup (CLAUDE.md, memory, MCP servers, skills, plugins, hooks), serves it on `ws://127.0.0.1:7281`, and keeps conversations alive while the panel is closed. |

---

## Published agent

The revised side panel uses protocol v3 and requires `claude-studio` 3.x. Once that release is published, run the agent from the project you want to work on:

```sh
pnpm dlx claude-studio@3
# Or choose a project explicitly:
pnpm dlx claude-studio@3 --project /path/to/your/project
```

See [agent/README.md](agent/README.md) for authentication, compatibility, and package-release instructions. `pnpm pack:agent` builds a publishable tarball; `pnpm verify:package` tests a fresh packed installation without model requests.

## Quick start

```sh
# 1. Build
pnpm install
pnpm -r build

# 2. Run the agent daemon for your project (logs go to stdout/stderr)
node agent/dist/cli.js --project /path/to/your/project
#   Claude Studio agent 3.0.0 listening on ws://127.0.0.1:7281

# 3. Load the extension
#    brave://extensions (or chrome://extensions), enable Developer mode,
#    Load unpacked: extension/build/chrome-mv3-prod
#    then open the side panel.
```

Daemon options: `--project <dir>` (default cwd), `--port <n>` (default 7281 or `$PORT`), `--host <h>` (default 127.0.0.1), `--allow-origin <origin>` (repeatable, or `$CLAUDE_STUDIO_ALLOWED_ORIGINS`). Run `claude-studio --help` for the full list.

For an always-on setup on macOS, `PROJECT_DIR=/path/to/your/project scripts/install-launchagent.sh` builds everything and installs a LaunchAgent (optional `LABEL`, `PORT`). The daemon needs no TTY and shuts down cleanly on SIGTERM.

### Security

The daemon drives Claude Code with the full toolset, including Bash, so it only accepts WebSocket connections whose `Origin` is the Claude Studio extension (`chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol` plus any `--allow-origin`) and whose `Host` is a loopback name. Other web pages cannot connect. Config lives in `~/.claude-studio/config.json`, outside the project.

---

## Prerequisites

- **Node ≥ 20.9** for source builds (the published agent supports Node ≥ 20)
- **Claude Code** authenticated on this machine (the Agent SDK uses your normal Claude Code login)
- **Brave or Chrome** (Chromium-based browsers with the side panel API)

---

## Development from source

```sh
# Install dependencies (all packages)
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Dev mode: agent (hot-reload)
pnpm dev:agent

# Dev mode: extension (local watch-build, no development server)
pnpm dev:ext
```

The extension watcher rebuilds `extension/build/chrome-mv3-dev` with production bundling and opens no development HTTP/WebSocket ports. Load that folder unpacked, then click **Reload** in `chrome://extensions` after a successful build. Reload affected pages to refresh content scripts. Network hot reload is disabled.

Build the extension zip for distribution:

```sh
pnpm build:extension-zip
# writes dist/claude-studio-extension.zip
```

---

## Repo layout

```
claude-studio/
├── agent/       : claude-studio daemon (WebSocket server + Claude Code sessions)
├── extension/   : Plasmo side panel extension
├── protocol/    : shared TypeScript types + protocol documentation (v3)
├── website/     : marketing/docs site (Next.js)
├── scripts/     : build helpers (build-extension-zip.sh)
└── package.json : pnpm workspace root
```

---

## License

See [LICENSE](LICENSE).
