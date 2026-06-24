// Manually maintained until `plasmo dev` runs and generates this file.
// Augments the module-scoped MessagesMetadata so sendToBackground is typed.

import "@plasmohq/messaging"

declare module "@plasmohq/messaging" {
  interface MessagesMetadata {
    "element-selected": unknown
    "get-status": unknown
    "ping": unknown
    "reset-session": unknown
    "submit-prompt": unknown
    "toggle-picker": unknown
  }
}
