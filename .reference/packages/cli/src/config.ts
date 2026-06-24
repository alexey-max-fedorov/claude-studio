import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"

const ENV_FILE = ".env.claude-studio"

interface Setting {
  key: string
  label: string
  description: string
  default: string
  parse?: (value: string) => string
  format?: (value: string) => string
}

function parseDuration(input: string): string {
  const match = input.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/i)
  if (!match) {
    const num = parseInt(input, 10)
    if (!isNaN(num) && num > 0) return String(num)
    throw new Error(`Invalid duration: "${input}". Use e.g. 30s, 5m, 1h, or raw milliseconds.`)
  }
  const value = parseFloat(match[1])
  const unit = match[2].toLowerCase()
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }
  return String(Math.round(value * multipliers[unit]))
}

function formatDuration(ms: string): string {
  const n = parseInt(ms, 10)
  if (isNaN(n)) return ms
  if (n >= 3_600_000 && n % 3_600_000 === 0) return `${n / 3_600_000}h`
  if (n >= 60_000 && n % 60_000 === 0) return `${n / 60_000}m`
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}s`
  return `${n}ms`
}

const SETTINGS: Setting[] = [
  { key: "PROJECT_DIR", label: "Project directory", description: "Working directory for Claude Code", default: process.cwd() },
  { key: "PORT", label: "Server port", description: "WebSocket bridge server port", default: "7281" },
  { key: "MODEL", label: "Model", description: "Claude model to use (sonnet, opus, haiku)", default: "sonnet" },
  { key: "MAX_BUDGET_USD", label: "Max budget (USD)", description: "Maximum spend per session in USD", default: "2.0" },
  { key: "MAX_TURNS", label: "Max turns", description: "Maximum agentic turns per query", default: "15" },
  {
    key: "TIMEOUT_MS",
    label: "Timeout",
    description: "Max time per query (e.g. 5m, 15m, 1h)",
    default: "600000",
    parse: parseDuration,
    format: formatDuration,
  },
]

function getEnvPath(): string {
  return path.join(process.cwd(), ENV_FILE)
}

function loadEnv(): Record<string, string> {
  const envPath = getEnvPath()
  const env: Record<string, string> = {}
  if (!existsSync(envPath)) return env
  const lines = readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex > 0) {
      env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
    }
  }
  return env
}

function saveEnv(env: Record<string, string>): void {
  const lines = ["# Claude Studio Bridge Server Configuration"]
  for (const setting of SETTINGS) {
    if (env[setting.key] !== undefined) {
      lines.push(`${setting.key}=${env[setting.key]}`)
    }
  }
  lines.push("")
  writeFileSync(getEnvPath(), lines.join("\n"))
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

async function runInteractive(env: Record<string, string>): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  console.log("\nClaude Studio Configuration")
  console.log(`Editing: ${getEnvPath()}\n`)
  console.log("Press Enter to keep current value, or type a new value.\n")

  for (const setting of SETTINGS) {
    const current = env[setting.key] ?? setting.default
    const display = setting.format ? setting.format(current) : current
    const answer = await prompt(rl, `  ${setting.label} (${setting.description}) [${display}]: `)
    const trimmed = answer.trim()
    if (trimmed) {
      try {
        env[setting.key] = setting.parse ? setting.parse(trimmed) : trimmed
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : String(err)}`)
        console.log(`    Keeping current value: ${display}`)
      }
    } else {
      env[setting.key] = current
    }
  }

  rl.close()
  saveEnv(env)
  console.log(`\nSaved to ${getEnvPath()}`)
  printCurrentConfig(env)
}

function printCurrentConfig(env: Record<string, string>): void {
  console.log("\nCurrent configuration:\n")
  for (const setting of SETTINGS) {
    const value = env[setting.key] ?? setting.default
    const display = setting.format ? `${setting.format(value)} (${value})` : value
    console.log(`  ${setting.key}=${display}`)
  }
  console.log()
}

function runKeyValue(args: string[], env: Record<string, string>): void {
  // claude-studio config <key> <value>  — set a value
  // claude-studio config <key>          — show a value
  // claude-studio config --list         — show all
  if (args.length === 0 || args[0] === "--list" || args[0] === "-l") {
    printCurrentConfig(env)
    return
  }

  const key = args[0].toUpperCase().replace(/-/g, "_")
  const setting = SETTINGS.find((s) => s.key === key)

  if (!setting) {
    console.error(`Unknown setting: ${args[0]}`)
    console.error(`Available settings: ${SETTINGS.map((s) => s.key).join(", ")}`)
    process.exit(1)
  }

  if (args.length === 1) {
    const value = env[setting.key] ?? setting.default
    const display = setting.format ? `${setting.format(value)} (${value})` : value
    console.log(`${setting.key}=${display}`)
    return
  }

  const rawValue = args.slice(1).join(" ")
  try {
    env[setting.key] = setting.parse ? setting.parse(rawValue) : rawValue
    // Fill in defaults for any missing keys so we don't lose them
    for (const s of SETTINGS) {
      if (env[s.key] === undefined) env[s.key] = s.default
    }
    saveEnv(env)
    const display = setting.format ? setting.format(env[setting.key]) : env[setting.key]
    console.log(`Set ${setting.key}=${display}`)
    console.log(`Saved to ${getEnvPath()}`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

export async function runConfig(args: string[]): Promise<void> {
  const env = loadEnv()

  if (args.length === 0 && process.stdin.isTTY) {
    await runInteractive(env)
  } else {
    runKeyValue(args, env)
  }
}
