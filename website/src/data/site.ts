export const siteConfig = {
  name: "Claude Studio",
  tagline: "Visual AI coding assistant for the web",
  description:
    "Select an element on your live page, describe the change in plain English, and Claude Code edits your source — in any framework. A browser extension and a local agent, talking over WebSocket.",
  github: "https://github.com/alexey-max-fedorov/claude-studio",
  chromeWebStore:
    "https://chromewebstore.google.com/detail/claude-studio/bpcmnngncojfbddicenjebaglkdplodk",
  nav: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    {
      label: "GitHub",
      href: "https://github.com/alexey-max-fedorov/claude-studio",
      external: true,
    },
    {
      label: "Add to Chrome",
      href: "https://chromewebstore.google.com/detail/claude-studio/bpcmnngncojfbddicenjebaglkdplodk",
      external: true,
    },
  ],
  footerLinks: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    {
      label: "Privacy Policy",
      href: "https://github.com/alexey-max-fedorov/claude-studio/blob/master/PRIVACY.md",
    },
    {
      label: "Terms of Service",
      href: "https://github.com/alexey-max-fedorov/claude-studio/blob/master/TERMS.md",
    },
  ],
  metrics: [
    { value: "Open Source", label: "Free Forever" },
    { value: "Privacy-First", label: "No Telemetry" },
    { value: "Any Framework", label: "React · Vue · Svelte · HTML" },
    { value: "Local", label: "Runs On Your Machine" },
  ],
  features: [
    {
      icon: "MousePointerClick" as const,
      title: "Smart Element Picker",
      description:
        "Select any element with a gold highlight overlay. Captures the selector, computed styles, and full HTML context for precise edits.",
    },
    {
      icon: "MessageSquareText" as const,
      title: "Natural Language Edits",
      description:
        'Describe what you want in plain English. "Make this button rounded with a subtle shadow" — done, in your source.',
    },
    {
      icon: "Layers" as const,
      title: "Reliable Model Switching",
      description:
        "Switch between Sonnet, Opus, Haiku, and Fable on the fly. The agent applies your choice on every turn — no flaky slash commands.",
    },
    {
      icon: "Puzzle" as const,
      title: "Plugin & Skill Control",
      description:
        "Toggle Claude Code plugins and skills straight from the extension's Agent tab. Shape how the agent works without touching config files.",
    },
    {
      icon: "RefreshCw" as const,
      title: "Realtime Config Sync",
      description:
        "Tune the model, permissions, turns, and budget from the extension or the server's TUI — changes broadcast to every connected client instantly over WebSocket.",
    },
    {
      icon: "Radio" as const,
      title: "Live Streaming",
      description:
        "Watch Claude work in the side panel — file reads, edits, and tool calls as they happen, with token and cost tracking.",
    },
  ],
  howItWorks: [
    {
      step: 1,
      title: "Run the agent",
      description:
        "In your project directory, run one command. An interactive terminal UI starts and shows your WebSocket URL.",
      code: "pnpx claude-studio",
    },
    {
      step: 2,
      title: "Connect the extension",
      description:
        "Install the browser extension, open the side panel, and point it at the ws:// URL from the terminal.",
      code: null,
    },
    {
      step: 3,
      title: "Pick & describe",
      description:
        "Toggle the element picker with Ctrl+Shift+E, select an element, and describe your change in the floating widget.",
      code: null,
    },
    {
      step: 4,
      title: "Watch it ship",
      description:
        "Claude Code edits your source files. Save and the change is live — in React, Vue, Svelte, plain HTML, whatever you use.",
      code: null,
    },
  ],
}
