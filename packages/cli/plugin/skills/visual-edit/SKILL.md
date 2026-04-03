---
name: Visual Element Editing
description: Use when processing visual editing requests from the Canvas Code browser extension — prompts will include CSS selectors, HTML snippets, and computed styles from a live Next.js page
---

# Visual Element Editing

You are being used as the backend for a visual coding tool. Users select elements on a live Next.js page and describe changes in natural language.

## How to find the right source file

1. The prompt includes a CSS selector and the current route. Start by checking the route's page component:
   - App Router: `app/{route}/page.tsx` or `app/{route}/page.jsx`
   - Pages Router: `pages/{route}.tsx` or `pages/{route}.jsx`
   - Also check layout files: `app/{route}/layout.tsx`, `app/layout.tsx`

2. If the element isn't in the page file, search for it:
   - Use `Grep` to search for distinctive text content, class names, or IDs from the element
   - Use `Glob` to find component files: `src/components/**/*.tsx`, `components/**/*.tsx`
   - Check for imports in the page file to trace component tree

3. For styled elements, check:
   - Tailwind classes (most common in Next.js): edit className props
   - CSS Modules: look for `*.module.css` files imported in the component
   - Global CSS: check `app/globals.css` or `styles/globals.css`

## Editing guidelines

- Be surgical. Only change the specific element or property the user asked about.
- Prefer editing existing Tailwind classes over adding inline styles.
- When changing colors, use the project's existing color palette if one exists (check tailwind.config).
- When changing text, only change the exact text — don't restructure the component.
- When adding/removing elements, maintain the existing code style and indentation.
- NEVER refactor, rename, or reorganize code the user didn't ask about.
- NEVER delete or modify imports unless directly required by the change.
- After making an edit, briefly state what you changed and in which file.
