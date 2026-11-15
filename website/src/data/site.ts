import brand from "../../../brand.json"
import packageInfo from "../../package.json"

const { version } = packageInfo
const GITHUB_URL = "https://github.com/alexey-max-fedorov/claude-studio"
const RELEASE_URL = `${GITHUB_URL}/releases/tag/v${version}`

export const siteConfig = {
  name: brand.name,
  tagline: brand.headline,
  description: brand.headline,
  github: GITHUB_URL,
  release: RELEASE_URL,
  releaseLabel: `Release v${version}`,
  extensionZip: `${GITHUB_URL}/releases/download/v${version}/claude-studio-extension-${version}.zip`,
  docs: `${GITHUB_URL}/blob/master/agent/README.md`,
  nav: [
    { label: "Features", href: "#features" },
    { label: "Installation", href: "#how-it-works" },
    { label: "Preview", href: "#demo" },
    { label: "GitHub", href: GITHUB_URL, external: true },
  ],
  footerLinks: [
    { label: "Features", href: "#features" },
    { label: "Installation", href: "#how-it-works" },
    { label: `Release v${version}`, href: RELEASE_URL },
    {
      label: "Privacy policy",
      href: `${GITHUB_URL}/blob/master/PRIVACY.md`,
    },
    {
      label: "Terms of service",
      href: `${GITHUB_URL}/blob/master/TERMS.md`,
    },
  ],
  metrics: [
    { value: "Local daemon", label: "One project directory" },
    { value: "Browser panel", label: "Chrome & Brave" },
    { value: "Claude Code", label: "Your existing configuration" },
    { value: "Context attachments", label: "Captured when you choose" },
  ],
  features: [
    {
      icon: "MessageSquareText" as const,
      title: "Project conversations",
      description:
        "Chat with Claude Code from the browser side panel. The local daemon runs in the project directory you choose, with access to its files and tools.",
    },
    {
      icon: "MousePointerClick" as const,
      title: "Browser context",
      description:
        "Attach a picked element, selected text, page information, page text, or a screenshot to your message. You decide what browser context to share.",
    },
    {
      icon: "Radio" as const,
      title: "Streaming & approvals",
      description:
        "Follow replies and tool calls as they arrive. Review tool permission requests in the panel according to your selected permission mode.",
    },
    {
      icon: "History" as const,
      title: "Saved sessions",
      description:
        "Resume real Claude Code conversations, including sessions saved from the terminal. Closing the panel does not stop a running session.",
    },
    {
      icon: "SlidersHorizontal" as const,
      title: "Session settings",
      description:
        "Choose the model and permission mode in the panel. Model availability follows your Claude Code setup and provider access.",
    },
    {
      icon: "FolderOpen" as const,
      title: "Your Claude Code setup",
      description:
        "Use the selected project's instructions, memory, MCP servers, skills, plugins, and hooks. Configure them through your normal Claude Code setup.",
    },
  ],
  howItWorks: [
    {
      step: 1,
      title: "Prepare your machine",
      description:
        "Use Node.js 20 or newer and pnpm. Authenticate Claude Code on this machine with your existing installation, or configure a supported API provider. Claude usage requires your own account or API access.",
      code: null,
    },
    {
      step: 2,
      title: "Start the local daemon",
      description:
        "Run the v3 agent for your project. Keep this process running while using the panel. The npm package and CLI are still named claude-studio.",
      code: "pnpm dlx claude-studio@3 --project /path/to/your/project",
    },
    {
      step: 3,
      title: "Load the browser extension",
      description:
        `Download and extract the v${version} extension ZIP. Open chrome://extensions or brave://extensions, enable Developer mode, choose Load unpacked, and select the extracted folder containing manifest.json.`,
      code: null,
    },
    {
      step: 4,
      title: "Open the side panel",
      description:
        "Open the extension's side panel in Chrome or Brave. It connects to ws://127.0.0.1:7281 by default. Start a conversation and attach browser context when it is useful. Use the v3 extension and agent together.",
      code: null,
    },
  ],
}
