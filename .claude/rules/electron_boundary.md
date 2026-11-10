---
paths:
  - "apps/tato-app/src/main/electron_adapters/**"
  - "apps/tato-app/src/preload/**"
  - "apps/tato-app/src/main/tatolab_commands.ts"
  - "apps/tato-app/src/main/tatolab_window_page_source.ts"
  - "apps/tato-app/scripts/package_tatolab_electron_app.mjs"
  - "apps/tato-app/src/renderer/backend/**"
  - "apps/tato-app/src/shared/**"
---

# The Electron boundary

- **Every command in `TATOLAB_COMMAND_NAMES` can be invoked by any script the window's page
  runs** — including `uninstall_tatolab`. Keep the list to what `TatolabBackend` uses; a new
  command is named in the issue's Design section. The main process answers a command only for the
  window's own page (`isACommandFromTheWindowsOwnPage`); that check never loosens.
- **The window stays sealed.** `contextIsolation`, `sandbox` and `webSecurity` on,
  `nodeIntegration` off; the preload exposes only `tatolabElectronBridge`; new windows are denied,
  navigation off the page's own location is refused, and every permission request is answered
  no. The page is served under `tatolab-app:` with the CSP from
  `windowPageContentSecurityPolicy` — `connect-src 'self'`, nothing remote — so the window reaches
  the local API only through the main process. Loosening any of these is a decision; state the
  reason in the PR.
- **Views are the settled exception to the seal** (`docs/views-full-access-and-zero-copy-frames.md`).
  Every view runs with full access on the page's own origin, in a frame of its own, with no
  sandbox, and may reach `tatolabElectronBridge` through `window.parent`. The window's `frame-src` and
  `isAViewPageTheWindowFrames` cover every folder Studio serves views from. None of this is a
  loosening to bring to the owner; sealing a view or copying its frames is.
- **The fuses stay flipped.** `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and
  `EnableNodeCliInspectArguments` off, `OnlyLoadAppFromAsar` on (and asar integrity on macOS):
  otherwise any process can run the signed app as plain Node and inherit its camera and
  microphone grants. `apps/tato-app/scripts/verify-tatolab-app-bundle.sh` and the Linux build check them.
- **`appBundleId` (`com.tatolab.tatolab`) never changes** — the settings directory and TCC
  attribution hang off it.
- **A command lands whole**: its signature in `TatolabCommandSignatures`, its handler in
  `tatolab_commands.ts` answering `{ ok, value }` or `{ ok: false, refusal }` — resolved, never
  rejected, so the refusal reaches the window word for word — with work that can wait off the
  answer path; with its `TatolabBackend` method, the Electron and mock implementations, and a
  test in `tatolab_commands.test.ts` that pins the payload the TypeScript contract reads.
