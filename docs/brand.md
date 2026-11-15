# Metatron brand guidelines

## Name and message

- The official product name is **Metatron**, with this capitalization and no company designation or suffix. Use it for visible UI, documentation, help, logs, and store copy.
- [`brand.json`](../brand.json) is the application and website source of truth for the name and approved headline. Manifest, package, and store descriptions mirror it and are checked by `scripts/brand.test.mjs`.
- The exact tagline, headline, and short product description is **Local Claude Code CLI in your browser.** Keep the wording, capitalization, and final period unchanged.
- Position Metatron as Claude Code running locally in a chosen project, with a browser side panel. Browser capture is user-triggered context, not a separate hosted AI service.
- Local execution is not a promise that all data stays local. Claude Code uses the configured model provider and integrations. Do not imply an official Anthropic affiliation.
- Use concise, factual copy. Do not use em or en dashes in UI text. Use generic project paths such as `/path/to/your/project`, never private project paths.

## Palette

Use the supplied palette, not the former black-and-gold identity:

| Color | Hex | Role |
|---|---|---|
| Midnight | `#19354B` | Primary ink and dark backgrounds |
| Slate | `#536A82` | Secondary ink and controls |
| Atmosphere | `#91A8BD` | Supporting accents and dark-mode emphasis |
| Ivory | `#F5F0E8` | Light backgrounds and reversed text |
| Stone | `#D9D2C9` | Dividers and neutral surfaces |
| Champagne | `#E7D2B8` | Restrained warm accents |

Keep text and interactive states readable in both themes. Pale supporting colors are not substitutes for high-contrast body text.

## Typography and mark

- **Cormorant Garamond Regular (400):** wordmark and display headings.
- **Montserrat Regular (400) and Medium (500):** supporting text, body copy, labels, and controls.
- Use monospace for commands and source code. Keep code identifiers unchanged.
- Use the supplied Metatron mark for icons. Keep its proportions and clear space; do not distort it or substitute a different symbol.
- The extension bundles its font files locally. Website font delivery and analytics are disclosed in [PRIVACY.md](../PRIVACY.md).

## Compatibility boundaries

This is a visible rebrand, not a technical migration. Preserve:

- The npm package and CLI **`claude-studio`**, its executable, existing install commands, versions, and release artifact names.
- Technical namespaces such as `@claude-studio/*`, protocol types and wire identifiers (including `StudioConfig`), storage keys, session IDs, and transcript formats.
- `~/.claude-studio/`, existing config and log paths, and `CLAUDE_STUDIO_*` environment variables, including `CLAUDE_STUDIO_CONFIG`.
- The extension's pinned manifest key, ID, and allowed origin `chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol`, plus loopback Host and Origin security checks.
- Existing repository URLs and LaunchAgent technical identifiers. Link to the existing repository, not an invented replacement.

Historical plans under `docs/superpowers/` retain their original names and wording. Renaming these compatibility identifiers requires a separate, explicit migration; a branding change alone does not authorize publishing or store submission.
