import { WsClient } from "./ws-client"
import { debug } from "../lib/debug"

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
      if (msg.type === "query_capabilities") {
        wsClient.send({ type: "query_capabilities" })
      }
      if (msg.type === "query_models") {
        wsClient.send({ type: "query_models" })
      }
    })

    port.onDisconnect.addListener(() => {
      const idx = connectedPorts.indexOf(port)
      if (idx >= 0) connectedPorts.splice(idx, 1)
    })
  }
})

wsClient.onState((state) => {
  debug(`[Claude Studio] WebSocket: ${state}`)
  connectedPorts.forEach((port) => {
    try { port.postMessage({ type: "connection_state", state }) } catch {}
  })
})

wsClient.onMessage((msg: any) => {
  debug("[Claude Studio] Server message:", msg.type)
  connectedPorts.forEach((port) => {
    try { port.postMessage(msg) } catch {}
  })

  // Clear element highlight when Claude finishes or errors
  if (msg.type === "ai_complete" || msg.type === "ai_error") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "highlight-clear" }, () => {
          void chrome.runtime.lastError
        })
      }
    })
  }
})

// Initialize with stored URL
getServerUrl().then((url) => {
  wsClient.setUrl(url)
  wsClient.connect()
})

// Reconnect when user changes the server URL; broadcast picker mode changes to all tabs
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    reconnectWithUrl(changes[STORAGE_KEY].newValue as string)
  }
  if (area === "sync" && changes["pickerMode"]) {
    const mode = changes["pickerMode"].newValue
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { action: "picker-mode-changed", mode }, () => {
            void chrome.runtime.lastError
          })
        }
      }
    })
  }
})

// Relay highlight messages from prompt widget content script to element picker content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "highlight-working" || message.action === "highlight-clear") {
    const tabId = sender.tab?.id
    if (tabId) {
      chrome.tabs.sendMessage(tabId, message, () => {
        void chrome.runtime.lastError
      })
    }
  }
})

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-picker") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggle-picker" }, () => {
          void chrome.runtime.lastError // suppress "no receiver" errors
        })
      }
    })
  }
})
