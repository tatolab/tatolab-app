# Tatolab.app

The desktop app for [Tatolab](https://tatolab.com), on macOS and Linux: a menu-bar (tray) app
with a window. The window lists the streams the Tatolab runtime (`tatolabd`) holds as they start
and stop, and shows each stream's graph and logs. The "Run Tatolab" switch turns the runtime's
login service on and off. Closing the window leaves the app in the menu bar or panel, where "Open
Tatolab" brings the window back. Quitting the app closes the window and the tray item; the runtime
keeps running.

The tray menu shows a one-line status, "Open Tatolab", the "Run Tatolab" switch, "Set Up
Tatolab…" while macOS's first-launch setup is unfinished, and "Quit Tatolab". The window reads
everything from the runtime's local API: `list_streams` and `logs` over MCP, `GET /api/graph` for
the machine's name and each stream's graph. It shows the streams and does not start or stop them;
the `tatolab` CLI does.

|  | macOS | Linux |
|---|---|---|
| The runtime | inside the app, run as a login item the app registers with `SMAppService` | from the installer, run as the systemd user service `tatolabd.service` |
| "Run Tatolab" | registers and unregisters the login item | `systemctl --user enable --now` / `disable --now tatolabd.service` |
| First launch | links `/usr/local/bin/tatolab` and creates the machine runtime lock behind one administrator prompt | nothing: the installer set the machine up |
| Local API socket | `/tmp/streamlib-<uid>/local-api.sock` | `$XDG_RUNTIME_DIR/streamlib/local-api.sock`, else `/tmp/streamlib-<uid>/local-api.sock` |
| Uninstall | the app's "Uninstall Tatolab…", or `brew uninstall --cask tatolab` | the installer's `--uninstall`, then remove the app's package |

The runtime and the `tatolab` CLI come from [tatolab/streamlib](https://github.com/tatolab/streamlib)
(BUSL-1.1). This repository is proprietary (see `LICENSE`). It holds the app itself, the packaging
that wraps streamlib's runtime unit into a signed, notarized `.app` and `.dmg`, and the Linux
`.deb` and AppImage, which carry no runtime.

Requirements: macOS 15 (Sequoia) or later on Apple silicon; or x86_64 Linux with a systemd user
session and WebKitGTK 4.1 (Ubuntu 22.04 or later, Debian 12 or later). A GNOME desktop shows the
tray item only with the AppIndicator extension, which Ubuntu ships.

## Installing

**macOS.** Open `Tatolab-<version>-arm64.dmg` from the
[streamlib release](https://github.com/tatolab/streamlib/releases) and drag Tatolab into
Applications, or:

```sh
brew install --cask tatolab/tap/tatolab
```

Opening the app registers the runtime's login item and, the first time, asks once for an
administrator's password to link the `tatolab` command and create the machine runtime lock.

**Linux.** The installer is the one way to install the runtime. It unpacks it to
`~/.local/share/tatolab/<version>/`, links `tatolab` and `tatolabd` into `~/.local/bin`, and
installs and starts the systemd user service `tatolabd.service`:

```sh
curl -fsSL https://get.tatolab.com/install.sh | sh
```

Then install the app from the same streamlib release, as the `.deb`:

```sh
sudo apt install ./Tatolab-<version>-amd64.deb
```

or as the AppImage, which needs no installing:

```sh
chmod +x Tatolab-<version>-x86_64.AppImage && ./Tatolab-<version>-x86_64.AppImage
```

The app installs no runtime: with no `tatolabd.service` it has no runtime to show, and its
status reads the agent as `not_found` until the installer has run.

## Uninstalling

Uninstalling removes the runtime's service and files and never its state directory, where the
runtime keeps your kept streams and logs.

**macOS.** The app's "Uninstall Tatolab…" asks once for an administrator's password, then:

1. removes `/usr/local/bin/tatolab` if it links into this app, and
   `/Library/Application Support/Tatolab` (the machine runtime lock). Cancelling the prompt
   changes nothing;
2. unregisters the login item, which stops the runtime;
3. removes the app's own settings, `~/Library/Application Support/com.tatolab.tatolab`;
4. moves Tatolab.app to the Trash, and quits.

`~/Library/Application Support/Tatolab`, the state directory, stays. `brew uninstall --cask
tatolab` removes the same service and files; `brew uninstall --zap --cask tatolab` removes the
state directory and the app's settings too.

**Linux.** The installer uninstalls what it installed: the service and the files, never the state
directory (`$XDG_STATE_HOME/tatolab`, else `~/.local/state/tatolab`). Then remove the app:

```sh
curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --uninstall
sudo apt remove tatolab        # the .deb; for the AppImage, delete the file
```

On Linux the app's "Uninstall Tatolab…" shows these steps and removes nothing itself.

## The app's platform layer

Everything that differs by platform sits in `src-tauri/src/platform/`, behind the traits the rest
of the app uses: `RuntimeAgentRegistration` (the service manager that runs the runtime),
`TatolabMachineSetup` (macOS's administrator-prompt setup; always complete on Linux), and each
platform's window chrome, Dock icon, tray image, uninstall and how it hears the app opened again.
Both platform modules expose the same items, so the rest of the app calls them with no `cfg`.
`platform/macos/` drives `SMAppService`, `launchctl kickstart`, `osascript` and `NSFileManager`;
`platform/linux/` drives `systemctl --user`, reads the machine's paths, and hands a second launch
to the running app through `tauri-plugin-single-instance`. Apart from that plugin's wiring, the
Linux module needs nothing Linux-only to build, so `cargo test` on a Mac runs its tests too. Any
other OS is a compile error.

## macOS bundle layout

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
                                              symlink into Frameworks/tatolab-runtime; precompiled
                                              (unchecked-hash .pyc) for CPython 3.10-3.14
  Library/LaunchAgents/com.tatolab.tatolabd.plist
                                              the SMAppService agent (packaging/launch-agent/)
```

The CLI is named `tatolab-cli` inside the bundle because APFS is case-insensitive by default, so a
file called `tatolab` would overwrite `Tatolab`. Code signing only accepts code under `MacOS/` and
`Frameworks/`. The lend keeps its shape through the symlinks, so `tatolabd` finds it at
`../Resources/lend` relative to its own directory. Processor interpreters (the user's venv Python)
import `tatolab.runtime` from that lend with every `PYTHON*` variable stripped. Without the shipped
bytecode they would write `__pycache__` into the signed bundle, which breaks its seal.

Entitlements: `src-tauri/macos/Tatolab.entitlements` (the app) and
`packaging/entitlements/tatolabd.entitlements` (the runtime) carry `device.camera` and
`device.audio-input`. The hardened runtime refuses camera and microphone access without them. The
CLI needs none. Neither carries `cs.disable-library-validation`: every Mach-O in the bundle is
signed by the same team, so library validation accepts the dylibs `tatolabd` loads. Ad-hoc builds
are signed without the hardened runtime, because ad-hoc code has no Team ID and library
validation would refuse the bundled dylibs.

## Linux packages

The `.deb` installs the app as `/usr/bin/Tatolab` with the desktop entry
`/usr/share/applications/Tatolab.desktop` (`Categories=Development;`) and its icons. Tauri's CLI
writes its `Depends`: `libwebkit2gtk-4.1-0`, `libgtk-3-0` and, for the tray,
`libayatana-appindicator3-1`; it recommends `curl` for the installer's command. The AppImage
carries the same app with WebKitGTK and the appindicator inside it.

## Building on macOS

One command, from a checkout that has streamlib beside it (`../streamlib`):

```sh
scripts/build-tatolab-app.sh
```

It builds streamlib's runtime unit (`cargo xtask build-runtime --release`, in streamlib's own
target directory), then the Tauri app; Tauri's build runs `npm run build`, which builds the
window's frontend into `dist/` for the app to embed. It assembles the bundle, signs it, builds the
branded `.dmg` and checks the result. The output is `build/Tatolab.app` and
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
nothing is written to `/Library` or `/usr/local/bin`. Uninstalling a local-proof build removes
`/tmp/tatolab-proof` instead of prompting. Use it to prove the app on a development Mac. It is
never shipped: `assemble-tatolab-app-bundle.sh` refuses a test-root unit without the flag, and
`verify-tatolab-app-bundle.sh --shipping` fails such a bundle.

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

Tools: Xcode command line tools, Rust, Node 22+ (the window's frontend and the Tauri CLI), `uv` (`uvx` runs the pinned dmgbuild), and
whatever streamlib's runtime build needs (`brew install shaderc cmake ninja`).

## Building on Linux

On x86_64 Linux, with Rust, Node 22+ and Tauri v2's Linux prerequisites:

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
scripts/build-tatolab-linux-app.sh
```

It runs `npm ci` and `npx tauri build --bundles deb,appimage`, checks the `.deb`'s dependencies
and desktop entry, and writes `build/linux/Tatolab-<version>-amd64.deb` and
`build/linux/Tatolab-<version>-x86_64.AppImage`. No streamlib checkout is needed. `--app-version
X.Y.Z` sets the packages' version; `--local-proof-test-root` builds with
`machine-directories-under-a-test-root`, so the app reads the runtime under
`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, and names both packages `-local-proof`.

## Working on the window

`npx tauri dev` runs `npm run dev` (the frontend's dev server on `http://localhost:1420`) and the
app against it, unbundled. It shows whatever runtime is already running on the socket its build
names: add `--features machine-directories-under-a-test-root` to read a local-proof runtime's
`/tmp/tatolab-proof/run/local-api.sock`. On macOS an unbundled app finds no launch agent, so "Run
Tatolab" registers nothing there; on Linux it drives the installer's `tatolabd.service` as the
packaged app does. `npm run dev` alone serves the window in a browser against a mock backend.

## CI

`.github/workflows/macos-app.yml` builds the macOS app on `macos-15` and the Linux packages on
`ubuntu-22.04`, each job running `cargo test` and `cargo clippy --all-targets -- -D warnings`
first (the macOS job in both feature sets), and keeps the uploaded artifacts 7 days:

- **push to `main`**: builds against streamlib `main` and uploads the `.dmg`, the `.deb` and the
  AppImage as artifacts.
- **`workflow_dispatch`**: `streamlib_ref` (branch, tag or sha) and `publish` (needs a release
  tag such as `v0.46.0`).
- **`repository_dispatch` `streamlib-release`**: `client_payload.tag` names the streamlib
  release. It builds against that tag and publishes.

Secrets (the Infisical names). Without the Apple secrets the build is ad-hoc signed and nothing is
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
   Developer ID, notarizes and staples the app and the `.dmg`, and verifies both. Beside it, it
   builds the Linux `.deb` and AppImage at X.Y.Z.
4. The publish job refuses anything that was not notarized. Otherwise it uploads
   `Tatolab-X.Y.Z-arm64.dmg`, `Tatolab-X.Y.Z-amd64.deb` and `Tatolab-X.Y.Z-x86_64.AppImage` to
   streamlib's `vX.Y.Z` release and pushes `Casks/tatolab.rb` with the new version and sha256 to
   tatolab/homebrew-tap.
5. `brew install --cask tatolab/tap/tatolab` installs it on macOS; on Linux the installer and
   the release's `.deb` or AppImage do.
