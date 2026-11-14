# Claude Studio Privacy Policy

**Last updated:** November 11, 2026

This policy describes the protocol-v3 implementation in this repository. Earlier releases can have different browser-storage and chat-history behavior.

## How It Works

Claude Studio is a browser side panel connected to a Claude Code daemon. By default, the extension connects to `ws://127.0.0.1:7281` on your machine. You can change the server URL; data is sent to the server you configure. The daemon binds to loopback by default and requires an explicit unsafe-bind option for non-loopback access.

Running the daemon locally does not mean all data stays on your machine. Claude Code sends context to the model provider and may use other services through your configured tools and integrations.

## What Data Is Processed

- **Messages:** Text you send, attached browser context, and your responses to tool permission requests are sent to the configured daemon and processed by Claude Code.
- **Browser attachments:** Capture is user-triggered. Depending on what you attach, it can include page or link URLs and titles, selected text, page text, a screenshot of the visible tab, or an element's selector, text, HTML, attributes, styles, and structure. Captured attachments remain pending in the browser until you send a message with them.
- **Sensitive content:** URLs, page text, screenshots, and element captures can contain personal or confidential information. Element HTML and attributes can include hidden content or form data. Captures are not automatically redacted; check what you attach and avoid capturing sensitive pages or elements.
- **Project and tool data:** Claude Code can read and edit files and run tools under your configured permissions. Prompts, source code, file paths, tool inputs and results, errors, and model responses may contain sensitive information.

The picker content script is registered for `<all_urls>` and stays idle until activated. Its presence on a page is not an automatic page capture.

## Storage and Retention

- **Browser storage:** The extension uses `chrome.storage.local`, not sync storage, for the server URL, selected session identifiers, drafts, and sent-message recall. This recall is not the full conversation transcript. Attachments queued by the background can remain in `chrome.storage.session` until the panel retrieves them; the panel holds pending attachments in memory.
- **Conversation history:** Durable Claude Code transcripts are stored on the daemon machine through the Claude Agent SDK. They can contain sent text, browser context, images, model responses, and tool inputs and results. Claude Studio lists and resumes persisted sessions for the selected project, including sessions created in terminal clients. Other clients connected to the same daemon can access project sessions.
- **Agent settings:** Settings are stored by default in `~/.claude-studio/config.json`, outside the project. The project directory is selected when the daemon starts, using `--project` or the current directory. It is read-only in the panel and is not saved in that settings file.
- **Diagnostics:** Project paths appear in connection/configuration messages and the daemon's health response. Logs can contain paths, session identifiers, errors, and Claude Code diagnostic output. Logs are written to the terminal or captured by your service setup. Treat these and tool results as potentially sensitive when sharing them.

Pending-attachment queues, sent-message recall, and daemon history buffers have size or count limits. These limits are not a retention policy for persisted Claude Code transcripts. Closing the panel, starting a new chat, clearing a conversation, or stopping a live process does not erase saved transcripts. Disconnecting the panel does not stop a running session.

Use browser extension-data controls to remove browser-stored data. Manage or remove Claude Code transcripts, agent configuration, and logs on the daemon machine through Claude Code and normal filesystem controls. Provider-side retention and deletion depend on the services you use.

## Third-Party Services and Telemetry

Claude Studio loads your Claude Code user, project, and local settings. Your setup can include MCP servers, skills, plugins, hooks, and other tools or providers that process data locally or remotely under their own terms and privacy policies. Review that setup before sending confidential information. Anthropic's privacy policy is available at https://www.anthropic.com/privacy.

The extension and daemon do not add a separate analytics or telemetry reporting service for project maintainers. This does not disable or replace Claude Code or SDK telemetry settings; normal vendor settings and policies apply.

The Claude Studio website uses Vercel Analytics to measure website usage and loads fonts from Google Fonts. These third-party website services are separate from the extension and daemon.

If you configure a remote daemon or other service, that operator's practices also govern the data it receives. You are responsible for understanding where your configuration sends data.

## Extension Permissions

- **sidePanel:** Provides the chat interface.
- **storage:** Saves local panel state and queues pending attachments in session storage.
- **activeTab:** Supports user-triggered access to the active tab, including visible-tab screenshots.
- **tabs:** Finds the active tab, reads its URL and title for attachments, and communicates with the picker.
- **scripting:** Reads selected or page text and injects the picker when needed.
- **contextMenus:** Adds actions to attach a page, link, or selection.
- **`<all_urls>` host permissions:** Allow picker and capture features across supported sites, subject to browser restrictions and site-access settings.

## Disclaimer

CLAUDE STUDIO IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE PROJECT MAINTAINERS MAKE NO REPRESENTATIONS OR WARRANTIES REGARDING DATA PRIVACY, SECURITY, OR TRANSMISSION. YOU ARE SOLELY RESPONSIBLE FOR:

- Configuring the extension securely
- Understanding where your data is sent
- Complying with applicable privacy laws and regulations
- Protecting sensitive information in your usage of the tool

The maintainers are not liable for any data breaches, privacy violations, or other damages arising from your use of Claude Studio.

## Contact

For questions, open an issue at https://github.com/alexey-max-fedorov/claude-studio. Do not include private prompts, paths, logs, or transcripts in public issues.
