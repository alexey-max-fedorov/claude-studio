import type { PlasmoMessaging } from "@plasmohq/messaging"
import { wsClient } from ".."

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  res.send({ connected: wsClient.state === "connected", state: wsClient.state })
}

export default handler
