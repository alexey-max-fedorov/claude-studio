import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: [{ find: /^url:(.*)$/, replacement: "$1?url" }] },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["src/lib/__tests__/setup.ts"],
  },
})
