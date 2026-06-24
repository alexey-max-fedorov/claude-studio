import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { KNOWN_MODELS, type ModelInfo, type PluginInfo, type SkillInfo } from "@claude-studio/protocol"

export function availableModels(): ModelInfo[] {
  return KNOWN_MODELS.slice()
}

function scanRoots(projectDir: string): string[] {
  return [join(projectDir, ".claude"), join(homedir(), ".claude")]
}

function safeDirs(parent: string): string[] {
  if (!existsSync(parent)) return []
  try {
    return readdirSync(parent)
      .map((n) => join(parent, n))
      .filter((p) => {
        try { return statSync(p).isDirectory() } catch { return false }
      })
  } catch {
    return []
  }
}

export function discoverPlugins(projectDir: string): PluginInfo[] {
  const out: PluginInfo[] = []
  const seen = new Set<string>()
  for (const root of scanRoots(projectDir)) {
    for (const pluginDir of safeDirs(join(root, "plugins"))) {
      const manifest = join(pluginDir, ".claude-plugin", "plugin.json")
      if (!existsSync(manifest)) continue
      try {
        const json = JSON.parse(readFileSync(manifest, "utf-8"))
        const name = typeof json.name === "string" ? json.name : pluginDir.split("/").pop()!
        if (seen.has(name)) continue
        seen.add(name)
        out.push({ name, description: String(json.description ?? ""), path: pluginDir })
      } catch { /* skip malformed */ }
    }
  }
  return out
}

export function pluginPathByName(projectDir: string, name: string): string | undefined {
  return discoverPlugins(projectDir).find((p) => p.name === name)?.path
}

function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

export function discoverSkills(projectDir: string): SkillInfo[] {
  const out: SkillInfo[] = []
  const seen = new Set<string>()
  for (const root of scanRoots(projectDir)) {
    for (const skillDir of safeDirs(join(root, "skills"))) {
      const md = join(skillDir, "SKILL.md")
      if (!existsSync(md)) continue
      try {
        const fm = parseFrontmatter(readFileSync(md, "utf-8"))
        const name = fm.name || skillDir.split("/").pop()!
        if (seen.has(name)) continue
        seen.add(name)
        out.push({ name, description: fm.description ?? "", source: skillDir })
      } catch { /* skip */ }
    }
  }
  return out
}
