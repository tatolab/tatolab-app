# Tatolab.app

The macOS app for [Tatolab](https://tatolab.com). Opening it starts the Tatolab runtime
(`tatolabd`) as a login item that the app registers with `SMAppService`. The "Run Tatolab" switch
in the menu bar turns that registration on and off. Quitting the app only closes the menu bar
item; the runtime keeps running.

The runtime and the `tatolab` CLI come from [tatolab/streamlib](https://github.com/tatolab/streamlib)
(BUSL-1.1). This repository is proprietary (see `LICENSE`). It holds the app itself and the
packaging that wraps streamlib's runtime unit into a signed, notarized `.app` and `.dmg`.

Requirements: macOS 15 (Sequoia) or later, Apple silicon.

## Bundle layout

```
Tatolab.app/Contents/
  Info.plist                                  LSUIElement, usage strings (src-tauri/macos/Info.plist)
  MacOS/Tatolab                               the app (Tauri)
  MacOS/tatolabd                              the runtime (streamlib bin/tatolabd)
  MacOS/tatolab-cli                           the CLI (streamlib bin/tatolab); first launch links
                                              /usr/local/bin/tatolab to it
  Frameworks/tatolab-runtime/                 every Mach-O of the lend's tatolab/runtime/, same paths
    _engine.abi3.so
    _vulkan_driver/libvulkan.1.dylib
    _vulkan_driver/libMoltenVK.dylib
  Resources/lend/                             streamlib's lib/tatolab/lend; each Mach-O is a relative
                                              symlink into Frameworks/tatolab-runtime
  Library/LaunchAgents/com.tatolab.tatolabd.plist
                                              the SMAppService agent (packaging/launch-agent/)
```

The CLI is named `tatolab-cli` inside the bundle because APFS is case-insensitive by default, so a
file called `tatolab` would overwrite `Tatolab`. Code signing only accepts code under `MacOS/` and
`Frameworks/`. The lend keeps its shape through the symlinks, so `tatolabd` finds it at
`../Resources/lend` relative to its own directory.

Entitlements: `src-tauri/macos/Tatolab.entitlements` (the app) and
`packaging/entitlements/tatolabd.entitlements` (the runtime) carry `device.camera` and
`device.audio-input`. The hardened runtime refuses camera and microphone access without them. The
CLI needs none. Neither carries `cs.disable-library-validation`: every Mach-O in the bundle is
signed by the same team, so library validation accepts the dylibs `tatolabd` loads. Ad-hoc builds
are signed without the hardened runtime, because ad-hoc code has no Team ID and library
validation would refuse the bundled dylibs.

## Building locally

One command, from a checkout that has streamlib beside it (`../streamlib`):

```sh
scripts/build-tatolab-app.sh
```

It builds streamlib's runtime unit (`cargo xtask build-runtime --release`, in streamlib's own
target directory), then the Tauri app. It assembles the bundle, signs it, builds the branded
`.dmg` and checks the result. The output is `build/Tatolab.app` and
`build/Tatolab-<version>-arm64.dmg`.

| Option | |
|---|---|
| `--streamlib PATH` | streamlib checkout (default `../streamlib`) |
| `--runtime-unit DIR` | use an already-built runtime unit (`<streamlib>/target/tatolab-runtime`) |
| `--sign-identity ID` | codesign identity; default `-` (ad-hoc) |
| `--notarize` | notarize and staple; needs a `Developer ID Application` identity and `APPLE_API_KEY_PATH`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| `--app-version X.Y.Z` | bundle version; a release passes the streamlib version it bundles |
| `--local-proof-test-root` | local proof build, below |

**Local proof build** (`--local-proof-test-root`). Both the runtime unit and the app are built
with the `machine-directories-under-a-test-root` feature. The agent plist sets
`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, so the machine lock, the state directory and the
socket all live under that root. The app prepares the root itself: no administrator prompt, and
nothing is written to `/Library` or `/usr/local/bin`. Use it to prove the app on a development
Mac. It is never shipped: `assemble-tatolab-app-bundle.sh` refuses a test-root unit without the
flag, and `verify-tatolab-app-bundle.sh --shipping` fails such a bundle.

The individual steps are separate scripts in `scripts/`:

| Script | |
|---|---|
| `build-tatolab-runtime-unit.sh <streamlib> [--local-proof-test-root]` | builds the runtime unit |
| `assemble-tatolab-app-bundle.sh <Tatolab.app> <unit> [--local-proof-test-root]` | lays the unit into a Tauri-built app |
| `sign-tatolab-app-bundle.sh <Tatolab.app> <identity>` | signs inside-out (Frameworks, tatolabd, tatolab-cli, the app) |
| `make-tatolab-dmg.sh <Tatolab.app> <out.dmg>` | branded drag-to-Applications image (dmgbuild, headless) and its signature |
| `notarize-and-staple.sh <Tatolab.app\|.dmg>` | `notarytool submit --wait`, `stapler staple`, `spctl --assess` |
| `verify-tatolab-app-bundle.sh <Tatolab.app\|.dmg> [--shipping]` | checks the signature, layout, plists, entitlements, and Gatekeeper once stapled |
| `bump-homebrew-cask.sh <version> <dmg> <tap>` | writes `Casks/tatolab.rb` from `packaging/homebrew/tatolab.rb.template` |

The installer background is `packaging/dmg/tatolab-dmg-background.svg`, rendered to the
committed `@1x`/`@2x` PNGs by `packaging/dmg/render-dmg-background.sh` (needs `rsvg-convert`; it
fetches Instrument Sans with `npm pack`).

Tools: Xcode command line tools, Rust, Node 22+ (the Tauri CLI), `uv` (`uvx` runs the pinned dmgbuild), and
whatever streamlib's runtime build needs (`brew install shaderc cmake ninja`).

## CI

`.github/workflows/macos-app.yml` runs on `macos-15`:

- **push to `main`**: builds against streamlib `main` and uploads the `.dmg` as an artifact.
- **`workflow_dispatch`**: `streamlib_ref` (branch, tag or sha) and `publish` (needs a release
  tag such as `v0.46.0`).
- **`repository_dispatch` `streamlib-release`**: `client_payload.tag` names the streamlib
  release. It builds against that tag and publishes.

Secrets (the Infisical names). Without the Apple secrets the build is ad-hoc signed and is never
published:

| Secret | |
|---|---|
| `APPLE_CERTIFICATE` | base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | its password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: … (TEAMID)` |
| `APPLE_TEAM_ID` | the team id |
| `APPLE_API_KEY_ID` | App Store Connect API key id (notarization) |
| `APPLE_API_ISSUER` | its issuer id |
| `APPLE_API_KEY_P8_BASE64` | base64 of the `AuthKey_<id>.p8` |
| `STREAMLIB_RELEASE_UPLOAD_TOKEN` | token allowed to upload assets to tatolab/streamlib releases |
| `HOMEBREW_TAP_DEPLOY_KEY` | write deploy key of tatolab/homebrew-tap |

## How a release flows

1. streamlib cuts release `vX.Y.Z` (release-please).
2. streamlib's release workflow sends `repository_dispatch` (`event_type: streamlib-release`,
   `client_payload: {"tag": "vX.Y.Z"}`) to this repository.
3. `macos-app.yml` builds Tatolab.app X.Y.Z around that tag's runtime unit. It signs with the
   Developer ID, notarizes and staples the app and the `.dmg`, and verifies both.
4. The publish job refuses anything that was not notarized. Otherwise it uploads
   `Tatolab-X.Y.Z-arm64.dmg` to streamlib's `vX.Y.Z` release and pushes `Casks/tatolab.rb` with the
   new version and sha256 to tatolab/homebrew-tap.
5. `brew install --cask tatolab/tap/tatolab` installs it.
