# Tatolab.app

The desktop app for [Tatolab](https://tatolab.com), on macOS and Linux: a menu-bar (tray) app
with a window. The window lists the streams the Tatolab runtime (`tatolabd`) holds as they start
and stop, and shows each stream's graph and logs. The "Run Tatolab" switch turns the runtime's
login service on and off. Closing the window leaves the app in the menu bar or panel, where "Open
Tatolab" brings the window back. Quitting the app closes the window and the tray item; the runtime
keeps running.

The tray menu shows a one-line status, "Open Tatolab", the "Run Tatolab" switch, "Open Login
Items…" while macOS waits for approval, "Try Again" once the runtime didn't start or was blocked,
"Check for Updates…" in a packaged app, and "Quit Tatolab". The window reads
everything from the runtime's local API: `list_streams`, `logs` and `graph` over MCP, and
`GET /api/graph` for the machine's name. It stops, starts (or retries) and removes a stream with
the MCP tools `stop_stream`, `start_stream` and `remove_stream`; loading a new stream is the
`tatolab` CLI's. A stream's Overview plays an exposed output in a frame of the runtime's preview
page, `http://127.0.0.1:4446/watch/…`, the one origin the window's content security policy frames.
"Open project" and "Terminal" open the folder the runtime lists for the stream, in Finder or the
file manager, and in Terminal.app or `x-terminal-emulator`.

|  | macOS | Linux |
|---|---|---|
| The runtime | inside the app, run as a login item the app registers with `SMAppService` | from the installer, run as the systemd user service `tatolabd.service` |
| "Run Tatolab" | registers and unregisters the login item | `systemctl --user enable --now` / `disable --now tatolabd.service` |
| First launch | Welcome and Getting set up, with no administrator password; links `~/.local/bin/tatolab` | nothing: the installer set the machine up |
| Local API socket | `/tmp/streamlib-<uid>/local-api.sock` | `$XDG_RUNTIME_DIR/streamlib/local-api.sock`, else `/tmp/streamlib-<uid>/local-api.sock` |
| Uninstall | the app's "Uninstall Tatolab…", or `brew uninstall --cask tatolab` | the installer's `--uninstall`, then remove the app's package |

## Updates

A packaged app checks the feed at `https://get.tatolab.com/app/` at launch and once a day, through
[electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater)'s
generic provider. A check on its own only notifies that a newer version is available; nothing
downloads or installs until the person chooses "Check for Updates…" in the tray, or its button in
Settings. On macOS Squirrel.Mac replaces the bundle from the signed `.zip` and reopens it, and the
app then registers the runtime's agent again, so launchd runs the
version the bundle ships with and the runtime reloads its kept streams; the AppImage replaces its own file and reopens; a `.deb` opens the newer
package's download in the browser, since apt alone replaces it. The feed's manifests are
`app/latest-mac.yml` and `app/latest-linux.yml`, which point at `releases/<version>/`.

The runtime and the `tatolab` CLI come from [tatolab/streamlib](https://github.com/tatolab/streamlib)
(BUSL-1.1). This repository is proprietary (see `LICENSE`). It holds the app itself, the packaging
that wraps streamlib's runtime unit into a signed, notarized `.app` and `.dmg`, and the Linux
`.deb` and AppImage, which carry no runtime.

Requirements: macOS 15 (Sequoia) or later on Apple silicon; or x86_64 Linux with a systemd user
session (Ubuntu 22.04 or later, Debian 12 or later). The window runs on the Chromium Electron
bundles, so it needs no system web engine. A GNOME desktop shows the tray
item only with the AppIndicator extension, which Ubuntu ships.

## Installing

**macOS.** Open `Tatolab-<version>-arm64.dmg` from the
[streamlib release](https://github.com/tatolab/streamlib/releases) and drag Tatolab into
Applications, or:

```sh
brew install --cask tatolab/tap/tatolab
```

Opening the app registers the runtime's login item and links the `tatolab` command into
`~/.local/bin`, with no administrator password. The first time, it says what Tatolab is and shows
the runtime starting, asking for something only when macOS needs it: approval in Login Items, or a
Try Again when macOS blocks the runtime. Settings › Command line also offers a link in
`/usr/local/bin`, which works in every terminal and asks for an administrator's password.

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

**macOS.** The app's "Uninstall Tatolab…":

1. removes `/usr/local/bin/tatolab` if it links into this app, behind one administrator prompt
   shown only then. Cancelling the prompt changes nothing;
2. removes `~/.local/bin/tatolab` if it links into this app;
3. unregisters the login item, which stops the runtime;
4. removes the app's own settings, `~/Library/Application Support/com.tatolab.tatolab`;
5. moves Tatolab.app to the Trash, and quits.

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

Everything that differs by platform sits in `src/main/platform/`, behind the interfaces
the rest of the main process uses: `RuntimeAgentRegistration` (the service manager that runs the
runtime), `TatolabCommandLineToolLinks` (the `tatolab` command's links: the app's own on macOS,
the installer's on Linux), and
each platform's window chrome, Dock icon, tray image, menu and uninstall. Both platform modules
expose the same items, and only `platform/` reads `process.platform`
(ESLint, `eslint.config.js`). `platform/macos/` drives `SMAppService` through the
app's native addon, `launchctl kickstart` and `osascript`; `platform/linux/` drives
`systemctl --user` and reads the machine's paths. Neither module needs its OS to run its tests, so
`npm test` on either platform runs both. On any other OS the app refuses to start.

## macOS bundle layout

```
Tatolab.app/Contents/
  Info.plist                                  LSUIElement, usage strings (packaging/macos/Info.plist)
  MacOS/Tatolab                               the app (Electron); its window, main process and
                                              preload in Resources/app.asar
  Frameworks/Electron Framework.framework, Frameworks/Tatolab Helper*.app
                                              Electron, and its GPU, plugin and renderer helpers
  Frameworks/tatolab-app-native/service_management_agent_services.node
                                              the app's Service Management addon
  MacOS/tatolabd                              the runtime (streamlib bin/tatolabd)
  MacOS/tatolab-cli                           the CLI (streamlib bin/tatolab); the app links
                                              ~/.local/bin/tatolab to it
  MacOS/moq-relay                             the local relay (streamlib bin/moq-relay); tatolabd
                                              runs it from beside itself as its two local relays
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

Entitlements: `packaging/entitlements/tatolab-app.entitlements` (the app) and
`packaging/entitlements/tatolabd.entitlements` (the runtime) carry `device.camera` and
`device.audio-input`. The hardened runtime refuses camera and microphone access without them. The
app and `Tatolab Helper (Renderer).app` (`packaging/entitlements/tatolab-renderer-helper.entitlements`)
also carry `cs.allow-jit`, because V8 maps its code writable and executable; Electron's other
helpers, the CLI and the relay carry none. The packaged app's Electron fuses turn off `RunAsNode`,
`NODE_OPTIONS` and `--inspect`, so no other process can run the signed app as plain Node and
inherit its camera grant, and turn on asar integrity and asar-only loading. Electron's own
Bluetooth and audio-capture usage strings and its `NSAllowsArbitraryLoads` exception are removed;
the app uses none of them. The main process
keeps Chromium's profile in `~/Library/Application Support/com.tatolab.tatolab` (Linux:
`~/.config/com.tatolab.tatolab`), never in the runtime's `~/Library/Application Support/Tatolab`. Neither carries `cs.disable-library-validation`: every Mach-O in the bundle is
signed by the same team, so library validation accepts the dylibs `tatolabd` loads. Ad-hoc builds
are signed without the hardened runtime, because ad-hoc code has no Team ID and library
validation would refuse the bundled dylibs.

## Linux packages

The `.deb` (package `tatolab`) installs the Electron app in `/usr/lib/tatolab/`, linked as
`/usr/bin/Tatolab`, with the desktop entry `/usr/share/applications/Tatolab.desktop`
(`Categories=Development;`) and its icons. Its `chrome-sandbox` is setuid root, which Chromium
needs where unprivileged user namespaces are off. `Depends` names Electron's libraries without
versions or `t64` suffixes, so one package installs on Ubuntu 22.04 and 24.04; the build fails if
the app links a library the list does not name. It recommends `curl` for the installer's command.
The AppImage carries the same app; it has no setuid sandbox helper, so it needs unprivileged user
namespaces (on by default on Ubuntu 22.04, restricted by AppArmor on 24.04).

## Building on macOS

One command, from a checkout that has streamlib beside it (`../streamlib`):

```sh
scripts/build-tatolab-app.sh
```

It builds streamlib's runtime unit (`cargo xtask build-runtime --release`, in streamlib's own
target directory), then the Electron app: `npm run build` (the window into `out/renderer/`),
`npm run build:electron` (the main process, the preload and the build features), the arm64 Service Management addon,
and `scripts/package_tatolab_electron_app.mjs`, which packs exactly those into the asar with
`@electron/packager` and flips the fuses. It assembles the bundle, signs it, builds the
branded `.dmg` and checks the result. The output is `build/Tatolab.app`,
`build/Tatolab-<version>-arm64.dmg`, and the update: `build/Tatolab-<version>-arm64-mac.zip` and its
manifest `build/latest-mac.yml`.

| Option | |
|---|---|
| `--streamlib PATH` | streamlib checkout (default `../streamlib`) |
| `--runtime-unit DIR` | use an already-built runtime unit (`<streamlib>/target/tatolab-runtime`) |
| `--sign-identity ID` | codesign identity; default `-` (ad-hoc) |
| `--notarize` | notarize and staple; needs a `Developer ID Application` identity and `APPLE_API_KEY_PATH`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| `--app-version X.Y.Z` | bundle version; a release passes the streamlib version it bundles |
| `--local-proof-test-root` | local proof build, below |
| `--app-update-feed-url URL` | the update feed the app checks, in place of get.tatolab.com's; only with `--local-proof-test-root` |

**Local proof build** (`--local-proof-test-root`). The runtime unit is built with the
`machine-directories-under-a-test-root` feature, and the app with
`npm run build:electron -- --local-proof-test-root`, which writes
`machineDirectoriesUnderATestRoot: true` into the build features the main process imports,
`out/main/tatolab_app_build_features.json` (`src/main/tatolab_app_build_features.json` holds the
shipping ones). The agent plist sets
`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, so the state directory and the socket live under
that root, and gives the runtime its test ports: its local relay on 14443 and
14445 and its loopback HTTP on 14446, where the app reads the preview page. That page reads the
relay only at 4443 until tatolab/streamlib#2917, so a local-proof bundle's preview stays dark. The app links `tatolab` under
the root's `home/.local/bin` and never in `/usr/local/bin`. Uninstalling a local-proof build removes
`/tmp/tatolab-proof` instead of prompting. Use it to prove the app on a development Mac. It is
never shipped: `assemble-tatolab-app-bundle.sh` refuses a test-root unit without the flag, and
`verify-tatolab-app-bundle.sh --shipping` fails such a bundle, whether the marker, the agent's
environment or the build features inside the asar give it away, and fails one that checks any
update feed but get.tatolab.com's.

The individual steps are separate scripts in `scripts/`:

| Script | |
|---|---|
| `build-tatolab-runtime-unit.sh <streamlib> [--local-proof-test-root]` | builds the runtime unit |
| `tatolab_app_build_features.mjs write <features.json> [--local-proof-test-root] [--app-update-feed-url URL]` | writes the build features; `npm run build:electron -- <flags>` runs it last |
| `tatolab_app_build_features.mjs read <app.asar> [--shipping]` | prints the build features a packaged app carries; `--shipping` refuses the test root or any feed but get.tatolab.com's |
| `package_tatolab_electron_app.mjs <darwin\|linux> <version> <out>` | packs the built app, with the build features it was built with, and its production `node_modules` with `@electron/packager`, and flips its fuses |
| `assemble-tatolab-app-bundle.sh <Tatolab.app> <unit> [--local-proof-test-root]` | lays the unit into the packaged app; refuses a unit whose `bin/` lacks `tatolabd`, `tatolab` or `moq-relay`, or holds any other file |
| `sign-tatolab-app-bundle.sh <Tatolab.app> <identity>` | signs inside-out (Frameworks' Mach-O, the frameworks, the helpers, tatolabd, tatolab-cli, moq-relay, the app) |
| `make-tatolab-dmg.sh <Tatolab.app> <out.dmg>` | branded drag-to-Applications image (dmgbuild, headless) and its signature |
| `notarize-and-staple.sh <Tatolab.app\|.dmg>` | `notarytool submit --wait`, `stapler staple`, `spctl --assess` |
| `verify-tatolab-app-bundle.sh <Tatolab.app\|.dmg> [--shipping]` | checks the signature, layout, plists, entitlements, fuses, and Gatekeeper once stapled |
| `write_tatolab_app_update_manifest.mjs <manifest.yml> <version> <file>...` | writes the update feed's manifest for those files: sizes, SHA-512s, and URLs under `../releases/<version>/` |
| `bump-homebrew-cask.sh <version> <dmg> <tap>` | writes `Casks/tatolab.rb` from `packaging/homebrew/tatolab.rb.template` |

The installer background is `packaging/dmg/tatolab-dmg-background.svg`, rendered to the
committed `@1x`/`@2x` PNGs by `packaging/dmg/render-dmg-background.sh` (needs `rsvg-convert`; it
fetches Instrument Sans with `npm pack`).

Tools: Xcode command line tools, Rust, Node 22+ (the window, the Electron app and its addon), `uv` (`uvx` runs the pinned dmgbuild), and
whatever streamlib's runtime build needs (`brew install shaderc cmake ninja`).

## Building on Linux

On x86_64 Linux, with Node 22+:

```sh
sudo apt install dpkg-dev desktop-file-utils curl
scripts/build-tatolab-linux-app.sh
```

It builds and packages the Electron app as on macOS, lays out the `.deb` and builds it with
`dpkg-deb`, builds the AppImage with a pinned `appimagetool` and AppImage runtime (checksums in
the script), checks the fuses, the build features, the `.deb`'s members, sandbox helper and desktop entry, and writes `build/linux/Tatolab-<version>-amd64.deb`,
`build/linux/Tatolab-<version>-x86_64.AppImage` and the update manifest listing both,
`build/linux/latest-linux.yml`. No streamlib checkout is needed. `--app-version
X.Y.Z` sets the packages' version; `--local-proof-test-root` builds with
`machineDirectoriesUnderATestRoot` on, so the app reads the runtime under
`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, and names both packages `-local-proof`;
`--app-update-feed-url URL`, only with it, points the app at a local update feed.

## Working on the window

The window is React with Tailwind and shadcn (base-ui). Its design system is the code: the tokens in
`src/renderer/styles/tokens.css`, shadcn's components, and the Tatolab components and variants in
`src/renderer/design_system/`. `npm run dev` serves the window on `http://localhost:1420`; `npm run electron:dev`, in a second
terminal, builds the main process and runs the app against it, unpackaged. It shows whatever
runtime is already running on the machine's local API socket; only a `--local-proof-test-root`
build reads a local-proof runtime's `/tmp/tatolab-proof/run/local-api.sock`. On macOS an
unpackaged app finds no launch agent, so "Run Tatolab" registers nothing there; on Linux it drives the installer's `tatolabd.service` as the
packaged app does. `npm run dev` alone serves the window in a browser against a mock backend; a build leaves the mock
out, and packaging refuses an `out/renderer/` that carries it.

## CI

`.github/workflows/pull-request-checks.yml` runs `npm run lint` and, on `macos-15` and
`ubuntu-22.04`, `npm run build`, `npm run build:electron` and `npm test` on every pull request.
`.github/workflows/macos-app.yml` builds the macOS app on `macos-15` and the Linux packages on
`ubuntu-22.04`, each job type-checking and testing the app first, and keeps the uploaded artifacts
7 days:

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
