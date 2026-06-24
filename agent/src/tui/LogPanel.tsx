import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import { logBuffer, type LogEntry } from "../logger.js"

const COLOR: Record<string, string> = { info: "cyan", event: "magenta", error: "red", success: "green", dim: "gray" }

export function LogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>(logBuffer.entries())
  useEffect(() => {
    const on = () => setEntries(logBuffer.entries().slice(-8))
    logBuffer.on("entry", on)
    return () => { logBuffer.off("entry", on) }
  }, [])
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="gray" bold>Log</Text>
      {entries.slice(-8).map((e, i) => (
        <Text key={i} color={COLOR[e.level] ?? "white"}>
          [{e.tag}] {e.msg}
        </Text>
      ))}
    </Box>
  )
}
