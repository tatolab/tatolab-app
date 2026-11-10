# Comments

shadcn's generated components in `packages/tato-app-view-sdk/src/design_system/ui/` keep shadcn's own comments. These rules
govern the code that uses them, the design system included.

Write a comment only when it carries information you can't get by reading the code. Default to none.

## Don't
- Don't restate what the code does.
- Don't narrate a change (`changed X to Y`, `now uses…`, `previously…`).
- Don't explain or justify a decision — that belongs in the PR/commit, not an inline comment.
- Don't leave per-line play-by-play.
- Don't leave breadcrumbs: `moved-to`, `was`, `carved-from`.
- Don't write multi-paragraph TSDoc essays.
- Don't put `# Example` or `# Usage` sections in a doc comment.
- Don't put ASCII or markdown tables in a doc comment.

## Do
- Give each public item (a TypeScript `export`) a one-line doc.
- Comment a wire contract — a local API field, an MCP tool result's shape, a window IPC command's
  payload.
- Comment a platform quirk: an `SMAppService` status, a `launchctl` exit, a systemd unit state, a
  Chromium-in-Electron difference between macOS and Linux (window chrome, the tray, notifications).
- Comment a non-obvious external constraint (code signing, notarization, the bundle's seal, APFS
  case-folding).
- Comment a *why* the code's shape can't show.
- Delete narration or decision comments from any function you touch, in the same edit.

Applies to TypeScript, CSS, shell, Objective-C++, and everything else.
