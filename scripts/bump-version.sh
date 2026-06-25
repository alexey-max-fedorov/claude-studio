#!/usr/bin/env bash
# Bump the version field of every publishable package in lockstep.
# Usage: scripts/bump-version.sh <X.Y.Z | patch | minor | major>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(protocol agent extension website)

arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "usage: $0 <X.Y.Z|patch|minor|major>" >&2
  exit 1
fi

CURRENT="$(node -e "console.log(require('$ROOT/protocol/package.json').version)")"

if [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$arg"
elif [[ "$arg" =~ ^(patch|minor|major)$ ]]; then
  NEW="$(node -e "const [a,b,c]='$CURRENT'.split('.').map(Number); const k='$arg'; console.log(k==='major'?\`\${a+1}.0.0\`:k==='minor'?\`\${a}.\${b+1}.0\`:\`\${a}.\${b}.\${c+1}\`)")"
else
  echo "invalid version: $arg (expected X.Y.Z or patch|minor|major)" >&2
  exit 1
fi

echo "Bumping $CURRENT -> $NEW"
for p in "${PACKAGES[@]}"; do
  f="$ROOT/$p/package.json"
  # Replace ONLY the first "version": "..." (the top-level field); dependency keys
  # are package names, never literally "version", so this never touches them.
  perl -0777 -i -pe 's/("version"\s*:\s*")[^"]*(")/${1}'"$NEW"'${2}/' "$f"
  echo "  $p -> $NEW"
done
echo "Done. All packages at $NEW."
