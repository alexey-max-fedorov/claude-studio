#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @claude-studio/extension build
SRC="extension/build/chrome-mv3-prod"
OUT="dist/claude-studio-extension.zip"
mkdir -p dist
rm -f "$OUT"
( cd "$SRC" && zip -r -q "../../../$OUT" . )
echo "Wrote $OUT"
