import React from "react"
import { Box, Text } from "ink"
import type { PluginInfo, SkillInfo, StudioConfig } from "@claude-studio/protocol"

export function TogglesPanel({
  plugins, skills, config,
}: { plugins: PluginInfo[]; skills: SkillInfo[]; config: StudioConfig }) {
  if (plugins.length === 0 && skills.length === 0) return null
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="gray" bold>Plugins & skills</Text>
      {plugins.map((p) => (
        <Text key={`p-${p.name}`}>
          <Text color={config.enabledPlugins.includes(p.name) ? "green" : "gray"}>
            {config.enabledPlugins.includes(p.name) ? "[x]" : "[ ]"}
          </Text> plugin: {p.name}
        </Text>
      ))}
      {skills.map((s) => (
        <Text key={`s-${s.name}`}>
          <Text color={config.enabledSkills.includes(s.name) ? "green" : "gray"}>
            {config.enabledSkills.includes(s.name) ? "[x]" : "[ ]"}
          </Text> skill: {s.name}
        </Text>
      ))}
      <Text color="gray">(toggle plugins/skills from the browser extension's Agent tab)</Text>
    </Box>
  )
}
