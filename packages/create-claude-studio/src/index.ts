#!/usr/bin/env node

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const EXTENSION_URL =
  "https://chromewebstore.google.com/detail/claude-studio/YOUR_EXTENSION_ID"

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

async function main() {
  const projectName = process.argv[2]

  if (!projectName) {
    console.error("Usage: create-claude-studio <project-name>")
    process.exit(1)
  }

  const targetDir = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory "${projectName}" already exists.`)
    process.exit(1)
  }

  console.log(`\nCreating Claude Studio project: ${projectName}`)
  console.log(`  at ${targetDir}\n`)

  // Copy template files
  const templateDir = path.join(__dirname, "..", "template")
  copyDir(templateDir, targetDir)

  // Rename package.json.tpl -> package.json, substituting {{PROJECT_NAME}}
  const tplPath = path.join(targetDir, "package.json.tpl")
  const pkgPath = path.join(targetDir, "package.json")

  if (fs.existsSync(tplPath)) {
    let content = fs.readFileSync(tplPath, "utf-8")
    content = content.replaceAll("{{PROJECT_NAME}}", projectName)
    fs.writeFileSync(pkgPath, content)
    fs.rmSync(tplPath)
  }

  // Run pnpm install
  console.log("Installing dependencies with pnpm...")
  try {
    execSync("pnpm install", { cwd: targetDir, stdio: "inherit" })
  } catch {
    console.warn(
      "\nWarning: pnpm install failed. Run it manually inside the project directory."
    )
  }

  // Try to install Claude plugin
  console.log("\nInstalling Claude Studio plugin...")
  try {
    execSync("npx claude-studio setup", { cwd: targetDir, stdio: "inherit" })
  } catch {
    console.warn(
      "\nWarning: Could not install Claude Studio plugin automatically."
    )
    console.warn(
      "Run `npx claude-studio setup` inside your project directory to complete setup."
    )
  }

  // Print next steps
  console.log(`
Done! Your Claude Studio project is ready.

Next steps:
  1. Install the browser extension:
     ${EXTENSION_URL}

  2. Start your project:
     cd ${projectName}
     pnpm dev

  3. In a separate terminal, start the Claude Studio bridge server:
     pnpm dlx claude-studio serve   # or: npx claude-studio serve

  4. Open http://localhost:3000 in your browser and click the extension icon.

Happy building!
`)
}

main()
