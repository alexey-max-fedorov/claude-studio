import type { PlasmoMessaging } from "@plasmohq/messaging"
import { debug } from "../../lib/debug"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { selection, position } = req.body

  // Send to active tab's content script to show prompt widget
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "show-prompt-widget",
      selection,
      position,
    })
  }

  debug("[Claude Studio] Element selected:", selection?.cssSelector)
  res.send({ ok: true })
}

export default handler
