import React from "react"
import { Box, Text } from "ink"
import { KNOWN_MODELS, type StudioConfig } from "@claude-studio/protocol"

export interface Row {
  key: string
  label: string
  value: string
}

export function configRows(c: StudioConfig): Row[] {
  return [
    { key: "model", label: "Model", value: c.model },
    { key: "permissionMode", label: "Permission", value: c.permissionMode },
    { key: "maxTurns", label: "Max turns", value: String(c.maxTurns) },
    { key: "maxBudgetUsd", label: "Budget (USD)", value: String(c.maxBudgetUsd) },
    { key: "allowBash", label: "Allow Bash", value: c.allowBash ? "on" : "off" },
    { key: "routeHints", label: "Route hints", value: c.routeHints ? "on" : "off" },
  ]
}

export function ConfigPanel({ config, selected }: { config: StudioConfig; selected: number }) {
  const rows = configRows(config)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="gray" bold>Agent config <Text color="gray">(↑↓ select · ←→/space change)</Text></Text>
      {rows.map((r, i) => (
        <Text key={r.key} color={i === selected ? "#c9a84c" : "white"}>
          {i === selected ? "› " : "  "}{r.label.padEnd(14)} <Text color="gray">{r.value}</Text>
        </Text>
      ))}
    </Box>
  )
}

export { KNOWN_MODELS }
