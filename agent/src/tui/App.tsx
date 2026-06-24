import React, { useEffect, useState } from "react"
import { Box, useApp, useInput } from "ink"
import type { StudioConfig } from "@claude-studio/protocol"
import type { ConfigStore } from "../config-store.js"
import type { ConnectionManager } from "../connection-manager.js"
import { availableModels, discoverPlugins, discoverSkills } from "../discovery.js"
import { StatusBar } from "./StatusBar.js"
import { ConfigPanel, configRows } from "./ConfigPanel.js"
import { TogglesPanel } from "./TogglesPanel.js"
import { LogPanel } from "./LogPanel.js"

const PERMISSION_CYCLE = ["acceptEdits", "default", "plan", "bypassPermissions"] as const

export function App({ config, connections, url }: { config: ConfigStore; connections: ConnectionManager; url: string }) {
  const { exit } = useApp()
  const [cfg, setCfg] = useState<StudioConfig>(config.get())
  const [count, setCount] = useState(connections.count)
  const [sel, setSel] = useState(0)

  useEffect(() => {
    const onChange = (c: StudioConfig) => setCfg(c)
    const onCount = (n: number) => setCount(n)
    config.on("change", onChange)
    connections.on("count", onCount)
    return () => { config.off("change", onChange); connections.off("count", onCount) }
  }, [config, connections])

  const rows = configRows(cfg)
  const models = availableModels()
  const plugins = discoverPlugins(cfg.projectDir)
  const skills = discoverSkills(cfg.projectDir)

  function change(dir: 1 | -1) {
    const row = rows[sel]
    if (row.key === "model") {
      const idx = models.findIndex((m) => m.id === cfg.model)
      const next = models[(idx + dir + models.length) % models.length]
      config.update({ model: next.id })
    } else if (row.key === "permissionMode") {
      const idx = PERMISSION_CYCLE.indexOf(cfg.permissionMode as any)
      config.update({ permissionMode: PERMISSION_CYCLE[(idx + dir + PERMISSION_CYCLE.length) % PERMISSION_CYCLE.length] })
    } else if (row.key === "maxTurns") {
      config.update({ maxTurns: cfg.maxTurns + dir })
    } else if (row.key === "maxBudgetUsd") {
      config.update({ maxBudgetUsd: Math.round((cfg.maxBudgetUsd + dir * 0.5) * 10) / 10 })
    } else if (row.key === "allowBash") {
      config.update({ allowBash: !cfg.allowBash })
    } else if (row.key === "routeHints") {
      config.update({ routeHints: !cfg.routeHints })
    }
  }

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) { exit(); return }
    if (key.upArrow) setSel((s) => (s - 1 + rows.length) % rows.length)
    else if (key.downArrow) setSel((s) => (s + 1) % rows.length)
    else if (key.leftArrow) change(-1)
    else if (key.rightArrow || input === " ") change(1)
  })

  return (
    <Box flexDirection="column">
      <StatusBar url={url} count={count} />
      <ConfigPanel config={cfg} selected={sel} />
      <TogglesPanel plugins={plugins} skills={skills} config={cfg} />
      <LogPanel />
    </Box>
  )
}
