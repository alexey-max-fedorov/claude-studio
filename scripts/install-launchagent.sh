#!/usr/bin/env bash
# macOS: build Claude Studio and run the agent as a LaunchAgent for one project.
#
#   PROJECT_DIR=~/code/my-app scripts/install-launchagent.sh
#
# Optional env: LABEL (default dev.claude-studio.agent), PORT (default 7281),
# NODE (default: node on PATH), SKIP_BUILD=1.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
: "${PROJECT_DIR:?Set PROJECT_DIR to the project Claude Code should run in}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
LABEL="${LABEL:-dev.claude-studio.agent}"
PORT="${PORT:-7281}"
NODE="${NODE:-$(command -v node)}"
STATE_DIR="$HOME/.claude-studio"
LOG="$STATE_DIR/agent.log"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
CLI="$REPO/agent/dist/cli.js"

cd "$REPO"
if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "==> Building protocol, agent, extension"
  pnpm --filter @claude-studio/protocol build
  pnpm --filter claude-studio build
  pnpm --filter @claude-studio/extension build
fi
test -f "$CLI" || { echo "$CLI missing (build failed?)"; exit 1; }
mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"

# launchd starts with a minimal PATH; give Claude Code (hooks, MCP servers) the usual tool dirs.
AGENT_PATH="$HOME/.local/bin:$(dirname "$NODE"):/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }
sed -e "s|__LABEL__|$(esc "$LABEL")|g" \
    -e "s|__NODE__|$(esc "$NODE")|g" \
    -e "s|__CLI__|$(esc "$CLI")|g" \
    -e "s|__PROJECT__|$(esc "$PROJECT_DIR")|g" \
    -e "s|__PORT__|$(esc "$PORT")|g" \
    -e "s|__PATH__|$(esc "$AGENT_PATH")|g" \
    -e "s|__LOG__|$(esc "$LOG")|g" \
    "$REPO/scripts/launchagent.plist.template" > "$PLIST_DST"

echo "==> Installing LaunchAgent $LABEL"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
# bootout is asynchronous; wait for the old job to unload before re-registering.
for _ in $(seq 1 20); do
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
for attempt in 1 2 3 4 5; do
  if launchctl bootstrap "$DOMAIN" "$PLIST_DST" 2>/dev/null; then break; fi
  [ "$attempt" = 5 ] && { echo "launchctl bootstrap failed for $PLIST_DST"; exit 1; }
  sleep 1
done
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "==> Waiting for health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:$PORT/health"; echo
    echo "Agent is up on ws://127.0.0.1:$PORT for $PROJECT_DIR"
    echo "Extension build: $REPO/extension/build/chrome-mv3-prod (Load unpacked in chrome://extensions)"
    exit 0
  fi
  sleep 1
done
echo "Agent did not come up. Log: $LOG"
tail -40 "$LOG" || true
exit 1
