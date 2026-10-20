# Tatolab.app — proof gallery

Everything below was captured while building ticket tatolab/streamlib#2609. **Live** = the real app on a real runtime on a Mac. **Linux** = arm64 Ubuntu containers on that Mac (runtime stand-ins labeled — no Linux runtime ran). **Mock** = the window's frontend in a browser with realistic mock data, for states that are hard to reach live.

## The packaged Electron app: the .deb and the AppImage (Ubuntu 22.04 container; tatolabd stand-in)

Issue #24. `scripts/build-tatolab-linux-app.sh` on this branch built `Tatolab-0.45.0-amd64.deb` and
`Tatolab-0.45.0-x86_64.AppImage` on x86_64. In a clean `ubuntu:22.04` container (`docker run
--security-opt seccomp=unconfined`, so user namespaces work as on a desktop), `apt-get install
./Tatolab-0.45.0-amd64.deb` pulled every dependency from the 22.04 archive and installed
`/usr/bin/Tatolab -> ../lib/tatolab/Tatolab` with `chrome-sandbox` `-rwsr-xr-x root`. Each package
ran as an ordinary user (uid 1000), **with Chromium's sandbox on** (no `--no-sandbox`), under Xvfb
with openbox and stalonetray; the AppImage ran with `--appimage-extract-and-run` (no FUSE in the
container). **No runtime ran:** the `systemctl` stand-in and recorded local API from
[`electron-window/linux-stand-ins/`](electron-window/linux-stand-ins/) answered. Chromium's profile
went to `~/.config/com.tatolab.tatolab`, and nothing was written to `~/.config/Tatolab`.

| image | label | shows |
|---|---|---|
| ![](electron-packaging/live-linux-01-deb-installed-on-ubuntu-22.04.png) | Linux (container, .deb installed) · stand-in runtime | The installed app, started as `/usr/bin/Tatolab`: "Tatolab is running" on `linux-container-stand-in`, `main` Kept with its four nodes and three links, the logs following with three warnings, and the mark in the tray. |
| ![](electron-packaging/live-linux-02-appimage-on-ubuntu-22.04.png) | Linux (container, AppImage) · stand-in runtime | The AppImage, the same window and tray from the same recorded runtime. |

## The window on the Electron backend (macOS, unpackaged; Live (local proof))

PR #32 at 7433d46 on the owner's Mac (macOS 26.7.1), with Electron 44.9.1 unpackaged and
`machineDirectoriesUnderATestRoot` switched on in a throwaway worktree. tatolabd 0.45.6, the
test-root unit, was started by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, and a
test-pattern stream was loaded with that unit's CLI. Electron's appData was moved under /tmp with
`CFFIXED_USER_HOME`. The installed Tatolab and its agent were left alone: `launchctl print` was the
same before and after.

| image | label | shows |
|---|---|---|
| ![](electron-window/live-macos-local-proof-01-streams-graph-logs.png) | Live (local proof) | The Electron window with hidden-inset traffic lights. `jonathanf-macbook` is running, `main` is Kept from the test-root runtime, and the graph shows its four nodes and three links ("4 nodes running, 3 links wired"). The logs follow live `brightness` records. |
| ![](electron-window/live-macos-local-proof-02-settings.png) | Live (local proof) | Settings: Run Tatolab on, the command Not linked (a local-proof build links none), the version and the machine. |
| ![](electron-window/live-macos-local-proof-03-menu-bar-menu.png) | Live (local proof) | The menu bar menu under the Electron app's template icon (the installed app's icon sits beside it): "Runtime running · 1 stream" greyed, Open Tatolab, ✓ Run Tatolab, Quit Tatolab. |
| ![](electron-window/live-macos-local-proof-04-run-tatolab-refusal-not-shown.png) | Live (local proof) | Run Tatolab clicked off and then on. Unpackaged Electron has no agent plist, so registration was refused, but the window shows nothing. The refusal is only in the log: `registration_failed: The operation couldn't be completed. Unable to read plist: com.tatolab.tatolabd.plist`. The Tauri app has the same behaviour, because `set_run_tatolab` answers nothing and only the status follows. |

## The window on the Electron backend (Linux container, unbundled; tatolabd stand-in)

Issue #23 together with #18's wiring (01–06 on PR B at 445bcfe merged locally; 07–09 on main after #31): the window
reads everything through the preload's bridge and the main process's IPC handlers. Electron
44.9.1 (`--no-sandbox`, as root in the container) under Xvfb, with openbox and stalonetray. **No
runtime ran.** [`linux-stand-ins/`](electron-window/linux-stand-ins/) puts a `systemctl` stand-in
first on the PATH. Its `tatolabd.service` starts a **stand-in local API**, which answers
`/health`, `list_streams`, `logs` and `/api/graph` from the responses recorded from a real runtime
in `src-electron/test-fixtures/`, on `$XDG_RUNTIME_DIR/streamlib/local-api.sock`.

| image | label | shows |
|---|---|---|
| ![](electron-window/live-linux-01-running-graph-and-logs.png) | Linux (container, unbundled) · stand-in runtime | The Electron window in openbox, titled Tatolab, on the stand-in: machine `linux-container-stand-in`, "Tatolab is running", `main` Kept and `pattern-two` Stopped (dimmed); `main`'s graph with its four recorded nodes and links, and the log dock following the recorded records with three warnings. The Tatolab mark sits in the tray at the top right. |
| ![](electron-window/live-linux-02-settings-run-tatolab-on.png) | Linux (container, unbundled) · stand-in runtime | Settings with Run Tatolab on, naming `tatolabd.service`, the `tatolab` command Not installed (no `~/.local/bin/tatolab` in the container), and This computer `linux-container-stand-in`. |
| ![](electron-window/live-linux-03-run-tatolab-off.png) | Linux (container, unbundled) · stand-in runtime | After clicking the switch: Run Tatolab off and "Tatolab is off" in the sidebar. The app ran `systemctl --user disable --now tatolabd.service` and the stand-in runtime stopped (logged `reconciliation=unregistered`, then `runtime_state=stopped`). |
| ![](electron-window/live-linux-04-back-on-logs-following.png) | Linux (container, unbundled) · stand-in runtime | After switching it on again (`enable --now`, then `starting` → `running`): `main`'s Logs tab following the records the page read again over the bridge. |
| ![](electron-window/live-linux-05-stopped-stream.png) | Linux (container, unbundled) · stand-in runtime | `pattern-two` selected: "Stopped.", its project path, and its two terminal commands with copy buttons. |
| ![](electron-window/live-linux-06-copied-command-pasted.png) | Linux (container, unbundled) · stand-in runtime | A copy button pressed, then Ctrl+V into the log filter: "tatolab start pattern-two" arrived, so copying works with every permission check denied. |
| ![](electron-window/live-linux-07-tray-menu-running.png) | Linux (container, unbundled) · stand-in runtime | On main after #31: the tray menu open over the window, with the status line "Runtime running · 2 streams" greyed, Open Tatolab, Run Tatolab checked, and Quit Tatolab. |
| ![](electron-window/live-linux-08-tray-run-tatolab-unchecked.png) | Linux (container, unbundled) · stand-in runtime | After choosing Run Tatolab in the tray: the menu now reads "Runtime stopped" with Run Tatolab unchecked, and the window behind it shows "Tatolab is off" with Turn On Tatolab, so the tray and the window follow the same status. |
| ![](electron-window/live-linux-09-turned-on-from-the-window.png) | Linux (container, unbundled) · stand-in runtime | After Turn On Tatolab in the window: `starting` then `running`, and `main`'s graph and logs back. |

## The window in Chromium: every mock preset (Mock)

Issue #23 moves the window from Tauri's WebKit to Electron's Chromium. Each preset of the mock
backend was shot with [`shoot-mock-presets-in-chromium.mjs`](electron-window/shoot-mock-presets-in-chromium.mjs)
in Playwright's Chromium 141, the engine Electron renders the window with (Electron 44.9.1 ships
Chromium 152), against the Vite dev server: a browser page on the mock backend, not the Electron
window, its `tatolab-app://` origin or its preload. Each at 1040×700, light and dark. They render as
the WebKit shots in [Platforms and uninstall](#platforms-and-uninstall-mock-data-in-a-browser) do.

| image | label | shows |
|---|---|---|
| ![](electron-window/01-macos-running-graph-light.png) ![](electron-window/01-macos-running-graph-dark.png) | Mock (Chromium 141) | `main` (Kept) selected on `jonathanf-macbook`, "Tatolab is running", five streams with `pattern-two` Stopped and dimmed and `lobby-recorder` Failed in red with its reason; the Graph tab with four node cards and their links, and the log dock following below. |
| ![](electron-window/02-macos-running-logs-light.png) ![](electron-window/02-macos-running-logs-dark.png) | Mock (Chromium 141) | The Logs tab of `main`: timestamped records with info, a yellow warn and a red error, each with its key=value attributes, Following on. |
| ![](electron-window/03-macos-settings-light.png) ![](electron-window/03-macos-settings-dark.png) | Mock (Chromium 141) | Settings: Run Tatolab on, Login Items with Open Login Items…, the `tatolab` command at `/usr/local/bin/tatolab`, About with the version, the Mac and stream records, Quit Tatolab. |
| ![](electron-window/04-macos-approval-light.png) ![](electron-window/04-macos-approval-dark.png) | Mock (Chromium 141) | "Needs approval" in the sidebar, the page "Allow Tatolab in Login Items" with its Open Login Items… button. |
| ![](electron-window/05-macos-setup-light.png) ![](electron-window/05-macos-setup-dark.png) | Mock (Chromium 141) | "Runtime missing" in red, the page "This copy of Tatolab is missing its runtime" with what to do. |
| ![](electron-window/06-macos-uninstall-sheet-light.png) ![](electron-window/06-macos-uninstall-sheet-dark.png) | Mock (Chromium 141) | The Uninstall Tatolab? sheet over Settings: its three steps, records kept, Cancel and Uninstall. |
| ![](electron-window/07-macos-uninstalling-light.png) ![](electron-window/07-macos-uninstalling-dark.png) | Mock (Chromium 141) | The same sheet after Uninstall: "macOS asks for your password now", Cancel greyed and Uninstalling… with its spinner. |
| ![](electron-window/08-macos-unreachable-light.png) ![](electron-window/08-macos-unreachable-dark.png) | Mock (Chromium 141) | "Not responding" in red, the page "The runtime isn't responding" with Run Tatolab On, the `tatolab streams` command and "Still asking." |
| ![](electron-window/09-linux-running-overview-light.png) ![](electron-window/09-linux-running-overview-dark.png) | Mock (Chromium 141) | `jonathanf-workstation` on Linux: the Overview tab of `main` with its exposed output, four nodes, and three terminal commands with copy buttons; Ctrl key caps. |
| ![](electron-window/10-linux-settings-light.png) ![](electron-window/10-linux-settings-dark.png) | Mock (Chromium 141) | Linux Settings: Run Tatolab naming `tatolabd.service`, the command in `~/.local/bin`, records in `~/.local/state/tatolab`, Quit and Uninstall Tatolab… |
| ![](electron-window/11-linux-setup-not-found-light.png) ![](electron-window/11-linux-setup-not-found-dark.png) | Mock (Chromium 141) | "Install the Tatolab runtime": the install command, its two steps, and "Waiting for `tatolabd.service`". |
| ![](electron-window/12-linux-stopped-light.png) ![](electron-window/12-linux-stopped-dark.png) | Mock (Chromium 141) | "Tatolab is off": `tatolabd.service` stopped, with Turn On Tatolab. |
| ![](electron-window/13-linux-search-light.png) ![](electron-window/13-linux-search-dark.png) | Mock (Chromium 141) | The search palette over `main`'s graph, with "main" typed: the stream, its exposed output and a copy command. |
| ![](electron-window/14-macos-empty-light.png) ![](electron-window/14-macos-empty-dark.png) | Mock (Chromium 141) | No streams yet: the dashed `my-stream` placeholder and the "Run your first stream" guide with its three commands and the test-pattern preview. |
| ![](electron-window/15-macos-loading-light.png) ![](electron-window/15-macos-loading-dark.png) | Mock (Chromium 141) | `main` listed but not loaded: "Loading." with its spinner and the follow-logs command. |
| ![](electron-window/16-macos-node-error-light.png) ![](electron-window/16-macos-node-error-dark.png) | Mock (Chromium 141) | `main` with `displaywindow` in error: its card outlined red with "In error. The reason is in the logs.", "1 node in error" in the summary, and the red error record in the dock. |
| ![](electron-window/17-macos-starting-light.png) ![](electron-window/17-macos-starting-dark.png) | Mock (Chromium 141) | "Starting the runtime" with its spinner: "macOS is launching it." |
| ![](electron-window/18-macos-not-listed-light.png) ![](electron-window/18-macos-not-listed-dark.png) | Mock (Chromium 141) | "The runtime didn't list its streams", and "Couldn't list the streams. Asking again…" in the sidebar. |
| ![](electron-window/19-macos-logs-errors-only-light.png) ![](electron-window/19-macos-logs-errors-only-dark.png) | Mock (Chromium 141) | The Logs tab filtered to Errors: the one error record only. |
| ![](electron-window/20-macos-uninstalled-light.png) ![](electron-window/20-macos-uninstalled-dark.png) | Mock (Chromium 141) | "Tatolab is uninstalled. It quits now." over Settings, with Run Tatolab off and the command Not linked. |
| ![](electron-window/21-macos-uninstall-refused-light.png) ![](electron-window/21-macos-uninstall-refused-dark.png) | Mock (Chromium 141) | The administrator prompt cancelled: Settings scrolled to Uninstall Tatolab with "Uninstall didn't finish: the administrator prompt was cancelled, so nothing was removed" in red. |
| ![](electron-window/22-linux-uninstall-sheet-light.png) ![](electron-window/22-linux-uninstall-sheet-dark.png) | Mock (Chromium 141) | Linux's Uninstall Tatolab sheet: remove the runtime with the installer's command, then the package; records kept in `~/.local/state/tatolab`; Done. |

## Electron skeleton: lifecycle and tray (Linux container, unbundled; mock backend)

The Electron app (`npm run electron:dev`, window from Vite at `?platform=linux` on its mock
backend, since it has no Electron backend yet), run unbundled under Xvfb in a cloud x86_64 Linux
container with openbox as the window manager and stalonetray as the tray host. No runtime is
involved.

| image | label | shows |
|---|---|---|
| ![](electron-skeleton/01-linux-window-and-tray-icon.png) | Linux (container, unbundled) · Mock | The window, titled Tatolab in openbox's own title bar with no menu bar, at 1040×700 and centred, showing `jonathanf-workstation`, "Tatolab is running", five streams with `lobby-recorder` Failed, and Ctrl K / Ctrl F key caps; the coloured Tatolab mark in the tray at the top right. |
| ![](electron-skeleton/02-linux-tray-menu.png) | Linux (container, unbundled) · Mock | The tray menu open under the mark: "Starting…" greyed out, "Open Tatolab", a separator, "Quit Tatolab". |
| ![](electron-skeleton/03-linux-closed-window-hides-and-the-tray-stays.png) | Linux (container, unbundled) · Mock | After Alt+F4 on the window: no window, the mark still in the tray, and the app process still running. |
| ![](electron-skeleton/04-linux-second-launch-shows-the-same-window.png) | Linux (container, unbundled) · Mock | After a second `electron .`, which logged "Tatolab is already running; it shows its window" and exited 0: the same window back, its logs still following. |

### macOS, unpackaged Electron (`npm ci && npm run electron`, Electron's own bundle id, mock backend)

Captured on an arm64 Mac in the light system appearance; the installed Tatolab ran beside it untouched,
so a second "T" mark and a "Tatolab" Dock icon belong to it, not to the skeleton. No dark set: switching
the system appearance was not permitted in that session.

| what | label | image | shows |
|---|---|---|---|
| the window under the hidden title bar | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/05-macos-window-hidden-title-bar-light.png) | The 1040×700 window with no title bar: the traffic lights sit in the sidebar's top-left, above the `jonathanf-macbook` / "Tatolab is running" header, and the 52 pt top band holds `main Kept`, the Graph/Logs/Overview tabs and the Search ⌘K field, with the `main` graph and live logs below. The lights are **not centred on the band**: the red button spans 52–79 px (26–39.5 pt), centre 32.75 pt, against the band's centre at 26 pt (its bottom border is at 51–52 pt), so they sit ≈6.75 pt low. With `trafficLightPosition` `y: 26` the buttons' centre lands 6.75 pt below `y`, so **`y: 19`** centres them. |
| the tray mark and its menu | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/06-macos-tray-mark-and-menu-light.png) | The skeleton's "T" in the menu bar, highlighted as its menu's anchor and drawn white like the system's own items (a template image), the installed Tatolab's "T" beside it; the menu below reads Starting… (dimmed, not clickable), Open Tatolab, a separator, Quit Tatolab. |
| the menu on its own | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/07-macos-tray-menu-open-light.png) | The same three items captured as the menu's own window: Starting…, Open Tatolab, Quit Tatolab. |
| the band's search field still takes clicks | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/08-macos-band-search-takes-clicks-light.png) | A click on Search in the draggable band opened the search palette, and typing `cam` lists the `camera` stream and its two exposed outputs (`camera/camerasource/video` Private, `camera/microphonesource/audio` Public). Dragging an empty part of the same band moved the window by exactly the drag (bounds 500,34 → 400,174 for a −100, +140 drag). |
| Cmd-W: the tray stays | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/09-macos-after-cmd-w-tray-stays-light.png) | After Cmd-W the window is off screen (CGWindowList: `onscreen=false`) and the process keeps running; both "T" marks are still in the menu bar. |
| Cmd-W: the Dock icon goes | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/10-macos-after-cmd-w-dock-has-no-electron-icon-light.png) | The Dock's running apps end with OrbStack and the installed Tatolab; there is no Electron icon. |
| Open Tatolab: the window is back | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/11-macos-open-tatolab-window-back-light.png) | After Open Tatolab in the tray menu, the same window (same CGWindowID and bounds) is back in front, on the `main` graph with logs still following. |
| Open Tatolab: the Dock icon is back | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/12-macos-open-tatolab-dock-icon-back-light.png) | The Electron icon, with its running dot, is back in the Dock after OrbStack and the installed Tatolab. |
| Cmd-Q quits | Mock (macOS, unpackaged Electron) | ![](electron-skeleton/13-macos-after-cmd-q-tray-gone-light.png) | After Cmd-Q the skeleton's "T" has left the menu bar (only the installed Tatolab's remains), and no process from the run is left. |

These were shot with `trafficLightPosition` `y: 26`; the measurement above led to `y: 19` (27d0cb0), and the lights were not re-shot.

## Electron on Linux: Run Tatolab drives tatolabd.service (Linux container, unbundled; systemctl stand-in)

No window yet: the Electron main process's runtime service and Run Tatolab switch, driven through
the container's real `systemctl --user` (readback only, since no user manager runs there) and a
`systemctl` stand-in whose unit runs a stand-in runtime. Transcript and scripts:
[electron-linux-systemd/](electron-linux-systemd/README.md).

## Live: the real app in the new design, on a real runtime (installed with `brew install --cask`)

Test-pattern streams only. Driven from the CLI while the window follows: a second kept stream, an attached stream and a fourth stream at once, `tatolab stop`, then `tatolab rm` and the attached CLI ending.

Found and fixed while shooting these:
- After `brew uninstall` + reinstall, Service Management still read the agent as enabled while launchd had no job, so the app could never start the runtime. A start that finds no job now registers the agent again (proven: "registering it again" → running in ~2 s, kept streams back from the state directory the uninstall kept).
- launchd gives an agent 256 open files; with three streams the runtime hit EMFILE and its local API stopped answering. The agent plist now allows 65536 (proven: 4 streams, 373 open files, no errors), and the bundle check refuses a plist without it.

**main, kept, its graph and live logs**

![01-main.png](live-v2/01-main.png)

**a second kept stream**

![02-second-kept.png](live-v2/02-second-kept.png)

**four streams at once, one attached**

![03-four-streams-attached.png](live-v2/03-four-streams-attached.png)

**`tatolab stop pattern-two` — Stopped, dimmed**

![04-stopped.png](live-v2/04-stopped.png)

**after `tatolab rm` and the attached CLI ending**

![05-after-rm.png](live-v2/05-after-rm.png)

## Chosen design: calm-native (being built into the real app now)

Both judges — one speaking for the owner — picked **calm-native** (OrbStack-spirited): state written as words, no status dots, stopped streams dimmed, only a failure in red with its reason. Grafts from the other directions: a loaded stream lands on its graph with live logs docked below; a reserved slot for future stream actions; the failure reason on a second sidebar line; Built-in / Python on nodes. Per the owner's ruling the app reads only the stream list, graph, logs and health; watching an exposed output is a placeholder behind a feature flag, off by default. Full spec: [FINAL-SPEC.md](design-final/FINAL-SPEC.md). (Mock renders — the runner-ups' main screens are included for comparison.)

**calm-native-empty-dark**

![calm-native-empty-dark.png](design-final/calm-native-empty-dark.png)

**calm-native-graph-dark**

![calm-native-graph-dark.png](design-final/calm-native-graph-dark.png)

**calm-native-graph-light**

![calm-native-graph-light.png](design-final/calm-native-graph-light.png)

**calm-native-linux-main-light**

![calm-native-linux-main-light.png](design-final/calm-native-linux-main-light.png)

**calm-native-main-dark**

![calm-native-main-dark.png](design-final/calm-native-main-dark.png)

**calm-native-main-light**

![calm-native-main-light.png](design-final/calm-native-main-light.png)

**calm-native-settings-light**

![calm-native-settings-light.png](design-final/calm-native-settings-light.png)

**calm-native-setup-dark**

![calm-native-setup-dark.png](design-final/calm-native-setup-dark.png)

**calm-native-uninstall-dark**

![calm-native-uninstall-dark.png](design-final/calm-native-uninstall-dark.png)

**focused-split-main-dark**

![focused-split-main-dark.png](design-final/focused-split-main-dark.png)

**guided-devex-main-dark**

![guided-devex-main-dark.png](design-final/guided-devex-main-dark.png)

## Live on macOS (local-proof build, real runtime, installed with `brew install --cask` from a local tap)

**00** — The app icon — the tatolab.com mark, Big Sur style

![00-app-icon.png](screenshots/00-app-icon.png)

**01** — The branded .dmg installer window

![01-dmg-installer-window.png](screenshots/01-dmg-installer-window.png)

**02** — macOS credits the login item to "Tatolab" (SMAppService), not the tatolabd executable

![02-app-background-activity-notification.png](screenshots/02-app-background-activity-notification.png)

**03** — The tray icon in the menu bar

![03-menu-bar-tray-icon.png](screenshots/03-menu-bar-tray-icon.png)

**10** — The real window on the real runtime: the kept stream, its live graph and its live logs

![10-real-window-streams-graph-logs.png](screenshots/10-real-window-streams-graph-logs.png)

**11** — The runtime inside Tatolab.app showing the test pattern in a stream's display window

![11-runtime-display-window-test-pattern.png](screenshots/11-runtime-display-window-test-pattern.png)

**12** — `tatolab run -d --name pattern-two` — the second stream appears live

![12-live-second-stream-appears.png](screenshots/12-live-second-stream-appears.png)

**13** — `tatolab run --name attached-demo` — an attached stream appears

![13-live-attached-stream.png](screenshots/13-live-attached-stream.png)

**14** — `tatolab stop pattern-two` — the row turns Stopped

![14-live-stream-stopped.png](screenshots/14-live-stream-stopped.png)

**15** — `tatolab rm pattern-two` and the attached CLI ended — both rows leave

![15-live-after-rm-and-detach.png](screenshots/15-live-after-rm-and-detach.png)

**16** — The camera prompt names Tatolab, with our usage string (the acceptance check)

![16-camera-prompt-names-tatolab.png](screenshots/16-camera-prompt-names-tatolab.png)

**17** — The camera stream listed beside main

![17-live-camera-stream-listed.png](screenshots/17-live-camera-stream-listed.png)

## Linux (containers on the Mac; see each caption)

**linux-appimage-1-launched-enables-the-unit.png**

![linux-appimage-1-launched-enables-the-unit.png](linux/linux-appimage-1-launched-enables-the-unit.png)

**linux-appimage-2-tray-menu.png**

![linux-appimage-2-tray-menu.png](linux/linux-appimage-2-tray-menu.png)

**linux-appimage-3-clean-machine-no-system-webkit.png**

![linux-appimage-3-clean-machine-no-system-webkit.png](linux/linux-appimage-3-clean-machine-no-system-webkit.png)

**linux-appimage-4-built-on-22.04-on-24.04-systemd.png**

![linux-appimage-4-built-on-22.04-on-24.04-systemd.png](linux/linux-appimage-4-built-on-22.04-on-24.04-systemd.png)

**linux-systemd-1-no-unit-setup-screen.png**

![linux-systemd-1-no-unit-setup-screen.png](linux/linux-systemd-1-no-unit-setup-screen.png)

**linux-systemd-10-tray-menu-switch-off.png**

![linux-systemd-10-tray-menu-switch-off.png](linux/linux-systemd-10-tray-menu-switch-off.png)

**linux-systemd-11-running-stand-in-local-api.png**

![linux-systemd-11-running-stand-in-local-api.png](linux/linux-systemd-11-running-stand-in-local-api.png)

**linux-systemd-12-window-closed-app-in-tray.png**

![linux-systemd-12-window-closed-app-in-tray.png](linux/linux-systemd-12-window-closed-app-in-tray.png)

**linux-systemd-13-tray-menu-running.png**

![linux-systemd-13-tray-menu-running.png](linux/linux-systemd-13-tray-menu-running.png)

**linux-systemd-14-reopened-from-tray-ctrl-2-settings.png**

![linux-systemd-14-reopened-from-tray-ctrl-2-settings.png](linux/linux-systemd-14-reopened-from-tray-ctrl-2-settings.png)

**linux-systemd-2-unit-disabled-off-banner.png**

![linux-systemd-2-unit-disabled-off-banner.png](linux/linux-systemd-2-unit-disabled-off-banner.png)

**linux-systemd-3-turned-on-starting.png**

![linux-systemd-3-turned-on-starting.png](linux/linux-systemd-3-turned-on-starting.png)

**linux-systemd-4-enabled-unreachable.png**

![linux-systemd-4-enabled-unreachable.png](linux/linux-systemd-4-enabled-unreachable.png)

**linux-systemd-5-tray-menu.png**

![linux-systemd-5-tray-menu.png](linux/linux-systemd-5-tray-menu.png)

**linux-systemd-6-switched-off-from-the-tray.png**

![linux-systemd-6-switched-off-from-the-tray.png](linux/linux-systemd-6-switched-off-from-the-tray.png)

**linux-systemd-7-external-enable-while-switch-remembered-off.png**

![linux-systemd-7-external-enable-while-switch-remembered-off.png](linux/linux-systemd-7-external-enable-while-switch-remembered-off.png)

**linux-systemd-8-settings.png**

![linux-systemd-8-settings.png](linux/linux-systemd-8-settings.png)

**linux-systemd-9-uninstall-sheet.png**

![linux-systemd-9-uninstall-sheet.png](linux/linux-systemd-9-uninstall-sheet.png)

**linux-two-instances-two-trays.png**

![linux-two-instances-two-trays.png](linux/linux-two-instances-two-trays.png)

**linux-window.png**

![linux-window.png](linux/linux-window.png)

## Platforms and uninstall (mock data in a browser)

**01-macos-running-dark.png**

![01-macos-running-dark.png](platform-mock/01-macos-running-dark.png)

**01-macos-running-light.png**

![01-macos-running-light.png](platform-mock/01-macos-running-light.png)

**02-macos-settings-dark.png**

![02-macos-settings-dark.png](platform-mock/02-macos-settings-dark.png)

**02-macos-settings-light.png**

![02-macos-settings-light.png](platform-mock/02-macos-settings-light.png)

**03-macos-uninstall-sheet-dark.png**

![03-macos-uninstall-sheet-dark.png](platform-mock/03-macos-uninstall-sheet-dark.png)

**03-macos-uninstall-sheet-light.png**

![03-macos-uninstall-sheet-light.png](platform-mock/03-macos-uninstall-sheet-light.png)

**04-macos-uninstalling-dark.png**

![04-macos-uninstalling-dark.png](platform-mock/04-macos-uninstalling-dark.png)

**04-macos-uninstalling-light.png**

![04-macos-uninstalling-light.png](platform-mock/04-macos-uninstalling-light.png)

**05-linux-running-dark.png**

![05-linux-running-dark.png](platform-mock/05-linux-running-dark.png)

**05-linux-running-light.png**

![05-linux-running-light.png](platform-mock/05-linux-running-light.png)

**06-linux-settings-dark.png**

![06-linux-settings-dark.png](platform-mock/06-linux-settings-dark.png)

**06-linux-settings-light.png**

![06-linux-settings-light.png](platform-mock/06-linux-settings-light.png)

**07-linux-setup-not-found-dark.png**

![07-linux-setup-not-found-dark.png](platform-mock/07-linux-setup-not-found-dark.png)

**07-linux-setup-not-found-light.png**

![07-linux-setup-not-found-light.png](platform-mock/07-linux-setup-not-found-light.png)

**08-linux-off-not-registered-dark.png**

![08-linux-off-not-registered-dark.png](platform-mock/08-linux-off-not-registered-dark.png)

**08-linux-off-not-registered-light.png**

![08-linux-off-not-registered-light.png](platform-mock/08-linux-off-not-registered-light.png)

**09-linux-uninstall-sheet-dark.png**

![09-linux-uninstall-sheet-dark.png](platform-mock/09-linux-uninstall-sheet-dark.png)

**09-linux-uninstall-sheet-light.png**

![09-linux-uninstall-sheet-light.png](platform-mock/09-linux-uninstall-sheet-light.png)

**10-macos-uninstall-refused-light.png**

![10-macos-uninstall-refused-light.png](platform-mock/10-macos-uninstall-refused-light.png)

## Every window state (mock data in a browser)

**approval-light.png**

![approval-light.png](screenshots/mock-states/approval-light.png)

**empty-dark.png**

![empty-dark.png](screenshots/mock-states/empty-dark.png)

**failed-stopped-stream-selected-light.png**

![failed-stopped-stream-selected-light.png](screenshots/mock-states/failed-stopped-stream-selected-light.png)

**running-dark.png**

![running-dark.png](screenshots/mock-states/running-dark.png)

**running-log-paused-light.png**

![running-log-paused-light.png](screenshots/mock-states/running-log-paused-light.png)

**settings-light.png**

![settings-light.png](screenshots/mock-states/settings-light.png)

**setup-light.png**

![setup-light.png](screenshots/mock-states/setup-light.png)

**setup-waiting-for-administrator-dark.png**

![setup-waiting-for-administrator-dark.png](screenshots/mock-states/setup-waiting-for-administrator-dark.png)

**stopped-light.png**

![stopped-light.png](screenshots/mock-states/stopped-light.png)

**unreachable-dark.png**

![unreachable-dark.png](screenshots/mock-states/unreachable-dark.png)
