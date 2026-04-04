# Claude Studio Privacy Policy

**Last updated:** April 4, 2026

## Data Collection

Claude Studio does **not** collect, transmit, or store any personal data on external servers.

## How It Works

Claude Studio is a local development tool. It connects exclusively to a bridge server running on your own machine (localhost). No data leaves your local network.

## What Data Is Processed Locally

- **Element selections:** When you pick an element on a webpage, its CSS selector, tag name, class names, and computed styles are captured and sent to your local bridge server.
- **Prompts:** Text you type in the prompt widget or sidebar is sent to your local bridge server, which forwards it to Claude Code running on your machine.
- **Preferences:** Your server URL and picker mode preference are stored in Chrome's sync storage.
- **Chat history:** Sidebar messages are stored in Chrome's local storage for session persistence.

## Third-Party Services

Claude Studio does not communicate with any third-party services. The bridge server on your machine communicates with Claude Code (Anthropic's CLI), which has its own privacy policy at https://www.anthropic.com/privacy.

## Permissions

- **activeTab:** Required to inject the element picker into the current page.
- **storage:** Required to persist your server URL and preferences.
- **sidePanel:** Required for the sidebar chat interface.
- **tabs:** Required to communicate between the sidebar and content scripts.

## Contact

For questions, open an issue at https://github.com/alexey-max-fedorov/claude-studio
