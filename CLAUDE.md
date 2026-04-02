# Canvas Code

Monorepo with packages in `packages/`:
- `shared` — Message protocol types shared between server and extension
- `server` — Node.js bridge server (WebSocket + Claude Agent SDK)
- `extension` — Plasmo browser extension (element picker, prompt widget, side panel)
- `plugin` — Claude Code plugin (visual-edit skill, post-edit formatting hook)

## Conventions
- pnpm workspaces, TypeScript strict mode everywhere
- Tests with vitest, run via `pnpm -r test`
- Extension dev: `pnpm --filter @canvas-code/extension dev`
- Server dev: `pnpm --filter @canvas-code/server dev`
