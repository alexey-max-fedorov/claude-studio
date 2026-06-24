#!/bin/bash
# Auto-format files after Claude Code edits them
FILE_PATH=$(cat | jq -r '.tool_input.file_path // .tool_input.file_paths[0] // empty')
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
fi
