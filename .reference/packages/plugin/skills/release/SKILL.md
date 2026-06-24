---
name: Release
description: This skill should be used when the user asks to "release", "bump the version", "publish to npm", "cut a release", "ship a new version", "rebuild the extension zip", "publish packages", "bump and publish", or wants to version-bump and release Claude Studio packages to npmjs.
---

# Claude Studio Release Workflow

Handles the full release cycle: version bumps across all packages, extension ZIP rebuild, git commit/push to master, and npm publishing via pnpm.

## Package Dependency Order

Packages must be published in dependency order — a downstream package must reference the already-published version of its upstream:

```
@claude-studio/shared (1.x.x)   ← no internal deps
       ↓
@claude-studio/server (1.x.x)   ← depends on shared
       ↓
claude-studio (CLI) (1.x.x)     ← depends on server + shared
```

The extension (`@claude-studio/extension`) is NOT published to npm — it ships as a ZIP for the Chrome Web Store.

## Step 1: Determine What to Bump

Ask the user which packages changed since the last release, or inspect git log:

```bash
git log --oneline $(git describe --tags --abbrev=0 HEAD)..HEAD 2>/dev/null || git log --oneline -20
```

Typical rules:
- **shared changed** → bump shared; bump server (dep ref); bump cli (dep ref)
- **server changed** → bump server; bump cli (dep ref)
- **cli/plugin changed** → bump cli only
- **Breaking changes** → bump minor (0.X.0); **Fixes** → bump patch (0.x.X)

Current publishable packages and their package.json paths:
- `packages/shared/package.json` → `@claude-studio/shared`
- `packages/server/package.json` → `@claude-studio/server`
- `packages/cli/package.json` → `claude-studio`

## Step 2: Bump Versions in package.json Files

Edit each affected `package.json` directly. **Critical:** when bumping upstream packages, also update the dependency version reference in all downstream package.json files. Never use `workspace:*` — always use explicit semver like `"^0.1.2"`.

### Example: bumping all three packages

`packages/shared/package.json`: bump `"version"` field  
`packages/server/package.json`: bump `"version"` field + update `"@claude-studio/shared"` dep  
`packages/cli/package.json`: bump `"version"` field + update `"@claude-studio/server"` and `"@claude-studio/shared"` deps

## Step 3: Build All Packages

```bash
pnpm build
```

This runs `tsc` on shared, server, and cli (TypeScript → `dist/`), and `plasmo build` on the extension.

## Step 4: Rebuild the Extension ZIP

```bash
pnpm build:extension-zip
```

This runs `scripts/build-extension-zip.sh`, which builds the Plasmo extension and zips `packages/extension/build/chrome-mv3-prod/` into `dist/claude-studio-extension.zip`.

## Step 5: Commit and Push to Master

Stage all changes (package.json version bumps + dist/ + extension zip):

```bash
git add packages/shared/package.json packages/server/package.json packages/cli/package.json dist/claude-studio-extension.zip
git commit -m "chore: release vX.Y.Z"
git push origin master
```

Adjust the file list to match which packages were actually bumped.

## Step 6: Publish to npm via pnpm

Publish in dependency order. Use `--no-git-checks` to avoid pnpm requiring a clean git state after the commit.

```bash
# 1. Shared (if changed)
pnpm --filter @claude-studio/shared publish --access public --no-git-checks

# 2. Server (if changed)
pnpm --filter @claude-studio/server publish --access public --no-git-checks

# 3. CLI (always last)
pnpm --filter claude-studio publish --no-git-checks
```

The CLI package (`claude-studio`) is unscoped so it does not need `--access public`.

## Common Issues

**workspace:* in published package** — Never leave `"workspace:*"` in a package.json that gets published. Always replace with explicit versions like `"^0.1.0"` before publishing. pnpm's `publish` command does NOT auto-rewrite these (unlike the `pnpm publish` with workspace protocol rewrites in newer configs).

**Publish order matters** — Publishing cli before server is published will cause install failures for users who get cli 0.1.x but server is not yet on npm.

**OTP / 2FA** — npm may prompt for a one-time password during publish. Have the authenticator app ready.

**Already-published version** — If a version was already published, bump the version again before retrying. npm does not allow re-publishing the same version.
