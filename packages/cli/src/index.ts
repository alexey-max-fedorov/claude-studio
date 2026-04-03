#!/usr/bin/env node

import { runSetup } from "./setup.js"

const command = process.argv[2]

function printHelp() {
  console.log(`
canvas-code — Visual AI coding assistant for Next.js

Usage:
  canvas-code setup     Set up Canvas Code in your Next.js project
  canvas-code serve     Start the bridge server
  canvas-code help      Show this help message
`)
}

async function main() {
  switch (command) {
    case "setup":
      runSetup()
      break

    case "serve": {
      const { existsSync, readFileSync } = await import("node:fs")
      const envPath = process.cwd() + "/.env.canvas-code"
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
      await import("@canvas-code/server")
      break
    }

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
