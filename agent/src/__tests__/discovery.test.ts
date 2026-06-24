import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { availableModels, discoverPlugins, discoverSkills, pluginPathByName } from "../discovery.js"

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cs-disc-")) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe("availableModels", () => {
  it("returns the curated model list", () => {
    const ids = availableModels().map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining(["sonnet", "opus", "haiku", "fable"]))
  })
})

describe("discoverPlugins", () => {
  it("parses plugin.json under .claude/plugins", () => {
    const p = join(dir, ".claude", "plugins", "my-plugin", ".claude-plugin")
    mkdirSync(p, { recursive: true })
    writeFileSync(join(p, "plugin.json"), JSON.stringify({ name: "my-plugin", description: "does things" }))
    const plugins = discoverPlugins(dir)
    expect(plugins).toContainEqual(expect.objectContaining({ name: "my-plugin", description: "does things" }))
    expect(pluginPathByName(dir, "my-plugin")).toContain(join(".claude", "plugins", "my-plugin"))
  })

  it("returns [] when no plugins exist", () => {
    expect(discoverPlugins(dir)).toEqual([])
  })
})

describe("discoverSkills", () => {
  it("parses SKILL.md frontmatter under .claude/skills", () => {
    const s = join(dir, ".claude", "skills", "my-skill")
    mkdirSync(s, { recursive: true })
    writeFileSync(join(s, "SKILL.md"), "---\nname: my-skill\ndescription: helpful\n---\nbody")
    const skills = discoverSkills(dir)
    expect(skills).toContainEqual(expect.objectContaining({ name: "my-skill", description: "helpful" }))
  })
})
