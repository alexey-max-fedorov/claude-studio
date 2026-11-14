import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

test("website avoids blanket analytics-free claims while its analytics component is enabled", () => {
  const layout = readFileSync(join(root, "website/src/app/layout.tsx"), "utf8")
  if (!/<Analytics\b/.test(layout)) return
  for (const path of sourceFiles(join(root, "website/src"))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\bno\s+(?:analytics|telemetry)\b/i, path)
  }
})

test("privacy policy explains every declared browser permission", () => {
  const manifest = JSON.parse(readFileSync(join(root, "extension/package.json"), "utf8")).manifest
  const policy = readFileSync(join(root, "PRIVACY.md"), "utf8")
  for (const permission of [...manifest.permissions, ...manifest.host_permissions]) {
    assert.ok(policy.includes(permission), `Missing permission disclosure: ${permission}`)
  }
})
