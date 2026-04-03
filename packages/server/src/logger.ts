const RESET = "\x1b[0m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const GRAY = "\x1b[90m"
const BOLD = "\x1b[1m"

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false })
}

function format(color: string, prefix: string, message: string): string {
  return `${GRAY}${timestamp()}${RESET} ${color}${BOLD}[${prefix}]${RESET} ${message}`
}

export const log = {
  info: (prefix: string, message: string) => console.log(format(CYAN, prefix, message)),
  event: (prefix: string, message: string) => console.log(format(YELLOW, prefix, message)),
  error: (prefix: string, message: string) => console.log(format(RED, prefix, message)),
  success: (prefix: string, message: string) => console.log(format(GREEN, prefix, message)),
  dim: (prefix: string, message: string) => console.log(format(GRAY, prefix, message)),
}
