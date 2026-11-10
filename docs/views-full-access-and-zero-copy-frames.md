# Views: full access and zero-copy frames

Status: owner decision, 2026-11-10 (tatolab-app #195). This is how Tato Studio works. A session
does not reopen it, and a reviewer does not flag it as a loosening.

## Why

Tato Studio is a creation engine, not a management window. People use it live: projecting onto a
stage, a building or a set while they play it. A view is where they work with live video, so a
view gets frames at the speed the graph makes them, with nothing in between that copies them.
Extensible creative tools work this way. TouchDesigner components, Houdini HDAs, Blender add-ons,
VS Code and Obsidian extensions all run trusted, with your rights.

## What holds

- **A view runs with full access by default.** A view whose `tatolab_view.json` leaves out
  `sandbox`, or sets it `false`, runs on Studio's own origin (`tatolab-app://app`), is granted
  every view capability, and may reach the window's Electron bridge through `window.parent`.
  This applies to every view: core views, a project's views and its imports' views alike.
- **Every view runs in a frame of its own.** Its CSS and DOM never reach Studio's window or another
  view. The frame separates looks, not trust.
- **An Image frame crosses into or out of a view only as a `VideoFrame`, transferred, never
  copied.** Studio hands a view the port viewer's own `VideoFrame`, and a view hands Studio one
  the same way. No `ImageBitmap`, no canvas readback and no CPU copy of a frame anywhere on the
  path between the runtime's viewer and a view. The runtime allows one GPU copy, for an inbound
  Image, where a view needs it (`docs/engine-guarantee.md`, Views as graph nodes). The one
  `ImageBitmap` conversion the tree still holds, for a sandboxed view, is removed by #248.
- **Same origin is what makes zero copy possible.** Chromium transfers a `VideoFrame` only within
  one agent cluster. A frame on another or an opaque origin refuses one with a `messageerror`.
  A full-access view is therefore on Studio's origin by necessity, not by convenience.
- **The sandbox is the view's own opt-in.** `sandbox: true` runs a view on an opaque origin,
  served only the `capabilities` and `network` hosts its manifest lists. It is never the default,
  and Studio never forces it on a view.
- **Serving views widens the window's frame policy, and that is part of serving them.** The
  window's `frame-src` and `isAViewPageTheWindowFrames` in
  `apps/tato-app/src/main/tatolab_window_page_source.ts` cover every folder Studio serves views
  from. The rest of the window's seal (`.claude/rules/electron_boundary.md`) still holds.

## What goes to the owner

Only a change in the other direction: sealing or sandboxing full-access views, making the sandbox
the default, or putting a copy of a frame on a view's path.
