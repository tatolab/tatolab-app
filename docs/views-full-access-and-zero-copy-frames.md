# Views: full access and zero-copy frames

Status: owner decision, 2026-11-10 (tatolab-app #195, #248). This is how Tato Studio works. A
session does not reopen it, and a reviewer does not flag it as a loosening.

## Why

Tato Studio is a creation engine, not a management window. People use it live: projecting onto a
stage, a building or a set while they play it. A view is where they work with live video, so a
view gets frames at the speed the graph makes them, with nothing in between that copies them.
Extensible creative tools work this way. TouchDesigner components, Houdini HDAs, Blender add-ons,
VS Code and Obsidian extensions all run trusted, with your rights.

## What holds

- **Every view runs with full access. There is no sandbox.** A view runs on Studio's own origin
  (`tatolab-app://app`), is served the whole view contract, is allowed the camera and the
  microphone, and may reach the window's Electron bridge through `window.parent`. This applies to
  every view: core views, a project's views and its imports' views alike. `tatolab_view.json`
  has no `sandbox`, `capabilities` or `network` field, and a manifest that writes one is refused.
- **Every view runs in a frame of its own.** Its CSS and DOM never reach Studio's window or another
  view. The frame separates looks, not trust.
- **An Image frame crosses into or out of a view only as a `VideoFrame`, transferred, never
  copied.** Studio hands a view the port viewer's own `VideoFrame`, and a view hands Studio one
  the same way. No `ImageBitmap`, no canvas readback and no CPU copy of a frame anywhere on the
  path between the runtime's viewer and a view. The runtime allows one GPU copy, for an inbound
  Image, where a view needs it (`docs/engine-guarantee.md`, Views as graph nodes).
- **Same origin is what makes zero copy possible.** Chromium transfers a `VideoFrame` only within
  one agent cluster; a frame on another or an opaque origin refuses one with a `messageerror`.
  That is why a view is never moved to another origin or into an `<iframe sandbox>`.
- **Serving views widens the window's frame policy, and that is part of serving them.** The
  window's `frame-src` and `isAViewPageTheWindowFrames` in
  `apps/tato-app/src/main/tatolab_window_page_source.ts` cover every folder Studio serves views
  from. The rest of the window's seal (`.claude/rules/electron_boundary.md`) still holds.

## What goes to the owner

Only a change in the other direction: adding a sandbox or any per-view grant, moving a view off
Studio's origin, or putting a copy of a frame on a view's path.
