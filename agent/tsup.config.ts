import { defineConfig } from "tsup"

// The agent ships as a single self-contained `claude-studio` package.
// `@claude-studio/protocol` is our own dependency-free workspace package, so we
// bundle it into the CLI artifact rather than publishing it separately. Real
// runtime dependencies (ws, @anthropic-ai/claude-agent-sdk) and all node:
// built-ins stay external.
export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  noExternal: ["@claude-studio/protocol"],
})
