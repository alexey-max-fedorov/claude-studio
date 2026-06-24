import type { PlasmoMessaging } from "@plasmohq/messaging"
import { wsClient } from ".."

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  wsClient.send({ type: "reset_session" })
  res.send({ ok: true })
}

export default handler
