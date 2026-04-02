import type { PlasmoMessaging } from "@plasmohq/messaging"
import { wsClient } from ".."

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { route, element, prompt } = req.body

  wsClient.send({
    type: "prompt",
    route,
    element,
    prompt,
  })

  console.log(`[Canvas Code] Prompt sent: "${prompt}" for ${element.cssSelector}`)
  res.send({ ok: true })
}

export default handler
