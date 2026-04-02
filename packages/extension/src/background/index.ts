import { WsClient } from "./ws-client"

const serverUrl = process.env.PLASMO_PUBLIC_SERVER_URL || "ws://localhost:7281"
export const wsClient = new WsClient(serverUrl)

// Track connected ports for broadcasting to side panel
const connectedPorts: chrome.runtime.Port[] = []

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "stream") {
    connectedPorts.push(port)
    // Send current state immediately
    port.postMessage({ type: "connection_state", state: wsClient.state })
    port.onDisconnect.addListener(() => {
      const idx = connectedPorts.indexOf(port)
      if (idx >= 0) connectedPorts.splice(idx, 1)
    })
  }
})

wsClient.onState((state) => {
  console.log(`[Canvas Code] WebSocket: ${state}`)
  connectedPorts.forEach((port) => {
    try { port.postMessage({ type: "connection_state", state }) } catch {}
  })
})

wsClient.onMessage((msg: any) => {
  console.log("[Canvas Code] Server message:", msg.type)
  connectedPorts.forEach((port) => {
    try { port.postMessage(msg) } catch {}
  })
})

wsClient.connect()

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-picker") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggle-picker" })
      }
    })
  }
})
