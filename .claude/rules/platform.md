---
paths:
  - "src/main/**"
  - "src/preload/**"
  - "native/**"
  - "resources/**"
  - "packaging/**"
  - "scripts/**"
---

# Platform layer

- **Everything that differs by platform sits in `src/main/platform/`**, behind the
  interfaces the rest of the app uses (`RuntimeAgentRegistration`, `TatolabCommandLineToolLinks`,
  `TatolabUninstall`) and the `TatolabPlatformForThisBuild` each platform module builds. Where a
  platform has nothing to do, its item is `null` or `not_offered` with the reason, and says so in
  its doc. No `process.platform` or `os.platform()` outside `platform/` —
  ESLint (`eslint.config.js`) enforces it.
- **Extend the platform seam, never bypass it.** A new OS mechanism (a service-manager call, a
  path, a prompt) is a new item on both modules or a new method on the existing interface — never an
  `execFile("launchctl")` in shared code, never a second registration path.
- **Both platform modules load and test on either OS**: they import nothing that exists on only
  one, and reach the OS through injected seams, so `npm test` runs both everywhere. The app has no
  native piece of its own: the macOS module reaches launchd through `launchctl`.
- **Every OS side effect is injected.** `launchctl`, `systemctl --user`, `osascript`'s
  administrator prompt, `SMAppService` and the filesystem roots reach the code through a seam a
  test fakes. A test that would show a real prompt, register a real agent or touch `/Library`,
  `/usr/local/bin` or `~/.config/systemd` is a defect.
- **`machineDirectoriesUnderATestRoot` is for local proof only.** It moves the machine lock,
  state and socket under `TATOLAB_TEST_MACHINE_ROOT`; with it, `--app-update-feed-url` may point
  the app at a local update feed. Never ship either: the bundle scripts refuse a test-root unit
  without `--local-proof-test-root`, and `verify-tatolab-app-bundle.sh --shipping` fails a bundle
  with the test root or any update feed but get.tatolab.com's.
- **A build's features are a build-time input, never a patch.** `npm run build --
  [--local-proof-test-root] [--app-update-feed-url URL]` writes
  `out/main/tatolab_app_build_features.json`, which the main process imports and the bundle checks
  read out of `app.asar` (`scripts/tatolab_app_build_features.mjs read`). No script edits compiled
  JavaScript, and no check greps the asar for compiler text.
- **One signing identity.** The bundle is signed with the Developer ID Application identity from
  Infisical, imported for the build and removed after it, and by nothing else. The build scripts
  accept no other identity and have no ad-hoc mode; a missing certificate or identity stops the
  build before it assembles anything, naming what is missing. `verify-tatolab-app-bundle.sh` fails
  any bundle whose signature is ad-hoc or carries another Team ID. Only a release is notarized.
- **Signing and the bundle's seal are load-bearing.** Code lives only under `Contents/MacOS/` and
  `Contents/Frameworks/`; nothing writes into a signed bundle at run time; entitlements change only
  with a stated reason (each one is something the hardened runtime otherwise refuses). A
  packaging, bundle or release change carries a signed `scripts/build-tatolab-app.sh` build of its
  branch whose `scripts/verify-tatolab-app-bundle.sh` check passes, and a Linux packaging change a
  `scripts/build-tatolab-linux-app.sh` run on x86_64 Linux.
- **Privacy prompts follow the app.** TCC attributes the runtime's camera and microphone use to
  Tatolab.app, whose login item it is. A protected resource the runtime reads needs its usage
  string in `packaging/macos/Info.plist` and, where the hardened runtime gates it, the entitlement
  on both `packaging/entitlements/tatolab-app.entitlements` and `tatolabd.entitlements`. Every key added to `Info.plist`, an
  entitlement or the agent plist gets its assertion in `verify-tatolab-app-bundle.sh` in the same
  PR.
- **The app's lifecycle is a contract.** Closing the window hides it and the app stays in the tray
  (on macOS the Dock icon follows the window); "Quit Tatolab" quits only the app and never stops
  or unregisters the runtime; opening the app again shows the one window. The tray menu is the
  status line · Open Tatolab · Run Tatolab · Set Up Tatolab… (macOS, while setup is unfinished) ·
  Check for Updates… (a packaged app) · Quit Tatolab. An update installs only when the person
  chooses it. Changing any of these is a decision.
- **macOS changes are proven on macOS, Linux changes on Linux.** A Mac cannot run the Linux module
  against a real systemd or desktop; an x86_64 Linux machine or an `ubuntu:22.04` container is the
  gate for it. Linux proof without a Linux machine runs in a container and is labelled so (a
  runtime stand-in is named a stand-in).
