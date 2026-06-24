import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { log } from "./logger.js"
import { config } from "./config.js"

interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>
}

interface McpConfig {
  mcpServers?: Record<string, unknown>
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return null
  }
}

export function logClaudeEnvironment(): void {
  const globalDir = path.join(os.homedir(), ".claude")
  const projectDir = path.join(config.projectDir, ".claude")

  // --- Plugins ---
  const globalSettings = readJson<ClaudeSettings>(path.join(globalDir, "settings.json"))
  const projectSettings = readJson<ClaudeSettings>(path.join(projectDir, "settings.json"))

  const globalPlugins = Object.entries(globalSettings?.enabledPlugins ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)

  const projectPlugins = Object.entries(projectSettings?.enabledPlugins ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)

  const allPlugins = [...new Set([...globalPlugins, ...projectPlugins])]

  if (allPlugins.length === 0) {
    log.dim("ENV", "Plugins: none")
  } else {
    for (const plugin of allPlugins) {
      const scope =
        globalPlugins.includes(plugin) && projectPlugins.includes(plugin)
          ? "global+project"
          : globalPlugins.includes(plugin)
            ? "global"
            : "project"
      log.dim("ENV", `Plugin: ${plugin} (${scope})`)
    }
  }

  // --- MCP Servers ---
  const globalMcp = readJson<McpConfig>(path.join(globalDir, ".mcp.json"))
  const projectMcp = readJson<McpConfig>(path.join(config.projectDir, ".mcp.json"))

  const globalMcpServers = Object.keys(globalMcp?.mcpServers ?? {})
  const projectMcpServers = Object.keys(projectMcp?.mcpServers ?? {})
  const allMcp = [...new Set([...globalMcpServers, ...projectMcpServers])]

  if (allMcp.length === 0) {
    log.dim("ENV", "MCP servers: none")
  } else {
    for (const srv of allMcp) {
      const scope =
        globalMcpServers.includes(srv) && projectMcpServers.includes(srv)
          ? "global+project"
          : globalMcpServers.includes(srv)
            ? "global"
            : "project"
      log.dim("ENV", `MCP: ${srv} (${scope})`)
    }
  }
}
