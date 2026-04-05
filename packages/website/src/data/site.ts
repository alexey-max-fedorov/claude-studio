export const siteConfig = {
  name: "Claude Studio",
  tagline: "Visual AI coding assistant for Next.js",
  description:
    "Select elements on your page, describe changes in plain English, and Claude Code makes it happen in your source code.",
  github: "https://github.com/alexey-max-fedorov/claude-studio",
  nav: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    {
      label: "GitHub",
      href: "https://github.com/alexey-max-fedorov/claude-studio",
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
    { value: "Next.js", label: "Optimized" },
    { value: "Local", label: "Runs On Your Machine" },
  ],
  features: [
    {
      icon: "MousePointerClick" as const,
      title: "Smart Element Picker",
      description:
        "Select any element with a gold highlight overlay. Captures CSS selectors, computed styles, and full HTML context for precise edits.",
    },
    {
      icon: "MessageSquareText" as const,
      title: "Natural Language Edits",
      description:
        'Describe what you want to change in plain English. "Make this button rounded with a subtle shadow" \u2014 done.',
    },
    {
      icon: "Radio" as const,
      title: "Real-time Streaming",
      description:
        "Watch Claude work in the side panel. See file reads, edits, and tool calls as they happen.",
    },
    {
      icon: "History" as const,
      title: "Session Persistence",
      description:
        "Chat history and session state survive sidebar reloads. Pick up right where you left off.",
    },
    {
      icon: "DollarSign" as const,
      title: "Cost Tracking",
      description:
        "Monitor token usage, spend per turn, and cumulative cost. Full transparency, no surprises.",
    },
    {
      icon: "Layers" as const,
      title: "Model Flexibility",
      description:
        "Switch between Sonnet, Opus, and Haiku on the fly. Use the right model for the right task.",
    },
  ],
  howItWorks: [
    {
      step: 1,
      title: "Start the Server",
      description:
        "Run the bridge server with a single command. It connects your browser to Claude Code.",
      code: "pnpm dlx claude-studio serve",
    },
    {
      step: 2,
      title: "Pick an Element",
      description:
        "Toggle the element picker with Ctrl+Shift+E. Hover over any element to see the gold highlight.",
      code: null,
    },
    {
      step: 3,
      title: "Describe the Change",
      description:
        "Type what you want in the floating prompt widget. Press Ctrl+Enter to send.",
      code: null,
    },
    {
      step: 4,
      title: "Watch It Happen",
      description:
        "Claude edits your source files. Next.js HMR reloads the page instantly with your changes.",
      code: null,
    },
  ],
}
