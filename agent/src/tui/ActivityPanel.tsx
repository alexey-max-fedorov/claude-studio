import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import { activityBuffer, type ActivityEntry } from "../activity.js"

const COLOR: Record<ActivityEntry["kind"], string> = { thinking: "gray", text: "white", tool: "magenta" }
const LABEL: Record<ActivityEntry["kind"], string> = { thinking: "think", text: "text", tool: "tool" }

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(-180)
}

export function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>(activityBuffer.entries())
  useEffect(() => {
    const on = () => setEntries(activityBuffer.entries().slice(-6))
    activityBuffer.on("update", on)
    return () => { activityBuffer.off("update", on) }
  }, [])
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow" bold>Agent activity (live)</Text>
      {entries.length === 0 && <Text color="gray">waiting for agent…</Text>}
      {entries.slice(-6).map((e, i) => (
        <Text key={i} color={COLOR[e.kind]}>
          <Text color="gray">[{LABEL[e.kind]}] </Text>{oneLine(e.text)}
        </Text>
      ))}
    </Box>
  )
}
