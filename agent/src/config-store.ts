import { EventEmitter } from "node:events"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { DEFAULT_CONFIG, mergeConfig, validateConfigPatch, type StudioConfig } from "@claude-studio/protocol"
import { errText, log } from "./logger.js"

export const DEFAULT_CONFIG_PATH = join(homedir(), ".claude-studio", "config.json")

/**
 * Agent-wide settings. Persisted to ~/.claude-studio/config.json (never inside
 * the project). projectDir always comes from the CLI flag and is never stored.
 * Emits "change" with (next, prev) after every effective update.
 */
export class ConfigStore extends EventEmitter {
  readonly path: string
  private config: StudioConfig

  constructor(projectDir: string, path: string = DEFAULT_CONFIG_PATH) {
    super()
    this.path = path
    this.config = this.load(projectDir)
  }

  private load(projectDir: string): StudioConfig {
    const base: StudioConfig = { ...DEFAULT_CONFIG, projectDir }
    if (!existsSync(this.path)) return base
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf-8"))
      return { ...mergeConfig(base, raw), projectDir }
    } catch (err) {
      log.warn("CONFIG", `ignoring unreadable ${this.path}: ${errText(err)}`)
      return base
    }
  }

  get(): StudioConfig {
    return this.config
  }

  /**
   * Validate + merge + persist + emit. Returns the sanitized patch that was
   * applied (empty when nothing valid was in it).
   */
  update(patch: unknown): Partial<StudioConfig> {
    const clean = validateConfigPatch(patch)
    if (Object.keys(clean).length === 0) return clean
    const prev = this.config
    this.config = { ...prev, ...clean, projectDir: prev.projectDir }
    this.persist()
    this.emit("change", this.config, prev)
    return clean
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const { projectDir: _omit, ...rest } = this.config
      writeFileSync(this.path, JSON.stringify(rest, null, 2) + "\n")
    } catch (err) {
      log.error("CONFIG", `failed to persist ${this.path}: ${errText(err)}`)
    }
  }
}
