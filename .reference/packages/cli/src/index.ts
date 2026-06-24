#!/usr/bin/env node

import { runSetup } from "./setup.js"
import { runConfig } from "./config.js"

const command = process.argv[2]

function printHelp() {
  console.log(`
claude-studio — Visual AI coding assistant for Next.js

Usage:
  claude-studio setup                Set up Claude Studio in your Next.js project
  claude-studio serve                Start the bridge server
  claude-studio config               Configure settings interactively
  claude-studio config <key> <value> Set a specific setting (e.g. config timeout_ms 15m)
  claude-studio config --list        Show current configuration
  claude-studio help                 Show this help message
`)
}

async function main() {
  switch (command) {
    case "setup":
      runSetup()
      break

    case "serve": {
      const { existsSync, readFileSync } = await import("node:fs")
      const envPath = process.cwd() + "/.env.claude-studio"
      if (existsSync(envPath)) {
        const lines = readFileSync(envPath, "utf-8").split("\n")
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith("#")) {
            const eqIndex = trimmed.indexOf("=")
            if (eqIndex > 0) {
              const key = trimmed.slice(0, eqIndex)
              const value = trimmed.slice(eqIndex + 1)
              process.env[key] = value
            }
          }
        }
      }
      await import("@claude-studio/server")
      break
    }

    case "config":
      await runConfig(process.argv.slice(3))
      break

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp()
      break

    default:
      console.log(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

main()
