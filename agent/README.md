# claude-studio

The local agent daemon for **Claude Studio**. It runs Claude Code in a chosen project directory and connects to the browser side panel over a localhost WebSocket. Project instructions, memory, MCP servers, skills, plugins, hooks, and saved sessions use your normal Claude Code setup.

## Install and run

Requires **Node 20 or newer** and pnpm. From the project you want to work on:

```sh
pnpm dlx claude-studio@3
```

Or choose the project explicitly:

```sh
pnpm dlx claude-studio@3 --project /path/to/your/project
```

For a persistent global installation:

```sh
pnpm add --global claude-studio@3
claude-studio --project /path/to/your/project
```

The SDK supplies the platform-specific Claude Code runtime. Keep optional dependencies enabled when installing. The package supplies the SDK's required peer libraries, including for pnpm installations with automatic peer installation disabled.

Authenticate using your existing Claude Code installation (`claude auth login`), or configure your supported API-provider environment before starting the daemon. Authentication stays on your machine. This package does not expose a separate login command.

Then open the Claude Studio extension side panel. The daemon listens on `ws://127.0.0.1:7281` by default. Keep it running while using the panel; Ctrl+C stops it cleanly.

## Compatibility and upgrades

The **3.x agent speaks WebSocket protocol v3** and requires the revised protocol-v3 side panel. Upgrade the agent and extension together. The extension manifest version is independent of the protocol version. Protocol documentation is available in the [source repository](https://github.com/alexey-max-fedorov/claude-studio/blob/master/protocol/README.md).

For users upgrading from 2.x:

- The agent runs as a headless daemon; the browser panel provides chat, settings, and approvals.
- Settings live in `~/.claude-studio/config.json`. The old project-local `claude-studio.config.json` is unused.
- The selected directory's normal Claude Code configuration supplies tools, plugins, skills, and hooks.

## Options

```text
--project <dir>         project dir Claude Code runs in (default: cwd)
-p, --port <n>          port (default 7281, or $PORT)
--host <h>              bind host (default 127.0.0.1, loopback only)
--unsafe-bind           allow a non-loopback --host
--allow-origin <o>      extra allowed WebSocket Origin (repeatable), also
                        $CLAUDE_STUDIO_ALLOWED_ORIGINS (comma-separated)
-v, --version           print version
-h, --help              show this help
```

Environment: `CLAUDE_STUDIO_CONFIG=<file>` overrides the agent settings path. `CLAUDE_STUDIO_ALLOW_NO_ORIGIN=1` admits local test clients without an Origin header; normal browser use keeps this disabled.

The pinned extension origin is `chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol`. A differently published extension ID requires an explicit `--allow-origin chrome-extension://<id>`. Loopback Host checks and the Origin allowlist remain enabled.

Logs are timestamped lines on stdout/stderr. SIGINT/SIGTERM close live sessions, deny pending permissions, and stop the server. The repository's macOS LaunchAgent installer is a source-checkout helper; it is separate from the published package.

## Sessions and settings

- Each conversation is a real Claude Code session. Messages sent mid-turn are queued; panel disconnects keep sessions alive.
- Idle processes stop after 20 minutes and resume their saved conversation on the next message.
- Conversation resets migrate to the SDK's saved transcript ID. History merges recent live output and pending input with the saved transcript.
- The optional budget cap is cumulative across messages in a live SDK process. Process restart or `/clear` gives a fresh allowance.
- `GET /health` reports `{status, version, projectDir, live}`. A healthy listener confirms connectivity; working Claude Code authentication and runtime initialization are separate checks.
- Generic MCP form/auth elicitation is currently unsupported in the panel. Live-only result/error summaries use bounded in-memory buffers.

## Build and release from source

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm pack:agent
pnpm verify:package dist/claude-studio-3.0.0.tgz
```

Packing automatically rebuilds the protocol dependency and agent. The verification command installs the tarball in a disposable, production-only pnpm consumer with strict peers and automatic peer installation disabled. It checks package contents, the installed executable, protocol compatibility, native SDK initialization, project-skill loading, Origin rejection, and shutdown. It uses isolated settings and makes no model requests.

After reviewing and committing the release changes on your publishing branch, publish the verified tarball with pnpm:

```sh
pnpm publish dist/claude-studio-3.0.0.tgz --tag next --access public
```

The initial v3 rollout defaults to `next` so existing `latest` users keep the 2.x agent until the matching extension is ready. The explicit `claude-studio@3` commands above select v3 independently of the default tag. When the revised extension rollout is ready, promote the same version:

```sh
pnpm dist-tag add claude-studio@3.0.0 latest
```

Keep pnpm's normal git/release checks enabled. Publish only `claude-studio`; the protocol is bundled into its executable. The platform-specific SDK dependencies remain external so installation selects the runtime for the consumer's machine.

## License

Elastic-2.0, see [LICENSE](./LICENSE).
