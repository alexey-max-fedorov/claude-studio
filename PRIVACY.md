# Claude Studio Privacy Policy

**Last updated:** April 4, 2026

## Data Collection

By default, Claude Studio is designed to work with a bridge server running on your local machine. However, you are responsible for configuring where data is sent. Claude Studio may transmit data to the server URL you configure, but the project maintainers do not collect or store personal data on servers they control.

## How It Works

Claude Studio is a browser extension and local development tool. By default, it is configured to connect to a bridge server on localhost. **However, you can configure the server URL to point to any network location.** Where your data goes depends entirely on how you configure the extension.

## What Data Is Processed

- **Element selections:** When you pick an element on a webpage, its CSS selector, tag name, class names, and computed styles are captured and sent to the server URL you have configured.
- **Prompts:** Text you type in the prompt widget or sidebar is sent to the server you have configured, which may forward it to Claude Code or other services.
- **Preferences:** Your server URL and picker mode preference are stored in your browser's sync storage.
- **Chat history:** Sidebar messages are stored in your browser's local storage.
- **Webpage content:** Depending on your usage, page content and DOM elements may be transmitted to the configured server.

## Third-Party Services

The default configuration connects to Claude Code (Anthropic's CLI) via a local bridge server. Claude Code communicates with Anthropic's services under their privacy policy at https://www.anthropic.com/privacy.

**Important:** If you configure Claude Studio to connect to a remote server or third-party service, that service's privacy policy will govern how your data is handled. You are responsible for understanding the privacy implications of your configuration choices.

## Permissions

- **activeTab:** Required to inject the element picker into the current page.
- **storage:** Required to persist your server URL and preferences.
- **sidePanel:** Required for the sidebar chat interface.
- **tabs:** Required to communicate between the sidebar and content scripts.

## Disclaimer

CLAUDE STUDIO IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE PROJECT MAINTAINERS MAKE NO REPRESENTATIONS OR WARRANTIES REGARDING DATA PRIVACY, SECURITY, OR TRANSMISSION. YOU ARE SOLELY RESPONSIBLE FOR:

- Configuring the extension securely
- Understanding where your data is sent
- Complying with applicable privacy laws and regulations
- Protecting sensitive information in your usage of the tool

The maintainers are not liable for any data breaches, privacy violations, or other damages arising from your use of Claude Studio.

## Contact

For questions, open an issue at https://github.com/alexey-max-fedorov/claude-studio
