# Project views run with full access on Studio's origin

Owner decision, 2026-11-10 (#195). Settled: do not reopen it, do not ask about it again, and do
not "fix" it in review.

## Why

People use Studio to drive live output — projection, stage screens, installations — where a
dropped or late frame is visible to an audience. A view that shows or processes video has to get
the runtime's frames at full rate with no copy. Chromium hands a `VideoFrame` across
`postMessage` without copying only within one agent cluster, which means frames on the same
origin. A view on any other origin can only be sent an `ImageBitmap`, which costs a GPU copy for
every frame. So a view that runs with full access has to run on Studio's origin.

## How it works

- **Full access is the default.** A view whose `tatolab_view.json` doesn't set `sandbox: true` is
  framed on the window's origin (`tatolab-app://app/project_views/…`) and has every capability.
  An Image port's frames reach it as `VideoFrame`s, moved over its MessagePort with no copy.
- **Each view gets a frame of its own**, so its CSS and DOM never touch Studio's window or another
  view. That separation covers presentation only. It is not a security boundary.
- **It is trusted like its project's nodes.** A full-access view can reach the window page through
  `window.parent`, the same way a project's Python node can rewrite the project. This is intended,
  and it is like VS Code, where an extension's code runs fully trusted. Trust is placed in the
  project the person opens or imports, not enforced by a sandbox.
- **The sandbox is the view's own opt-in.** A view that sets `sandbox: true` runs on an opaque
  origin with only the permissions and `network` hosts its manifest lists. Its frames reach it as
  `ImageBitmap`s. Its asks are held to its own project, and its pages carry a CSP that keeps them
  to their own folder.
- **What Studio does for every view:** it serves the files only of a view it listed as one that
  opens, read through the runtime's `read_project_file`, and only for a project a studio window
  holds open.

## Never

- Never move full-access views to an origin of their own, and never put them behind an opaque
  sandbox.
- Never convert a full-access view's frames to `ImageBitmap`s, and never add any other copy to its
  frame path.
- Never make the sandbox the default.
- Never treat a full-access view reaching `window.parent` as a defect that needs the owner. Changing
  any of this is the owner's call, and the owner has made it.
