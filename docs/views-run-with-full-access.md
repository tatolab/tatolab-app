# Every view runs with full access and gets VideoFrames with no copy

Owner decision, 2026-11-10 (#195, #248). This is settled. Don't reopen it, don't ask about it again,
and don't flag it as a defect in review.

## Why

Tato Studio is not a typical app. People use it to drive live output, such as projection, stage
screens and installations, where a dropped or late frame is visible to an audience. A view that
shows or processes video has to get the runtime's frames at full rate with no copy. Chromium
transfers a `VideoFrame` across `postMessage` without a copy only within one agent cluster, which
means frames on the same origin. A view on any other origin, including an opaque sandboxed one,
could be sent only an `ImageBitmap`, which costs a GPU copy every frame. So every view runs on
Studio's origin.

## How it works

- **There is one mode: full access.** Studio has no sandbox mode. View contract 1.0 has no
  `sandbox` or `network`, and a `tatolab_view.json` that writes either is refused.
- **`capabilities` is a view's declaration of what it uses, not a sandbox.** It is a separate
  concern from full access. A view lists what it reads, writes and needs from the system, and
  Studio hands that list to the view in its grant. Today Studio blocks nothing a view leaves out;
  the declaration is what any later gate on runtime calls would read. `camera` and `microphone`
  are the exception, and they reach the system: a view's frame's permissions policy allows each
  one its manifest declares and refuses each it leaves out. The window's session lets a view's
  page ask for a camera or a microphone and refuses every other capture, the screen, a tab or the
  system's audio among them.
- **macOS asks once, for the whole app, when a view that declares a device arrives.** The system
  grants the camera and the microphone to Tato Studio, not to a view, and remembers the answer.
  Studio asks for each device as soon as a studio window lists a view that opens and declares it:
  on opening or creating a project, and after an import brings one. The prompt never waits for a
  view's first capture, which could land mid-show. A device already answered is not asked again,
  and a refused one is told once a run of the app in a notification naming the view, which opens
  System Settings' privacy pane. Linux has no such prompt.
- **Every view is framed on Studio's origin.** That is `tatolab-app://app/core_views/…` for
  Studio's own views and `tatolab-app://app/project_views/…` for a project's. Every view gets every
  part of the view contract.
- **An Image frame enters or leaves a view only as a transferred `VideoFrame`.** It is never an
  `ImageBitmap` and never any other copy.
- **Each view has a frame of its own,** so its CSS and DOM never touch Studio's window or another
  view. That separation covers presentation only and is not a security boundary.
- **A view is trusted like its project's nodes.** It can reach the window page through
  `window.parent`, the same way a project's Python node can rewrite the project. Trust is placed in
  the project the person opens or imports, as with VS Code's extensions or Blender's add-ons.
- **What Studio does for every view:** it serves the files only of a view a studio window listed
  as one that opens, read through the runtime's `read_project_file`, and only for a project a studio
  window holds open.

## Never

- Never add a sandbox or an opt-in isolation mode for views, and never let `capabilities` take
  away full access or the zero-copy frame path.
- Never give a view an origin of its own.
- Never convert a view's frames to `ImageBitmap`s, and never add any other copy to the frame path.
- Never treat a view reaching `window.parent` as a loosening of the window's seal.
