import React from "react"
import { Box, Text } from "ink"

export function StatusBar({ url, count, version }: { url: string; count: number; version: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#c9a84c" paddingX={1}>
      <Text>
        <Text color="#c9a84c" bold>Claude Studio</Text>
        <Text color="gray"> v{version}</Text>
      </Text>
      <Text>
        <Text color="gray">WebSocket  </Text>
        <Text color="#c9a84c" bold>{url}</Text>
      </Text>
      <Text>
        <Text color="gray">Connected  </Text>
        <Text color={count > 0 ? "green" : "gray"}>{count} client{count === 1 ? "" : "s"}</Text>
      </Text>
    </Box>
  )
}
