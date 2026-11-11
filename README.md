# Tato Studio

Tato Studio, made by Tatolab LLC, is the desktop app for the [Tatolab](https://tatolab.com) runtime, on macOS and Linux: a menu-bar (tray) app
with a window. The window lists the streams the Tatolab runtime (`tatolabd`) holds as they start
and stop, and shows each stream's graph and logs. The app runs the runtime it carries as its own
child process, the way an editor runs a language server: it starts it when the app opens and no
runtime answers, starts it again after it exits (waiting 1 second, doubling up to 30), and stops it
when the app quits. A runtime that already answers, such as one the `tatolab` CLI started, is used
as it is and never restarted by the app. Nothing is installed and nothing asks for a password.
Closing the window leaves the app and the runtime in the menu bar or panel, where "Open Tato
Studio" brings the window back. Quitting the app closes the window and the tray item and stops the
runtime and its streams.

The tray menu shows a one-line status, "Open Tato Studio", "Check for Updates…" in a packaged app
("Restart to Update" once a newer version is staged), and "Quit Tato Studio". The window opens on the Projects window, whose New project asks for a
name and a location, `Tato Studio` in the Documents folder until Browse… picks another, and has the
runtime make the project in that folder. Each project opens in a studio window of its own, titled
with the project's name, or brings forward the window it already has; the Projects window steps
aside once it opens one, and File › Projects or the tray brings it back. Pop out into a window,
in any area's view-type menu, opens that area's view in a small window of its own, for a second monitor,
pinned to the stream shown and the selection, on the project of the window it came from; it closes with
its project's window. File › Module manager… opens a window with two tabs. In
this project lists the projects the runtime's `list_dependencies` says the project imports, adds one
from a folder or a `.zip` with `add_dependency`, copies a newer version in with `update_dependency`,
asking before it overwrites a file edited since the copy, and opens an import to edit in its own window.
Marketplace lists the projects in the catalog at `get.tatolab.com/catalog/v1.json`; Import downloads an
entry's `.zip`, checks its SHA-256, and adds it as any other. Every window shares the one runtime. It reads
everything from the runtime's local API: each project's name from `list_assets`, `list_streams`, `logs` and `graph` over MCP, and
`GET /api/graph` for the machine's name. A project is open or closed, and an open one plays or
stops as a whole. Opening a project's window opens it with `open_project` when the runtime holds it
closed, its playback stopped. Run › Live queues `start_playback` (after `open_project` on a closed
project, and after `reload_project` while a stream of it has failed), Run › Stop queues
`stop_playback`, which keeps every graph loaded, and the removal of a whole project queues
`remove_project`, then the window shows each stream `stopping` at each step the runtime lists until
it settles. Closing a project's window closes the project with `close_project`; while it plays, the
window asks first: Stop and Close closes the project, then its window, and Cancel keeps both. New
project and Import project queue `create_project` and `open_project`, a project's Reload queues
`reload_project`, which keeps its playback (`open_project` on a closed one), and saving a node's
Python file reloads an open project the same way; the window follows each load with
`describe_stream_action` until it ends. Cancel ends an action early with `cancel_stream_action`,
on a stream the listing shows `preparing` or `stopping`, on a Reload, and on a New project or
Import project, and shows the runtime's refusal in its own words. A stream's Logs tab reads its project's log with `logs`,
narrowed to the stream or showing the whole project; a project's page lists its streams and reads
its whole log, narrowed to one stream or one action. The window frames only its core views' pages (Stream graph, Outliner, Library, Properties, History, Node visualizer, Code and Transactions): its content
security policy allows frames only from `core_views/` on its own origin, and the main window refuses any other subframe navigation. "Open project" and "Open a terminal in the project" open the folder the runtime lists for
the stream, in Finder or the file manager, and in Terminal.app or `x-terminal-emulator`.

|  | macOS | Linux |
|---|---|---|
| The runtime | `Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd`, run from the bundle as the app's child | `resources/tatolab-runtime/bin/tatolabd`, run from the package as the app's child |
| The `tatolab` command | `~/.local/bin/tatolab`, linked to the bundle's `tatolab-cli` as the app opens when nothing else holds the name | `~/.local/bin/tatolab`, linked to the package's `bin/tatolab` the same way |
| Local API socket | `/tmp/streamlib-<uid>/local-api.sock` | `$XDG_RUNTIME_DIR/streamlib/local-api.sock`, else `/tmp/streamlib-<uid>/local-api.sock` |
| Uninstall | move Tato Studio.app to the Trash, or `brew uninstall --cask tato-studio` | remove the package, or delete the AppImage |

## Updates

A packaged app checks the feed at `https://get.tatolab.com/app/` at launch and once a day, through
[electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater)'s
generic provider; "Check for Updates…", right after About Tato Studio (in the Tato Studio menu of
macOS's menu bar, in Help on Linux), in the tray, or in Settings checks at once. A newer version that installs in place downloads in the background, and a
dialog in the window says it is ready, once per version each time the app runs, with Install Update and Cancel; the same item then reads
"Restart to Update". Either installs it and reopens the app; quitting never installs it. The first time
the app opens after an update, a dialog in the window names the new version and links its release notes on GitHub
Releases. On macOS Squirrel.Mac takes the signed `.zip` when the person chooses to install it and replaces the bundle, which stops the old
runtime with the old app and starts the new bundle's; the AppImage replaces its own file; a `.deb`
only finds the newer version, and opens its download in the browser when the person chooses it,
since apt alone replaces it. The feed's manifests are
`app/latest-mac.yml` and `app/latest-linux.yml`, which point at `app/releases/<version>/`.

The runtime and the `tatolab` CLI come from [tatolab/streamlib](https://github.com/tatolab/streamlib)
(BUSL-1.1). This repository is AGPL-3.0-only, or under a commercial licence from the copyright holder (see
`LICENSE`). It holds the app itself, the packaging
that wraps streamlib's runtime unit into a signed, notarized `.app` and `.dmg`, and into the Linux
`.deb` and AppImage.

Requirements: macOS 26 (Tahoe) or later on Apple silicon; or x86_64 Linux with a systemd user
session (Ubuntu 22.04 or later, Debian 12 or later). The window runs on the Chromium Electron
bundles, so it needs no system web engine. A GNOME desktop shows the tray
item only with the AppIndicator extension, which Ubuntu ships.

## Installing

**macOS.** Open `Tato-Studio-<version>-arm64.dmg` from the
[latest release](https://github.com/tatolab/tatolab-app/releases/latest) and drag Tato Studio into
Applications, or:

```sh
brew install --cask tatolab/tap/tato-studio
```

Opening the app starts the runtime and links the `tatolab` command into `~/.local/bin`, with no
administrator password and no setup screen. A terminal whose PATH lacks `~/.local/bin` needs
`export PATH="$HOME/.local/bin:$PATH"` in `~/.zprofile`; Settings › Command line shows the line.

**Linux.** Install the app from the [latest release](https://github.com/tatolab/tatolab-app/releases/latest),
as the `.deb`:

```sh
sudo apt install ./Tato-Studio-<version>-amd64.deb
```

or as the AppImage, which needs no installing:

```sh
chmod +x Tato-Studio-<version>-x86_64.AppImage && ./Tato-Studio-<version>-x86_64.AppImage
```

Each carries the runtime. Opening the app starts it from the package and links `tatolab` into
`~/.local/bin`, asking nothing. A machine without the app installs the runtime with streamlib's
installer alone:

```sh
curl -fsSL https://get.tatolab.com/install.sh | sh
```

## Uninstalling

The app installs nothing outside itself but the `~/.local/bin/tatolab` link and its own settings,
`~/Library/Application Support/com.tatolab.tatolab` (Linux: `~/.config/com.tatolab.tatolab`). The
AppImage, whose mount goes when it quits, links `tatolab` to a copy of its CLI in
`$XDG_DATA_HOME/tato-studio/bin/` (else `~/.local/share/tato-studio/bin/`); delete that folder too.
Quit it and move Tato Studio.app to the Trash, or remove the Linux package. The runtime's state
directory, where it keeps your streams and logs (`~/Library/Application Support/Tatolab`; Linux
`$XDG_STATE_HOME/tatolab`, else `~/.local/state/tatolab`), stays. `brew uninstall --zap --cask
tato-studio` removes the state directory and the app's settings too.

## The app's platform layer

Everything that differs by platform sits in `apps/tato-app/src/main/platform/`, behind the interfaces
the rest of the main process uses: `CarriedRuntime` (the `tatolabd` the build carries, and the
environment it runs in), `startTheCarriedRuntimeAsAChildProcess` (which runs it with a raised
open-file limit and keeps its last line on stderr), `TatolabCommandLineToolLink` (the
`~/.local/bin/tatolab` link), and each platform's window chrome, Dock icon, tray image and menu.
Both platform modules expose the same items, and only `platform/` reads `process.platform`
(ESLint, `eslint.config.js`). `CarriedRuntimeRunAsTheAppsChild` keeps the runtime running from the
status rounds and stops it as the app quits. Neither platform module needs its OS to run its tests, so
`npm test` on either platform runs both. On any other OS the app refuses to start.

## macOS bundle layout

```
Tato Studio.app/Contents/
  Info.plist                                  LSUIElement, usage strings (apps/tato-app/packaging/macos/Info.plist)
  MacOS/Tatolab                               the app (Electron); its window, main process and
                                              preload in Resources/app.asar
  Frameworks/Electron Framework.framework, Frameworks/Tatolab Helper*.app
                                              Electron, and its GPU, plugin and renderer helpers
  Helpers/Tatolab Runtime.app/Contents/       the runtime, a bundle of its own (com.tatolab.runtime)
    Info.plist                                its id and the usage strings macOS credits it for
                                              (apps/tato-app/packaging/runtime-helper/Info.plist)
    MacOS/tatolabd                            the runtime (streamlib bin/tatolabd)
    MacOS/tatolab-cli                         the CLI (streamlib bin/tatolab)
    MacOS/uv                                  the uv tatolabd runs from beside itself
    MacOS/tatolab-video-poster-frame          the poster frame helper tatolabd runs from beside itself
    Frameworks/tatolab-runtime/               every Mach-O of the lend's tatolab/runtime/, same paths
    Resources/lend/                           streamlib's lib/tatolab/lend; each Mach-O is a relative
                                              symlink into Frameworks/tatolab-runtime; precompiled
                                              (unchecked-hash .pyc) for CPython 3.10-3.14
    Resources/imports/                        the core first-party module wheels, pure Python
    Resources/carried-wheels/                 the third-party wheels a new project syncs offline
    Resources/python-downloads/               the CPython archive tatolabd installs from as a uv
                                              mirror, and uv-python-downloads.json naming its sha256
    Resources/streamlib-commit                the streamlib commit the runtime was built from
```

The app runs `Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd` from inside the bundle as its
child process, and links `~/.local/bin/tatolab` to the helper's `tatolab-cli`. Replacing or
trashing the app while it runs leaves the runtime running until the app quits.

The CLI is named `tatolab-cli` inside the bundle because APFS is case-insensitive by default, so a
file called `tatolab` would overwrite `Tatolab`. Code signing only accepts code under `MacOS/` and
`Frameworks/`. The lend keeps its shape through the symlinks, so `tatolabd` finds it at
`../Resources/lend` relative to its own directory. Processor interpreters (the user's venv Python)
import `tatolab.runtime` from that lend with every `PYTHON*` variable stripped. Without the shipped
bytecode they would write `__pycache__` into the signed bundle, which breaks its seal.

The carried wheels and the CPython archive sit in `Resources/` as archives, which the bundle seals
as data. Apple's notary still opens them and refuses any Mach-O inside that isn't signed with a
Developer ID and a secure timestamp. So `build-tatolab-app.sh` passes the Developer ID to
streamlib's unit build, which signs each Mach-O inside them and names the re-signed archive's
sha256 to uv. The Python's executables carry `allow-jit`, `allow-unsigned-executable-memory` and
`disable-library-validation`, so they load the extension modules a person installs from PyPI and
run numba's compiled code. `verify-tatolab-app-bundle.sh` unpacks each archive and holds every
Mach-O inside to those rules.

Entitlements: `apps/tato-app/packaging/entitlements/tatolab-app.entitlements` (the app) and
`apps/tato-app/packaging/entitlements/tatolabd.entitlements` (the runtime) carry `device.camera` and
`device.audio-input`. The hardened runtime refuses camera and microphone access without them. The
app, `Tato Studio Helper (Renderer).app` (`apps/tato-app/packaging/entitlements/tatolab-renderer-helper.entitlements`)
and the plain `Tato Studio Helper.app`, which hosts utility processes such as the Python language
server (`apps/tato-app/packaging/entitlements/tatolab-utility-helper.entitlements`), also carry `cs.allow-jit`,
because V8 maps its code writable and executable; Electron's GPU and Plugin helpers and the CLI
carry none. The packaged app's Electron fuses turn off `RunAsNode`,
`NODE_OPTIONS` and `--inspect`, so no other process can run the signed app as plain Node and
inherit its camera grant, and turn on asar integrity and asar-only loading. Electron's own
Bluetooth and audio-capture usage strings and its `NSAllowsArbitraryLoads` exception are removed;
the app uses none of them. The main process
keeps Chromium's profile in `~/Library/Application Support/com.tatolab.tatolab` (Linux:
`~/.config/com.tatolab.tatolab`), never in the runtime's `~/Library/Application Support/Tatolab`. Neither carries `cs.disable-library-validation`: every Mach-O in the bundle is
signed by the same team, so library validation accepts the dylibs `tatolabd` loads.

## Linux packages

The `.deb` (package `tatolab`) installs the Electron app in `/usr/lib/tatolab/`, linked as
`/usr/bin/Tatolab`, with the desktop entry `/usr/share/applications/Tatolab.desktop`
(`Categories=Development;`) and its icons. Its `chrome-sandbox` is setuid root, which Chromium
needs where unprivileged user namespaces are off. `Depends` names Electron's libraries without
versions or `t64` suffixes, so one package installs on Ubuntu 22.04 and 24.04; the build fails if
the app links a library the list does not name. It recommends `curl` for the installer's command.
Its `resources/` carry streamlib's runtime unit in `tatolab-runtime/` (the release tarball's `bin/`,
`lib/` and `streamlib-commit`), whose `bin/tatolabd` the app runs as its child. The AppImage carries the same app; it has no setuid sandbox helper, so it needs unprivileged user
namespaces (on by default on Ubuntu 22.04, restricted by AppArmor on 24.04).

## Building on macOS

One command, run under Infisical so the build has the Developer ID it signs with:

```sh
infisical run -- apps/tato-app/scripts/build-tatolab-app.sh
```

Every bundle, a release and a local proof build alike, is signed with the Developer ID
Application identity from Infisical (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_RUNTIME_PROVISIONING_PROFILE`; pass `--env=<env>` to `infisical run` if they live in another
environment). The build imports it into a temporary keychain and deletes that keychain, and
restores the keychain search list, when it ends. Without it the build stops before it does
anything, naming what is missing; there is no other way to sign. Only a release is notarized.

It bundles streamlib's latest `main`. It never reads a streamlib checkout elsewhere on the machine:
it resolves `main` on github.com/tatolab/streamlib to a commit, fetches exactly that commit into
`apps/tato-app/build/streamlib` (keeping its cargo `target/` between builds), and builds the runtime unit there
(`cargo xtask build-runtime --release`). The unit records that commit in `streamlib-commit`, the
helper carries it in `Contents/Helpers/Tatolab Runtime.app/Contents/Resources/streamlib-commit`, and the app's version is the version
of the `tatolabd` it bundles, or `--app-version X.Y.Z`, which the release workflow passes. When the build finishes it checks `main` again: if `main` moved on
while it ran, the build fails and says to build again (a `--streamlib-ref` build only notes it,
and an unreachable GitHub is noted, not fatal). Then the Electron app: `npm run build` (electron-vite bundles the main process into `apps/tato-app/out/main/`,
the preload into `apps/tato-app/out/preload/` and the window into `apps/tato-app/out/renderer/`, then writes the build features, with the
tatolab-app commit the checkout is at, which Settings › About shows as `Build 22b07a1-dev`),
and `apps/tato-app/scripts/package_tatolab_electron_app.mjs`, which packs exactly those into the asar with
`@electron/packager` and flips the fuses. It assembles the bundle, signs it, builds the
branded `.dmg` and checks the result. The output is `apps/tato-app/build/Tato Studio.app`,
`apps/tato-app/build/Tato-Studio-<version>-arm64.dmg`, and the update: `apps/tato-app/build/Tato-Studio-<version>-arm64-mac.zip` and its
manifest `apps/tato-app/build/latest-mac.yml`.

| Option | |
|---|---|
| `--streamlib-ref REF` | bundle this streamlib tag or commit instead of `main`'s head; a release passes its tag |
| `--runtime-unit DIR` | use an already-built runtime unit; refused unless its `streamlib-commit` names the commit the build resolved |
| `--notarize` | notarize and staple, for a release; needs `APPLE_API_KEY_PATH`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| `--local-proof-test-root` | local proof build, below |
| `--app-update-feed-url URL` | the update feed the app checks, in place of get.tatolab.com's; only with `--local-proof-test-root` |
| `--release` | a build the release workflow makes, which About shows as `-release`; every other build is `-dev`; not with `--local-proof-test-root` |

**Local proof build** (`--local-proof-test-root`). The runtime unit is built with the
`machine-directories-under-a-test-root` feature, and the app with
`npm run build -- --local-proof-test-root`, which writes
`machineDirectoriesUnderATestRoot: true` into the build features the main process imports,
`apps/tato-app/out/main/tatolab_app_build_features.json` (`apps/tato-app/src/main/tatolab_app_build_features.json` holds the
shipping ones). The app starts the runtime with the `TATOLAB_TEST_MACHINE_ROOT` and
`TATOLAB_TEST_LOOPBACK_HTTP_PORT` of its own environment, or `/tmp/tatolab-proof` and 14446 when
they are unset, so the state directory and the socket live under that root, and its loopback HTTP
is on that test port; two proofs on one machine each set their own. The app links `tatolab` under
the root's `home/.local/bin`. Use it to prove the app on a development Mac. It is
never shipped: `assemble-tatolab-app-bundle.sh` refuses a test-root unit without the flag, and
`verify-tatolab-app-bundle.sh --shipping` fails such a bundle, whether the marker or the build
features inside the asar give it away, and fails one that checks any
update feed but get.tatolab.com's.

The individual steps are separate scripts in `apps/tato-app/scripts/`:

| Script | |
|---|---|
| `fetch-streamlib-for-the-app-build.sh <dir> [--streamlib-ref REF] [--resolve-only] [--expect-commit SHA]` | resolves streamlib's `main` (or REF) to a commit and fetches exactly that commit into `<dir>`; `--expect-commit` fails when REF has moved off SHA |
| `build-tatolab-runtime-unit.sh <streamlib> [--developer-id-application-identity ID] [--local-proof-test-root]` | builds the runtime unit in a clean streamlib checkout and records its commit in the unit's `streamlib-commit`; on macOS, `build-tatolab-app.sh` passes the Developer ID, which signs every Mach-O inside the unit's carried wheels and Python archive |
| `tatolab_app_build_features.mjs write <features.json> [--release] [--local-proof-test-root] [--app-update-feed-url URL]` | writes the build features and the build id (the commit this checkout is at, dev or release, and whether it has uncommitted changes); `npm run build -- <flags>` runs it last, and refuses outside a git checkout |
| `tatolab_app_build_features.mjs read <app.asar> [--shipping]` | prints the build features and the build id a packaged app carries, and refuses one with no build id; `--shipping` refuses the test root or any feed but get.tatolab.com's |
| `package_tatolab_electron_app.mjs <darwin\|linux> <version> <out>` | packs the built app, with the build features it was built with, and its production `node_modules` with `@electron/packager`, and flips its fuses |
| `assemble-tatolab-app-bundle.sh <Tato Studio.app> <unit> --streamlib-commit SHA [--local-proof-test-root]` | lays the unit into the packaged app; refuses a unit built from any other commit, and a unit that lacks `bin/tatolabd`, `bin/tatolab`, `bin/uv`, `bin/tatolab-video-poster-frame` or `lib/tatolab/lend`, or ships anything else in `bin/` or `lib/tatolab/` |
| `sign-tatolab-app-bundle.sh <Tato Studio.app> <identity> <runtime-provisioning-profile>` | signs inside-out (Frameworks' Mach-O, the frameworks, the helpers, tatolabd, tatolab-cli, the app) with the hardened runtime, embedding the `com.tatolab.runtime` provisioning profile in the runtime's helper; refuses any identity but a `Developer ID Application` and a profile for any other App ID |
| `make-tatolab-dmg.sh <Tato Studio.app> <out.dmg>` | branded drag-to-Applications image (dmgbuild, headless), signed with the app's own Developer ID; refuses an app signed any other way |
| `notarize-and-staple.sh <Tato Studio.app\|.dmg>` | `notarytool submit --wait`, `stapler staple`, `spctl --assess` |
| `verify-tatolab-app-bundle.sh <Tato Studio.app\|.dmg> [--shipping]` | checks the signature (every Mach-O, those inside the carried wheels and Python included, and the image signed by Tatolab's Developer ID team with the hardened runtime, never ad-hoc), layout, plists, that the bundled `tatolabd` is no newer than the app's version and names its streamlib commit, entitlements, fuses, and Gatekeeper once stapled |
| `write_tatolab_app_update_manifest.mjs <manifest.yml> <version> <file>...` | writes the update feed's manifest for those files: sizes, SHA-512s, and URLs under `releases/<version>/`, beside it in `app/` |
| `bump-homebrew-cask.sh <version> <dmg> <tap>` | writes `Casks/tato-studio.rb` from `apps/tato-app/packaging/homebrew/tato-studio.rb.template`, and the tap's `cask_renames.json` entry `tatolab` → `tato-studio` |

The installer background is `apps/tato-app/packaging/dmg/tatolab-dmg-background.svg`, rendered to the
committed `@1x`/`@2x` PNGs by `apps/tato-app/packaging/dmg/render-dmg-background.sh` (needs `rsvg-convert`; it
fetches Instrument Sans with `npm pack`).

Tools: Xcode command line tools, Rust, Node 22+ (the window and the Electron app), `uv` (`uvx` runs the pinned dmgbuild), and
whatever streamlib's runtime build needs (`brew install shaderc cmake ninja`).

## Building on Linux

On x86_64 Linux, with Node 22+, Rust, and whatever streamlib's runtime build needs:

```sh
sudo apt install dpkg-dev desktop-file-utils curl
apps/tato-app/scripts/build-tatolab-linux-app.sh
```

It fetches streamlib's `main`, or `--streamlib-ref REF`, into `apps/tato-app/build/linux-streamlib` and builds
its runtime unit there (`--runtime-unit DIR` takes one already built, when its `streamlib-commit`
names the commit the build resolved), and carries the unit in the app's `resources/`. The packages' version
is the version of the `tatolabd` they carry. It then builds and packages the Electron app as on macOS, lays out the `.deb` and builds it with
`dpkg-deb`, builds the AppImage with a pinned `appimagetool` and AppImage runtime (checksums in
the script), checks the fuses, the build features, the `.deb`'s members, sandbox helper and desktop entry, and writes `apps/tato-app/build/linux/Tato-Studio-<version>-amd64.deb`,
`apps/tato-app/build/linux/Tato-Studio-<version>-x86_64.AppImage` and the update manifest listing both,
`apps/tato-app/build/linux/latest-linux.yml`. `--app-version X.Y.Z` versions the packages in place of the carried
`tatolabd`'s; `--local-proof-test-root` builds with
`machineDirectoriesUnderATestRoot` on, so the app reads the runtime under
`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, and names both packages `-local-proof`;
`--app-update-feed-url URL`, only with it, points the app at a local update feed; `--release`, which
the release workflow passes, makes About read `-release`.

## Working on the window

The window is React with Tailwind and shadcn (base-ui). Its design system is the code: the tokens in
`packages/tato-app-view-sdk/src/design_system/styles/tokens.css`, shadcn's components, and the Tatolab components and variants in
`packages/tato-app-view-sdk/src/design_system/`. `npm run dev` runs the app unpackaged with electron-vite: the window reloads as it changes, and the
app restarts when the main process or the preload changes. It shows whatever
runtime is already running on the machine's local API socket; only a `--local-proof-test-root`
build reads a local-proof runtime's `<TATOLAB_TEST_MACHINE_ROOT>/run/local-api.sock`. An unpackaged app
carries no runtime, so it starts none and says so while no runtime answers. `node apps/tato-app/scripts/serve_the_mock_window_in_a_browser.mjs` serves the window alone, in a browser at the URL it prints, against a mock backend; a build leaves the mock
out, and packaging refuses an `apps/tato-app/out/renderer/` that carries it.

## Checks

No hosted CI runs on this repository; every gate runs on a developer's machine. Before a pull
request: `npm run lint`, `npm run build` and `npm test`, which the `local-ci-runner` agent runs and reports.
`npm test` runs both platforms' modules on any OS. A packaging change also carries a signed
`apps/tato-app/scripts/build-tatolab-app.sh` build of its branch, whose last step is
`apps/tato-app/scripts/verify-tatolab-app-bundle.sh`, and a Linux packaging change a
`apps/tato-app/scripts/build-tatolab-linux-app.sh` run on x86_64 Linux.

The build scripts read these secrets from Infisical (`infisical run -- …`). Without the Developer
ID ones the macOS build stops; notarization needs the App Store Connect key:

| Secret | |
|---|---|
| `APPLE_CERTIFICATE` | base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | its password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: … (TEAMID)` |
| `APPLE_RUNTIME_PROVISIONING_PROFILE` | base64 of the Developer ID provisioning profile for the App ID `com.tatolab.runtime`, embedded in the runtime's helper to authorize its keychain access group |
| `APPLE_API_KEY_ID` | App Store Connect API key id (notarization) |
| `APPLE_API_ISSUER` | its issuer id |
| `APPLE_API_KEY_PATH` | path to the `AuthKey_<id>.p8` (notarization) |

## How a release flows

`.github/workflows/release.yml` releases on every merge to `main`, and on every streamlib release:
streamlib's release workflow dispatches it with the new version once that release's Linux runtime is
on get.tatolab.com. A dispatch from the Actions tab releases too, or only builds with "Publish"
unticked. `apps/tato-app/scripts/plan_tatolab_app_release.mjs` takes the dispatched streamlib version, or on a
merge the one get.tatolab.com serves as `latest`, and picks the version: the bundled runtime's when
it is newer than every app shipped, otherwise the last app version's next patch, so every release is
newer than the one installed and the updaters take it. On a `macos-26` runner
`apps/tato-app/scripts/build-tatolab-app.sh --streamlib-ref vX.Y.Z --app-version <version> --release --notarize`
builds, signs, notarizes and verifies Tato Studio.app, its `.dmg` and its update; on `ubuntu-22.04`
`apps/tato-app/scripts/build-tatolab-linux-app.sh` builds the `.deb` and the AppImage around the release's Linux
runtime tarball get.tatolab.com serves, which streamlib built at the glibc floor it promises. Once both
have built, the files go to `app/releases/<version>/` on get.tatolab.com (everything the app publishes
is under `app/`; streamlib owns `packages/`, `simple/`, `releases/`, `install.sh` and `latest`), then `app/latest-mac.yml`, `app/latest-linux.yml` and
`app/tato-studio-release.json` (the app version, the streamlib version and the commit it shipped), and
the `.dmg`, `.deb` and AppImage go on this repository's `v<version>` GitHub release. The secrets
(the Developer ID, the App Store Connect key as `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER`, and the R2 keys for get.tatolab.com) come from the repository's Infisical sync.
`apps/tato-app/scripts/bump-homebrew-cask.sh` still writes `Casks/tato-studio.rb` for tatolab/homebrew-tap by hand.

A pull request runs only `.github/workflows/ci.yml`: types, lint and the unit tests.
