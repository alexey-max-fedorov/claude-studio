import { EventEmitter } from "node:events"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type StudioConfig,
} from "@claude-studio/protocol"

const FILE_NAME = "claude-studio.config.json"

export class ConfigStore extends EventEmitter {
  readonly path: string
  private config: StudioConfig

  constructor(projectDir: string) {
    super()
    this.path = join(projectDir, FILE_NAME)
    this.config = this.load(projectDir)
  }

  private load(projectDir: string): StudioConfig {
    const base: StudioConfig = { ...DEFAULT_CONFIG, projectDir }
    if (!existsSync(this.path)) return base
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf-8"))
      // Overlay file values through validation; keep projectDir authoritative.
      return mergeConfig(base, { ...raw, projectDir })
    } catch {
      return base
    }
  }

  get(): StudioConfig {
    return this.config
  }

  /** Validate + merge + persist + emit. Returns the new config. */
  update(patch: Partial<StudioConfig>): StudioConfig {
    this.config = mergeConfig(this.config, patch)
    this.persist()
    this.emit("change", this.config)
    return this.config
  }

  private persist(): void {
    try {
      writeFileSync(this.path, JSON.stringify(this.config, null, 2) + "\n")
    } catch (err) {
      // best-effort: a non-writable cwd must not crash the server, but surface
      // the failure on stderr so a silent in-memory/on-disk divergence is visible.
      console.error(`[CONFIG] failed to persist ${this.path}: ${String(err)}`)
    }
  }
}
