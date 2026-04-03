import { cpSync, existsSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { checkPrerequisites, isNextJsProject, hasClaudeCode } from "./utils.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_SOURCE = path.join(__dirname, "..", "plugin")

const GITHUB_REPO = "alexey-max-fedorov/claude-studio"
const EXTENSION_ZIP_URL = `https://github.com/${GITHUB_REPO}/raw/master/dist/claude-studio-extension.zip`

export function runSetup() {
  console.log("\nClaude Studio Setup\n")
  console.log("Visual AI coding assistant for Next.js\n")
  console.log("-".repeat(50))

  // 1. Check prerequisites
  const { ok, missing } = checkPrerequisites()
  if (!ok) {
    console.log("\nMissing prerequisites:")
    missing.forEach((m) => console.log(`   - ${m}`))
    process.exit(1)
  }
  console.log("\n[ok] Prerequisites check passed")

  if (!isNextJsProject()) {
    console.log("\n[warn] This doesn't look like a Next.js project (no 'next' in dependencies)")
    console.log("   Claude Studio is designed for Next.js but may work with other React frameworks.\n")
  }

  // 2. Install Claude Code plugin
  console.log("\nStep 1: Claude Code Plugin\n")

  const pluginDest = path.join(process.cwd(), ".claude-studio-plugin")
  if (existsSync(pluginDest)) {
    console.log(`   Plugin already exists at ${pluginDest}`)
  } else {
    cpSync(PLUGIN_SOURCE, pluginDest, { recursive: true })
    console.log(`   Plugin files copied to ${pluginDest}`)
  }

  if (hasClaudeCode()) {
    console.log("\n   To install the plugin in Claude Code, run:")
    console.log(`   claude plugin install --source ${pluginDest}`)
    console.log("\n   Or add this repo as a marketplace:")
    console.log(`   claude plugin install claude-studio@claude-studio`)
    console.log(`   (requires adding the marketplace: github.com/${GITHUB_REPO})`)
  } else {
    console.log("\n   [warn] Claude Code CLI not found.")
    console.log("   Install it first: npm install -g @anthropic-ai/claude-code")
    console.log(`   Then install the plugin from: ${pluginDest}`)
  }

  // 3. Create .env template for bridge server
  console.log("\nStep 2: Bridge Server Configuration\n")

  const envPath = path.join(process.cwd(), ".env.claude-studio")
  if (!existsSync(envPath)) {
    const envContent = [
      "# Claude Studio Bridge Server Configuration",
      `PROJECT_DIR=${process.cwd()}`,
      "PORT=7281",
      "MODEL=sonnet",
      "MAX_BUDGET_USD=2.0",
      "MAX_TURNS=15",
      "",
    ].join("\n")
    writeFileSync(envPath, envContent)
    console.log(`   Created ${envPath}`)
  } else {
    console.log(`   Config already exists at ${envPath}`)
  }

  // 4. Browser extension
  console.log("\nStep 3: Browser Extension\n")
  console.log("   Download the Chrome extension:")
  console.log(`   ${EXTENSION_ZIP_URL}`)
  console.log("")
  console.log("   Install it:")
  console.log("   1. Unzip the downloaded file")
  console.log("   2. Open chrome://extensions")
  console.log("   3. Enable 'Developer mode' (top right)")
  console.log("   4. Click 'Load unpacked' and select the unzipped folder")

  // 5. Usage instructions
  console.log("\n" + "-".repeat(50))
  console.log("\nGetting Started\n")
  console.log("   1. Start your Next.js dev server:")
  console.log("      pnpm dev  (or npm run dev)")
  console.log("")
  console.log("   2. Start the Claude Studio bridge server:")
  console.log("      npx claude-studio serve")
  console.log("")
  console.log("   3. Open your app in Chrome, click the Claude Studio extension icon")
  console.log("   4. Select an element, describe what you want to change")
  console.log("   5. Claude Code makes the edit in your source code!\n")
}
