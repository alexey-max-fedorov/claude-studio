import { WsClient } from "./ws-client"

const DEFAULT_SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "ws://localhost:7281"
export const STORAGE_KEY = "serverUrl"

export const wsClient = new WsClient(DEFAULT_SERVER_URL)

export async function getServerUrl(): Promise<string> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as string) || DEFAULT_SERVER_URL
}

export async function reconnectWithUrl(url: string): Promise<void> {
  wsClient.disconnect()
  wsClient.setUrl(url)
  wsClient.connect()
}

// Track connected ports for broadcasting to side panel
const connectedPorts: chrome.runtime.Port[] = []

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "stream") {
    connectedPorts.push(port)
    port.postMessage({ type: "connection_state", state: wsClient.state })

    // Listen for prompts from side panel
    port.onMessage.addListener((msg) => {
      if (msg.type === "raw_prompt" && msg.prompt) {
        wsClient.send({ type: "raw_prompt", prompt: msg.prompt })
      }
    })

    port.onDisconnect.addListener(() => {
      const idx = connectedPorts.indexOf(port)
      if (idx >= 0) connectedPorts.splice(idx, 1)
    })
  }
})

wsClient.onState((state) => {
  console.log(`[Claude Studio] WebSocket: ${state}`)
  connectedPorts.forEach((port) => {
    try { port.postMessage({ type: "connection_state", state }) } catch {}
  })
})

wsClient.onMessage((msg: any) => {
  console.log("[Claude Studio] Server message:", msg.type)
  connectedPorts.forEach((port) => {
    try { port.postMessage(msg) } catch {}
  })
})

// Initialize with stored URL
getServerUrl().then((url) => {
  wsClient.setUrl(url)
  wsClient.connect()
})

// Reconnect when user changes the server URL
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    reconnectWithUrl(changes[STORAGE_KEY].newValue as string)
  }
})

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
