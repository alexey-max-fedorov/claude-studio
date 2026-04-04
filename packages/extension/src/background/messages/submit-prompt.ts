import type { PlasmoMessaging } from "@plasmohq/messaging"
import { wsClient } from ".."
import { debug } from "../../lib/debug"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { route, element, prompt } = req.body

  wsClient.send({
    type: "prompt",
    route,
    element,
    prompt,
  })

  debug(`[Claude Studio] Prompt sent: "${prompt}" for ${element.cssSelector}`)
  res.send({ ok: true })
}

export default handler
