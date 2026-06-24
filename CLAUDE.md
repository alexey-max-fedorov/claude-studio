# Claude Studio 2.0

Two-component visual AI coding assistant. A browser extension and a `pnpx claude-studio`
agent server talk over a WebSocket using the shared `protocol/` contract.

## Workspaces (pnpm)
- `protocol/` — `@claude-studio/protocol`: WS message types + runtime validators + spec docs. Dependency-free. Consumed by both extension and agent.
- `agent/` — `claude-studio`: the server. Boots a WebSocket server + an Ink TUI sharing one `ConfigStore` (single source of truth). Runs Claude Code via `@anthropic-ai/claude-agent-sdk`. Run with `pnpx claude-studio` in a project dir.
- `extension/` — `@claude-studio/extension`: Plasmo browser extension (element picker, prompt widget, side panel with Chat + Agent-config tabs).
- `website/` — `@claude-studio/website`: marketing site (Next.js).

## Key invariants
- Config lives only in the agent's `ConfigStore`. Changes are persisted to `claude-studio.config.json` and broadcast to all clients as `config_state`. Extension/TUI render config_state and request changes via `set_config`.
- Model switching is config-driven: the agent passes `options.model` to every `query()` call. Never via slash commands.
- All client→server messages pass `parseClientMessage`. Untrusted element/user content is nonce-delimited in prompts.

## Conventions
- TypeScript strict everywhere. ESM. `.js` import specifiers in agent/protocol source.
- Tests with vitest: `pnpm -r test`.
- Agent dev: `pnpm --filter claude-studio dev`. Extension dev: `pnpm --filter @claude-studio/extension dev`.

`.reference/` holds the archived v1 repo for porting. Do not ship it.
