import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export function checkPrerequisites(): { ok: boolean; missing: string[] } {
  const missing: string[] = []

  const nodeVersion = process.versions.node
  const major = parseInt(nodeVersion.split(".")[0], 10)
  if (major < 18) {
    missing.push(`Node.js >= 18 (found ${nodeVersion})`)
  }

  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (!existsSync(packageJsonPath)) {
    missing.push("package.json not found — run this from your project root")
  }

  return { ok: missing.length === 0, missing }
}

export function isNextJsProject(): boolean {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json")
    if (!existsSync(packageJsonPath)) return false
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
    return !!(pkg.dependencies?.next || pkg.devDependencies?.next)
  } catch {
    return false
  }
}

export function hasClaudeCode(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}
