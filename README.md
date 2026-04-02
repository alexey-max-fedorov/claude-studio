# Canvas Code

A visual AI coding assistant that lets you select elements on a live Next.js dev server page, describe changes in natural language, and have Claude Code execute those changes in source code — with instant HMR feedback.

## How It Works

1. Open your Next.js dev server in Chrome
2. Click an element on the page (or press `Ctrl+Shift+E` / `Cmd+Shift+E`)
3. Describe the change you want in the prompt widget
4. Claude Code finds the source file, edits it, and HMR reloads the page

The system has three components running simultaneously:

```
Browser Extension  ──WebSocket──►  Bridge Server  ──Claude Agent SDK──►  Claude Code
   (Plasmo)                         (Node.js)                             (in your project)
```

## Prerequisites

- Node.js 18+
- pnpm
- Chrome (or Chromium)
- Claude Code CLI installed and authenticated
- A Next.js project running in dev mode

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the server

Copy the example env file and point it at your project:

```bash
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env`:

```env
PORT=7281
PROJECT_DIR=/path/to/your/nextjs/project
MODEL=sonnet
MAX_BUDGET_USD=2.0
MAX_TURNS=15
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7281` | WebSocket server port |
| `PROJECT_DIR` | `cwd` | Absolute path to your Next.js project root |
| `MODEL` | `sonnet` | Claude model (`sonnet`, `opus`, `haiku`) |
| `MAX_BUDGET_USD` | `2.0` | Maximum spend per session in USD |
| `MAX_TURNS` | `15` | Maximum agentic turns per prompt |

### 3. Install the Claude Code plugin (optional but recommended)

The plugin adds a `visual-edit` skill and an auto-format hook that runs Prettier after each file edit.

```bash
# In your Next.js project directory, add the plugin path to your Claude Code settings
# or copy packages/plugin into your project's .claude-plugin directory
```

### 4. Load the browser extension

Build the extension:

```bash
pnpm --filter @canvas-code/extension build
```

Then load it in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/extension/build/chrome-mv3-prod`

For development with hot reload:

```bash
pnpm dev:ext
# Load packages/extension/.plasmo/chrome-mv3-dev instead
```

## Running

Start the bridge server and your Next.js dev server in separate terminals:

```bash
# Terminal 1 — bridge server
pnpm dev:server

# Terminal 2 — your Next.js project
cd /path/to/your/nextjs/project
pnpm dev
```

The server listens on `ws://localhost:7281` by default.

## Using the Extension

### Element Picker

**Toggle:** Click the Canvas Code extension icon or press `Ctrl+Shift+E` (`Cmd+Shift+E` on Mac).

When active, hovering over elements shows a gold highlight. Click any element to select it.

### Prompt Widget

After selecting an element, a floating prompt widget appears showing:
- The selected element's tag and CSS selector
- A textarea for your change description

**Submit:** Press `Ctrl+Enter` or click the send button.

**Cancel:** Press `Escape`.

### Side Panel

Open the side panel from the extension icon menu to see:
- Real-time streaming output from Claude Code
- Tool calls (file reads, edits) as they happen
- Session cost and turn count
- Connection status indicator

Click **New Session** to start fresh and clear conversation context.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+E` / `Cmd+Shift+E` | Toggle element picker |
| `Ctrl+Enter` | Submit prompt |
| `Escape` | Cancel / close picker |

## Example Prompts

- `Make this button rounded with a subtle shadow`
- `Change the font size to 18px and increase line height`
- `Add a hover effect that darkens the background by 10%`
- `Replace the hardcoded color with the primary brand color from the design tokens`
- `Make this section responsive — stack vertically on mobile`

## Project Structure

```
packages/
├── shared/     — Message protocol types (ElementSelection, ClientMessage, ServerMessage)
├── server/     — Node.js WebSocket bridge (Express + Claude Agent SDK)
├── extension/  — Plasmo Chrome extension (element picker, prompt widget, side panel)
└── plugin/     — Claude Code plugin (visual-edit skill, auto-format hook)
```

## Development

```bash
# Run all tests
pnpm test

# Server dev (watch mode)
pnpm dev:server

# Extension dev (hot reload)
pnpm dev:ext

# Build everything
pnpm build
```

Tests use vitest. There are 27 tests across three packages:
- `packages/shared` — protocol parsing/serialization (12 tests)
- `packages/server` — prompt builder (8 tests)  
- `packages/extension` — CSS selector generation (7 tests)

## Architecture Notes

**Session continuity:** The bridge server maintains a Claude Agent SDK session per WebSocket client. Sessions persist across multiple prompts until you click "New Session" or the connection drops, giving Claude Code context about previous edits.

**Session timeout:** Sessions expire after 5 minutes of inactivity to prevent runaway costs.

**Message queuing:** If the WebSocket disconnects, prompts submitted during the outage are queued (up to 50) and replayed automatically on reconnect.

**Element context:** Each prompt includes the element's CSS selector, computed styles, bounding rect, parent chain, and surrounding HTML — giving Claude Code everything it needs to find the right source file.

**Auto-format:** The Claude Code plugin hooks into `Edit`, `MultiEdit`, and `Write` tool calls to run Prettier automatically on any modified file.
