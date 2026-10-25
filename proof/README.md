# Tatolab.app — proof gallery

Everything below was captured while building ticket tatolab/streamlib#2609. **Live** = the real app on a real runtime on a Mac. **Linux** = arm64 Ubuntu containers on that Mac (runtime stand-ins labeled — no Linux runtime ran). **Mock** = the window's frontend in a browser with realistic mock data, for states that are hard to reach live.

## The standard Electron layout (#64)

The code moved to `src/main`, `src/preload`, `src/renderer` and `src/shared`, with no change to what the app does. Frames are in [`standard-layout/`](standard-layout/).

### Live (local proof)

- **Setup:** `scripts/build-tatolab-app.sh --local-proof-test-root` built a packaged, ad-hoc-signed Tatolab.app from the new layout. It wraps streamlib v0.55.4's test-root runtime unit (ef5c8b229), built in a scratch worktree. The bundle check passed, and `app.asar` holds `dist/`, `out/main`, `out/preload`, `out/shared` and `resources/tray-*.png`. The app was opened from `build/` and driven from the keyboard. The window was captured with `screencapture -l`.
- **The owner's machine:** before the run, `owner-machine-before.txt` records no installed Tatolab.app, no `com.tatolab.tatolabd` agent and no app settings. Afterwards, Run Tatolab was turned off in the proof build, which unregistered its agent. The app was quit, and the proof's settings folder and `/tmp/tatolab-proof` were removed. `owner-machine-after.txt` matches the before record.

| what | label | image | shows |
|---|---|---|---|
| The packaged app opens | Live (local proof) | `live-local-proof/01-opened.png` | Welcome to Tatolab: the mascot, the one-line pitch, "Takes about a minute." and a focused Continue. `launchctl print` already showed the proof agent with `TATOLAB_TEST_MACHINE_ROOT => /tmp/tatolab-proof`. |
| launchd's first spawn refused | Live (local proof) | `live-local-proof/02-getting-set-up.png` | Getting set up: "Start the runtime · Starts once macOS lets it", then "Blocked by macOS · Stopped" with Try Again. launchd reported `OS_REASON_CODESIGNING` on the first spawn, the same refusal #3's run hit on handover. |
| It starts its runtime | Live (local proof) | `live-local-proof/03-runtime-running.png` | Try Again pressed: "Start the runtime · Running" with a tick, "The runtime is running." and Get Started enabled. `launchctl-proof-agent-running.txt` shows `state = running`, pid 88637, `last exit code = (never exited)`. |
| The Streams list | Live (local proof) | `live-local-proof/04-streams.png` | Streams on `jonathanf-macbook`: "Nothing loaded on jonathanf-macbook", "No streams on jonathanf-macbook yet", Create the sample stream, Run a project folder and `tatolab dev`. Status bar "Runtime running · Tatolab 0.45.0", as in #3's frame 05. The test-root CLI answered "No streams in this runtime." |
| The tray icon from `resources/` | Live (local proof) | `live-local-proof/05-tray-icon-in-the-menu-bar.png` | The menu bar's right side with the Tatolab "T" template icon leftmost among the status items. A capture after quitting shows it gone. |
| What it reads from the runtime | Live (local proof) | `live-local-proof/06-settings-runtime.png` | Settings › Runtime: "Running · tatolabd 0.55.4 · up 2m", Run Tatolab on, "Tatolab is listed under Allow in the Background", the socket `/tmp/tatolab-proof/run/local-api.sock`, Runtime logs `/tmp/tatolab-proof/state/logs`. |

### Linux (container, unbundled) · stand-in runtime

- **Setup:** [`standard-layout/run-in-an-ubuntu-container.sh`](standard-layout/run-in-an-ubuntu-container.sh) builds `git archive HEAD` in `ubuntu:22.04` (arm64) with `npm run build` and `npm run build:electron`, then runs the app unpackaged under Xvfb.
- **The runtime:** no runtime ran. The `systemctl` stand-in from `electron-window/linux-stand-ins/` starts the **stand-in local API**, which replays the responses recorded in `src/main/test-fixtures/`.
- **How it was driven:** [`shoot-the-streams-list-over-devtools.mjs`](standard-layout/shoot-the-streams-list-over-devtools.mjs) drives the app over DevTools at an emulated 1240×780 viewport.

| what | label | image | shows |
|---|---|---|---|
| The Streams list on Linux | Linux (container, unbundled) · stand-in runtime | `linux-01-streams-light.png` | Streams on `linux-container-stand-in`, "1 of 3 loaded": main Running (Always on, 4 steps), pattern-two Stopped, lobby-recorder Failed in red with "it did not re-load at the runtime's start: Invalid configuration…". Search reads "Ctrl K". Status bar "Runtime running". |
| The same, dark | Linux (container, unbundled) · stand-in runtime | `linux-02-streams-dark.png` | The same rows in the dark theme, after pressing the theme toggle. |

### Mock

`npm run dev` serves the window from `src/renderer`, with Vite's root there. Driven by Playwright with `?state=running`, there were no page errors.

| what | label | image | shows |
|---|---|---|---|
| macOS, light | Mock | `mock-01-macos-streams-light.png` | Streams on `jonathanf-macbook`, "3 of 5 loaded": main, camera and attached-demo Running, pattern-two Stopped, lobby-recorder Failed with its camera reason. |
| macOS, dark | Mock | `mock-01-macos-streams-dark.png` | The same in the dark theme. |
| Linux, light | Mock | `mock-02-linux-streams-light.png` | `?platform=linux`: `jonathanf-workstation`, "Ctrl K", and lobby-recorder's `/dev/video0: permission denied` reason. |

## First run with no administrator password, and the runtime's states in their own words (#3)

Frames are in [`first-run/`](first-run/). The earlier first-launch frames in the #36 and "Every window state" sections below show the administrator setup this change retired.

### Live (local proof)

- **Setup:** `scripts/build-tatolab-app.sh --local-proof-test-root` built a packaged, ad-hoc-signed Tatolab.app around streamlib v0.55.4's test-root runtime unit (ef5c8b229, the release carrying tatolab/streamlib#2927's loopback-port lock), built in a scratch worktree. Opened from `build/`, it registered its own launch agent with the test root's environment (`TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, loopback HTTP on 14446). The window was captured with `screencapture -l` and driven from the keyboard (Return, Tab).
- **The owner's machine:** `owner-runtime-before.txt` holds the installed app's runtime before the run: 0.55.2, running, pid 5242, no streams. The installed app was quit, and its settings files (`run-tatolab.json`, `runtime-restarted-for-app-version.json`, `stream-failure-notifications.json`) were copied aside. Afterwards those files were put back, the proof's `first-run-finished.json` and `/tmp/tatolab-proof` were removed, and `/Applications/Tatolab.app` was reopened. `owner-runtime-after.txt` shows 0.55.2 running again (pid 51143).

| what | label | image | shows |
|---|---|---|---|
| Welcome, no administrator prompt | Live (local proof) | `live-local-proof/01-welcome.png` | The mascot, "Welcome to Tatolab", "Tatolab runs your live video, audio and AI streams in a runtime in the background. This window is where you see and control it.", "Takes about a minute." and a focused Continue. No password dialog appeared. `launchctl print` already showed the proof agent, from bundle 0.45.0, registered. |
| Blocked by macOS, for real | Live (local proof) | `live-local-proof/02-getting-set-up.png` | Getting set up, its heading holding keyboard focus after Continue. "Start the runtime · Starts once macOS lets it" with an hourglass, then "Blocked by macOS · Stopped" in red, "macOS stopped the runtime from starting and won't try again by itself. Try Again hands it to macOS afresh." and Try Again. Get Started is disabled. Nothing staged this: `launchctl print` read `state = spawn scheduled`, `last exit code = 78: EX_CONFIG`, `runs = 4`, while the bundle's own `tatolabd`, run by hand under the same environment, started cleanly. |
| Try Again starts it | Live (local proof) | `live-local-proof/03-try-again-starting.png` | Try Again pressed: a single step, "Start the runtime · Starting…" with a spinner. Get Started stays disabled, and the footer says "Get Started opens once the runtime answers." |
| Ticked once it answers | Live (local proof) | `live-local-proof/04-start-the-runtime-ticked.png` | "Start the runtime · Running" with a tick, "The runtime is running." and Get Started enabled. `launchctl-proof-agent-after-try-again.txt`: `state = running`, `last exit code = (never exited)`. The test-root CLI answered `runtime 0.55.4`, and `lsof` showed `tatolabd` holding `127.0.0.1:14446`, its own port: no lock file, nothing root-owned, nothing the app created. |
| Get Started opens Streams | Live (local proof) | `live-local-proof/05-streams-after-get-started.png` | The Streams list on `jonathanf-macbook`: "No streams on jonathanf-macbook yet", Create the sample stream, Run a project folder, `tatolab dev`. Status bar "Runtime running · Tatolab 0.45.0". `first-run-finished.json` read `{"first_run_finished": true}`. `~/.local/bin/tatolab` under the test root's `home/` linked to the bundle's `tatolab-cli` with no prompt. |

Found while proving it: reopening the installed 0.55.2 app after the proof hit the same `78: EX_CONFIG`, seven runs and no spawn, on a Developer-ID-signed bundle. launchd refuses the first spawns after the agent's label passes from one bundle to another. 0.55.2 has no Try Again, so the stuck job was booted out and the app re-registered its own agent, which is the unregister, register and start that Try Again does.

### Mock

Each frame is at `first-run/mock/<name>-light.png` and `-dark.png`, from `npm run dev` driven by Playwright.

| frame | query | shows |
|---|---|---|
| `01-welcome` | `state=setup` | Welcome: the mascot, the one-line pitch, Continue. |
| `02-getting-set-up-starting` | `state=setup&setup=getting_set_up` | "Start the runtime · Starting…" with a spinner, and Get Started disabled. |
| `03-getting-set-up-ticked` | the same, 3 s later | The mock runtime came up: the step is "Running" with a tick, and Get Started is enabled. |
| `04-needs-your-approval` | `state=approval&first_run=unfinished&setup=getting_set_up` | "Start the runtime · Starts once you approve it", then "Needs your approval · Waiting for you" in amber, the line naming "turn on Tatolab under Allow in the Background", and Open Login Items…. |
| `05-blocked-by-macos` | `state=blocked&first_run=unfinished&setup=getting_set_up` | "Blocked by macOS · Stopped" with Try Again. |
| `06-didnt-start` | `state=never-answered&first_run=unfinished&setup=getting_set_up` | "Start the runtime · The runtime didn't start", "macOS started it, but it hasn't answered in 20 seconds." and Try Again. "Not responding" appears nowhere. |
| `07-streams-blocked-by-macos` | `state=blocked` | The Streams page: "Blocked by macOS", its explanation, Try Again. Status bar "Runtime blocked". |
| `08-streams-didnt-start` | `state=never-answered` | "The runtime didn't start", Try Again. Status bar "Runtime didn't start". |
| `09-streams-not-responding` | `state=unreachable` | "The runtime isn't responding": "It was answering, then stopped, and hasn't answered for over 20 seconds." Status bar "Runtime not responding". |
| `10-settings-command-line` | `state=running&page=settings&section=command-line` | `~/.local/bin/tatolab` at 0.55.2, the `export PATH="$HOME/.local/bin:$PATH"` line for `~/.zprofile`, and "Link in /usr/local/bin" with its warning that the dialog says "osascript wants to make changes", plus Link in /usr/local/bin…. |
| `11-linux-install-screen` | `platform=linux&state=setup` | Linux keeps its installer screen: "Install the Tatolab runtime", the `curl … \| sh` line, and a wait for `tatolabd.service`. |
| `12-linux-systemd-stopped-the-runtime` | `platform=linux&state=blocked` | "systemd stopped the runtime", "tatolabd.service kept failing, so systemd won't start it again by itself. Try Again starts it afresh." and Try Again. Status bar "Runtime blocked". |
| `13-step-refusal` | `state=never-answered&first_run=unfinished&register_again=refused&setup=getting_set_up&setup_step_action=register_the_runtime_again` | Try Again refused: under the step, "Couldn't start the runtime again: Service Management could not register the runtime's agent: Operation not permitted", with Try Again offered again. |
| `14-setup-not-saved-notice` | `state=setup&first_run_remember=refused&setup=get_started` | Get Started pressed, but its file couldn't be written. The Streams list opens anyway, with the notice "Setup wasn't saved": "Tatolab couldn't remember that you've set it up, so Welcome shows again next time it opens. EACCES: permission denied, open '…/first-run-finished.json'", and Dismiss. |
| `15-usr-local-bin-waiting-for-password` | `state=running&page=settings&section=command-line&link=pressed` | Link in /usr/local/bin… pressed: "Waiting for your password…" with a spinner in its place. |
| `16-usr-local-bin-linked` | the same, once the mock prompt answers | "Linked at /usr/local/bin/tatolab, so it works in every terminal.", with no button. |
| `17-usr-local-bin-cancelled` | the same with `usr_local_bin=cancel` | "tatolab wasn't linked: The password prompt was cancelled, so nothing changed." under the row, with Link in /usr/local/bin… offered again. |
| `18-uninstall-sheet` | `state=running&page=settings&sheet=uninstall` | Uninstall Tatolab?: "Stop the runtime and remove it from Login Items", "Remove the `tatolab` command — `~/.local/bin/tatolab`, and `/usr/local/bin/tatolab` if you linked it there. macOS asks for your password only for that one.", "Move Tatolab to the Trash". No lock folder, and no password unless the `/usr/local/bin` link is there. |

Not covered:
- **Pending the owner:**
  - a real Launch Constraint Violation (the exit-78 block above is real; a constraint kill is not, since one cannot be staged);
  - the real `/usr/local/bin` administrator prompt;
  - `brew install --cask` on a clean Mac.
- **The tray** (Open Login Items…, Try Again, the status lines) is proven by its tests only.
- **Linux live:** the `ubuntu-22.04` PR check is the Linux gate.

## Settings on the new design (#41): real verification, the pass/fail

Only these results count for #41. They come from the real app on a real v0.55.2 runtime, with no mock, fake or stand-in. Each is checked against what launchd or systemd, the runtime's own CLI, the socket table, the desktop's login items or its notification server report. Frames are in [`settings-live/`](settings-live/). The Mock and stand-in frames in the section below show presentation only, and none of them counts.

**macOS — Live:**
- **The app:** the signed, notarized, stapled Tatolab 0.55.2 built from this branch (Gatekeeper: "source=Notarized Developer ID"), installed as `/Applications/Tatolab.app` on the owner's Mac.
- **The runtime:** launchd ran streamlib v0.55.2's shipping runtime from the bundle. At launch the app restarted the runtime from its new bundle: pid 45344 (0.54.12) became 14893 (0.55.2).
- **How it was driven:** the window's own controls, pressed through macOS accessibility and captured with `screencapture -l`, since the packaged app turns off DevTools.

**Linux (container, real runtime from source):**
- **The runtime:** `tatolabd`, `tatolab` and `moq-relay` built from streamlib v0.55.2 for arm64 Linux, plus the lend from streamlib's own wheel, all with [`build-tatolabd-from-source.sh`](settings-linux-real/build-tatolabd-from-source.sh). It ran as streamlib's own `tatolabd.service` under real systemd (PID 1, a lingering user manager), installed in `install.sh`'s layout.
- **The desktop:** pcmanfm as the file manager and dunst as the notification server, on Xvfb.
- **The app:** this branch's app, unpackaged, driven over DevTools by [`verify-settings-on-the-real-runtime.mjs`](settings-linux-real/verify-settings-on-the-real-runtime.mjs) and the two notification scripts beside it.
- **What it is not:** the shipped x86_64 tarball. streamlib builds that on manylinux, with a Mesa driver it bundles there; this unit has no bundled driver and used the container's own Mesa (llvmpipe).

| check | macOS (Live) | Linux (real runtime from source) |
|---|---|---|
| Status names the runtime's version and uptime as the runtime reports them | **PASS**: "Running · tatolabd 0.55.2 · up less than a minute", matching `tatolab --version`'s runtime line (`01`) | **PASS** (`21`) |
| The socket shown is the one the runtime listens on | **PASS**: `lsof` shows launchd's tatolabd holding `/tmp/streamlib-501/local-api.sock`, which answers `ok` | **PASS**: `ss` shows tatolabd listening on `/run/user/1000/streamlib/local-api.sock` |
| Open logs folder opens the folder the runtime names | **PASS**: Finder's front window is `~/Library/Application Support/Tatolab/logs/`, holding 12 `tatolabd-*.jsonl` | **PASS**: pcmanfm was started as `/usr/bin/pcmanfm /home/ada/.local/state/tatolab/logs`, which holds its `tatolabd-*.jsonl` |
| Restart runtime restarts it through the service manager, and the state follows | **PASS**: launchd pid 14893 → 17828; window "up 1m" → Starting → "up less than a minute"; the runtime's uptime 1m → 0m (`04`) | **PASS**: MainPID 3785 → 4024 through `systemctl --user restart`; window "up 1m" → Starting → "up less than a minute" (`22`, `23`) |
| Run Tatolab off stops and deregisters the runtime; on brings it back | **PASS**: off — window "Stopped", `launchctl print` no longer finds the job, nothing answers, Restart and Open logs folder disabled (`05`); on — Starting → Running, the job back under Service Management | **PASS**: off — `disabled/inactive`, Restart disabled (`24`); on — `enabled/active` |
| Open Tatolab at login | **PASS** on the switch: on adds Tatolab to macOS's login items (System Events: "Elgato Wave Link, Rectangle, Tatolab", `06`), off removes it. **NOT VERIFIED:** the app actually opening at the next login, which needs a log-out | **NOT VERIFIED**: an unpackaged app does not offer it, and the Linux packages build on x86_64 only |
| A stream failing notifies in plain sentences | **PASS**: a kept sample stream, its `.venv` moved aside, then Restart runtime pressed. The runtime listed it failed ("…its interpreter …/.venv/bin/python is gone…"); the banner read "A stream couldn't start — The stream named “front-door” couldn't be started. An error occurred while launching it. Click to see why." (`07`) | **PASS**: the same failure; dunst drew "(A) A stream couldn't start — The stream named “fails-at-start” couldn't be started. An error occurred while launching it. Click to see why." (`26`) |
| Clicking it opens the stream, with the runtime's reason there | **PASS**: pressing it in Notification Center opened `fails-at-start`'s page, Failed, with the runtime's reason in its own words and Retry (`08`) | **PASS**: a real X middle-click (dunst's default action) opened its page (`28`) |
| An update check chosen from the tray notifies in plain sentences | **PASS**: Check for Updates… chosen in the menu bar against get.tatolab.com (newest 0.54.11); the app logged `checking` → `up_to_date`, and Notification Center held "Tatolab is up to date — You have the newest version." No banner was caught on screen. **NOT VERIFIED live:** the failed-update notification, which needs a real update to fail | not run |
| With the switch off, a failure doesn't notify | **PASS**: the same failure, 0 Tatolab notifications; with the switch back on, the repeat gave 1 | **PASS**: the app's notifications in dunst stayed 2 → 2 |
| Appearance: Light, Dark and System, live, and kept | **PASS**: the window's mean luminance was 254 for Light and 13 for Dark (`09`); System followed macOS Light → Dark → Light live (`10`); Dark held after Quit and reopen (`11`) | **PASS** for Dark live and kept across a reload. **NOT VERIFIED:** System following the desktop (Xvfb has no colour-scheme source) |
| Command line: the `tatolab` path and its version; `tatolab mcp` | **PASS**: `/usr/local/bin/tatolab` → the bundle's `tatolab-cli` 0.55.2 (`02`); `tatolab mcp` served the runtime's 17 tools, `describe_runtime` among them | **PASS**: `~/.local/bin/tatolab`, 0.55.2 (`25`) |
| About: both versions, the runtime's licence | **PASS**: "Version 0.55.2 · tatolabd 0.55.2", "Runtime licensed BUSL-1.1." (`03`) | **PASS**: "Version 0.45.0 · tatolabd 0.55.2" (the unpackaged app takes `package.json`'s version) |

**Found by this verification:**
- **Fixed, at the owner's word:** every notification is now plain sentences for a person, never the runtime's or the updater's words.
  - A failed stream reads "A stream couldn't start — The stream named “<name>” couldn't be started. An error occurred while launching it. Click to see why." The stream's page it opens shows the runtime's reason as the runtime wrote it.
  - A failed update reads "Tatolab couldn't update — Something went wrong while updating. Open Settings to see what happened and try again." The updater's own words are in Settings.
  - Re-verified on both platforms with the rebuilt, notarized app.
- **Seen while reinstalling, not a defect of this PR:** reinstalling a build with the same version (0.55.2 over 0.55.2) leaves the runtime running from the replaced bundle, since the app restarts it only when its version changes. The runtime then refused a helper from the newer wheel: "engine build … but its parent is engine build …". Restart runtime fixed it, moving the build id from `…6440…` to `…eb87…`. Releases always change the version.
- **Fixed:** with Run Tatolab off, the Login Items row said Tatolab was "listed under Allow in the Background" though launchd held no job. It now says Tatolab isn't listed. The rebuilt app was installed and the row re-checked.
- **Runtime behaviour, not a defect:** a kept stream is reloaded at the runtime's start from its recorded graph without recompiling `stream.py`. A broken `stream.py` therefore didn't fail it, and the app correctly notified nothing.
- **For streamlib:** `tatolab mcp` refuses an `initialize` request for `2026-07-28` as "Unsupported protocol version" while its error lists `2026-07-28` as supported. Stateless requests carrying `_meta` work.

**Restored afterwards:** on macOS, the test stream and its project were removed, Appearance set back to Light, notifications left on, Open at login left off, and macOS's appearance restored to Light. The 0.54.12 app the owner had is kept at `~/Tatolab-0.54.12-backup/Tatolab.app`.

## Settings on the new design (#41): presentation (Mock and stand-ins; not counted)

Issue #41. Every frame is in [`settings/`](settings/). The runtime's version, uptime and log folder come from its `describe_runtime` tool (streamlib#2922, v0.55.2).

**Live (local proof)** — `19`–`23`:
- **Setup:** the unpackaged app from `npm run build && npm run build:electron`, with `machineDirectoriesUnderATestRoot` switched on in the built copy only. It ran over a `tatolabd` built from streamlib v0.55.2 (ec6adf522) with `--local-proof-test-root`, run by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`. The app's home was a scratch home holding `run-tatolab.json` with Run Tatolab off, so no Service Management or `launchctl` call reached the owner's agent. It reconciled to `switch_is_off`.
- **How it was driven:** Playwright over DevTools at the window's own 1040×700 size.
- **The owner's runtime:** the owner's `com.tatolab.tatolabd` (pid 44718) had the same `launchctl print` record before and after.
- **Contract:** `src/main/test-fixtures/local-api-describe-runtime-tool-result-of-a-test-root-runtime.json` was recorded from this runtime, and the live contract test passed against it.
- **Not covered here:** Restart runtime through the real `launchctl kickstart -k`. With Run Tatolab on, it would restart the owner's runtime, so it waits for the owner. The Linux frames below show it through the service manager's stand-in.

**Linux (container, unbundled) · stand-in runtime** — `24`–`28`:
- **Setup:** [`settings-linux/run-in-an-ubuntu-container.sh`](settings-linux/run-in-an-ubuntu-container.sh) runs the unpackaged app in `ubuntu:22.04` under Xvfb.
- **The service manager:** the extended [`systemctl-stand-in`](electron-linux-systemd/systemctl-stand-in) runs `tatolabd.service`. It answers `restart`.
- **The runtime:** a stand-in, [`local-api-stand-in.mjs`](settings-linux/local-api-stand-in.mjs), answers `/health`, `/api/graph`, `list_streams` and `describe_runtime`, its uptime counted from its own start. The CLI is [`tatolab-cli-stand-in`](settings-linux/tatolab-cli-stand-in).
- **How it was driven:** shot over DevTools with [`shoot-settings-over-devtools.mjs`](settings-linux/shoot-settings-over-devtools.mjs) at an emulated 1240×780 viewport.
- **The restart:** the status words through Restart runtime read `Running · tatolabd 0.55.2 · up 1m` → `Starting` → `Running · tatolabd 0.55.2 · up less than a minute`. The stand-in received one `--user restart tatolabd.service`.

**Mock** — `01`–`18` and `29`–`31`, shot in Chrome at 1440×900 (2×) from the presets in `mock_window_preset.ts` and `mock_tatolab_backend.ts`.

| image | label | shows |
|---|---|---|
| `01-mock-general-light`, `02-mock-general-dark` | Mock | General: Open Tatolab at login off ("The runtime starts at login either way; this opens the app too."), Notifications › When a stream fails on, and Quit or uninstall with Quit Tatolab and the red Uninstall Tatolab…. |
| `03-mock-appearance-light`, `04-mock-appearance-dark` | Mock | Appearance: Theme, "Light is the default.", with Light, Dark and System; the segment chosen is the theme shown. |
| `05-mock-runtime-light`, `06-mock-runtime-dark` | Mock | Runtime on `jonathanf-macbook`: Status "Running · tatolabd 0.55.2 · up 3d 2h" with Restart runtime; Run Tatolab on; Login Items; Local API socket `/tmp/streamlib-501/local-api.sock`; Logs › Runtime logs, "What tatolabd writes." over `/Users/jonathanf/Library/Application Support/Tatolab/logs`, with Open logs folder; Stream records. |
| `07-mock-command-line-light`, `08-mock-command-line-dark` | Mock | Command line: `tatolab` at `/usr/local/bin/tatolab`, version `0.55.2`, and Coding agents with `$ tatolab mcp` and the `.mcp.json` block, each with a copy button. |
| `09-mock-about-light`, `10-mock-about-dark` | Mock | About: the mascot, "Tatolab", "Version 0.45.0 · tatolabd 0.55.2", Updates with Check for Updates…, and "Runtime licensed BUSL-1.1. © 2025 Jonathan Fontanez". |
| `11-mock-runtime-restarting-starting` | Mock | `restart=pressed`: Status "Starting", the sidebar saying streams show while the runtime runs, Open logs folder disabled, the status bar "Runtime starting". |
| `12-mock-runtime-restart-refused` | Mock | `restart=refused`: under Status, "Couldn't restart the runtime: launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error". |
| `13-mock-runtime-stopped` | Mock | `state=stopped`: Status "Stopped", Restart runtime disabled, Run Tatolab off, Open logs folder disabled. |
| `14-mock-runtime-keeps-no-own-log` | Mock | `runtime_log=none`, dark: Running with its version and uptime; Runtime logs names no folder and Open logs folder is disabled. |
| `15-mock-general-login-approval-no-notifications` | Mock | `open_at_login=approval&notifications=unsupported`: "macOS is waiting for you to allow Tatolab under Login Items." with Open Login Items…; "This desktop shows no notifications, so Tatolab can't tell you here when a stream fails." |
| `16-mock-general-not-offered-linux` | Mock | Linux, `open_at_login=not_offered`: "Only a packaged Tatolab opens at login." and no switch; the Linux quit and uninstall words. |
| `17-mock-runtime-linux-dark` | Mock | Linux Runtime: Run Tatolab naming `tatolabd.service`, no Login Items, the socket `/run/user/1000/streamlib/local-api.sock`, the log folder `/home/jonathanf/.local/state/tatolab/logs`. |
| `18-mock-command-line-unreadable` | Mock | `cli_version=unreadable`: no version beside the path, and "Its version can't be read:" with the CLI's own words. |
| `29-mock-runtime-not-responding-light`, `30-…-dark` | Mock | `state=unreachable`: Status "Not responding" in danger-text, with "It's switched on but hasn't answered for 20 seconds. macOS restarts it if it exits." |
| `31-mock-notification-click-opens-lobby-recorder` | Mock | `stream_page_requested=lobby-recorder`: a click on that stream's failure notification opens its Overview, Failed, with the runtime's reason in the banner. |
| `19-live-local-proof-runtime` | Live (local proof) | Runtime read from the real v0.55.2 runtime: "Running · tatolabd 0.55.2 · up 25m", the socket `/tmp/tatolab-proof/run/local-api.sock`, Runtime logs `/tmp/tatolab-proof/state/logs` with Open logs folder (pressed, Finder opened `/private/tmp/tatolab-proof/state/logs/`); Restart runtime disabled with Run Tatolab off. |
| `20-live-local-proof-runtime-stopped` | Live (local proof) | The test runtime stopped by hand: Status "Stopped", Open logs folder disabled, the sidebar's streams gone. |
| `21-live-local-proof-runtime-after-it-restarted` | Live (local proof) | The test runtime started again by hand, not by Restart runtime: "Running · tatolabd 0.55.2 · up less than a minute", the uptime read afresh. |
| `22-live-local-proof-about-dark` | Live (local proof) | About in dark after choosing Dark: "Version 0.45.0 · tatolabd 0.55.2"; Updates "Only a packaged Tatolab updates itself." |
| `23-live-local-proof-appearance-dark-after-relaunch` | Live (local proof) | The app quit and opened again: still dark, with Dark the chosen segment. |
| `24-linux-container-runtime` | Linux (container, unbundled) · stand-in runtime | Runtime on the container's host name: "Running · tatolabd 0.55.2 · up less than a minute", Run Tatolab naming `tatolabd.service`, the socket `/tmp/xdg-runtime/streamlib/local-api.sock`, the stand-in's log folder `/root/.local/state/tatolab/logs`. |
| `25-linux-container-runtime-restarting-starting` | Linux (container, unbundled) · stand-in runtime | Restart runtime pressed: Status "Starting", the status bar "Runtime starting". |
| `26-linux-container-runtime-after-restart-runtime` | Linux (container, unbundled) · stand-in runtime | After the restart: "Running · tatolabd 0.55.2 · up less than a minute", where a moment before it read "up 1m". |
| `27-linux-container-general` | Linux (container, unbundled) | General on Linux: "Only a packaged Tatolab opens at login." (the app is unpackaged), and "This desktop shows no notifications…", since the container has no notification server. |
| `28-linux-container-command-line` | Linux (container, unbundled) · stand-in CLI | `tatolab` at `/root/.local/bin/tatolab`, version `0.55.2` read from its `--version`, and the coding-agent config. |

## Add stream: run a project folder, or create one with `tatolab new` (#40)

Issue #40. Every frame is in [`add-stream/`](add-stream/).

**Live (local proof)** — `live-*.png`:
- **Setup:** the unpackaged app from `npm run build && npm run build:electron`, with `machineDirectoriesUnderATestRoot` switched on in the built copy only, ran over a `tatolabd` built from streamlib `main` (fbb8ee03a) with `--local-proof-test-root`. That runtime ran by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, with its relay on 4443/4445, and the app's home was the scratch `/tmp/tatolab-proof/home`.
- **The CLI:** the test unit's `tatolab` was copied beside the unpackaged Electron binary as `Contents/MacOS/tatolab-cli`, where a packaged bundle carries it. Create ran it through the app's own `bundledCommandLineToolPath`.
- **How it was driven:** Playwright over DevTools at an emulated 1440×900 viewport. The native folder dialog was answered with System Events. `uv sync` ran in a terminal.
- **The owner's runtime:** the owner's `com.tatolab.tatolabd` (pid 44718) had the same `launchctl print` record before and after. The unpackaged app's Service Management calls failed, as in #38.
- **Contract test:** the live contract test passed against this runtime with its four streams. It reads health, streams, graphs, logs and the machine name; `run_stream` is pinned by the recorded fixtures and these frames.

**Mock** — `mock-*-{light,dark}.png`, shot in Chromium at 1440×900. The presets press their buttons from script, so a step's heading shows the keyboard focus ring when the page moves focus to it.

| image | label | shows |
|---|---|---|
| `live-01-macos-run-a-project-folder-nothing-chosen` | Live (local proof) | Add stream from the sidebar: Start from with Run a project folder selected, "No folder chosen yet", Choose…, "Choose a project folder first." in the footer, and "Streams run on jonathanf-macbook." |
| `live-02-macos-project-folder-checked` | Live (local proof) | `/private/tmp/tatolab-proof/projects/lobby-heat` chosen in the native dialog: a real `tatolab new` scaffold after `uv sync`. `stream.py` reads "Stream function main()" and `.venv` reads "Python 3.12.10 · tatolab-stream 0.55.0", both Found. The name is prefilled `main`, and the footer shows the same `cd … && tatolab run -d`. |
| `live-03-macos-lobby-heat-running` | Live (local proof) | Renamed `lobby-heat`, compiled and run: "lobby-heat is running", "Always on · 4 steps", "It compiled cleanly". The runtime's preview of `jonathanf-macbook/lobby-heat/h264encoder/encoded_video` is playing. The compile output reads `run_stream /private/tmp/…/lobby-heat name=lobby-heat keep=true`, then "loaded lobby-heat as instance 7: 4 steps". The compile took under a second, so no compiling frame was caught live (`mock-04` shows it). |
| `live-04-macos-lobby-heat-always-on` | Live (local proof) | Open stream: `lobby-heat` Running, Always on, 4 steps (2 Python), its public output playing in the Overview. |
| `live-05-macos-name-hello-refused-by-the-runtime` | Live (local proof) | `hello-again` asked to load as `hello`, which the kept `hello` from another folder holds. Under the red-edged name, the runtime's words: "Stream graph error: the stream name `hello` is held by a kept stream from /private/tmp/tatolab-proof/projects/hello; load this one under another name with `--name`". "Run as hello-2" is offered, Compile and run is disabled, and the footer's terminal command carries `--name hello-2`. (Shot after `hello-3` was loaded, so the sidebar lists `hello`, `hello-3` and `lobby-heat`.) |
| `live-06-macos-run-as-hello-2` | Live (local proof) | One press of Run as `hello-2`: "hello-2 is running", with `name=hello-2` in the request line. |
| `live-07-macos-create-a-new-project-proposed` | Live (local proof) | Create a new project, proposing `/tmp/tatolab-proof/home/streams/hello` under the app's home, with `tatolab new …` and Copy, What you get, and Create. |
| `live-08-macos-tatolab-new-wrote-it-venv-missing` | Live (local proof) | After Create, the real `tatolab new` wrote the project: `stream.py` Found ("Stream function main()"), `.venv` Missing. Shown under it: `cd /tmp/tatolab-proof/home/streams/hello && uv sync`, Open a terminal here and Check again. The name is `hello`, and Compile and run is disabled, the footer reading "Sync the project's .venv with uv sync, then check again." |
| `live-09-macos-check-again-finds-the-venv` | Live (local proof) | After `uv sync` in a terminal, Check again reads `.venv` Found ("Python 3.12.10 · tatolab-stream 0.55.0"), and the footer offers `tatolab run -d --name hello` and Compile and run. |
| `live-10-macos-new-project-running-as-hello-3` | Live (local proof) | Compile and run: the runtime refused `hello`, held by the kept stream of `projects/hello`. `hello-2` was listed too, so it offered Run as `hello-3`, which loaded it. "hello-3 is running", Always on, its preview playing. `tatolab streams` then listed `hello`, `hello-2`, `hello-3` and `lobby-heat`, all `kept`. |
| `live-11-macos-new-project-running-dark` | Live (local proof) | The same done view in dark. |
| `mock-01-macos-project-folder` | Mock | `?page=add-stream&add=folder`: the folder chosen, checks Found, name `heat_map`, Always on with Dev session dim (its reason is in a tooltip). |
| `mock-02-macos-venv-missing` | Mock | `&add_folder=no-venv`: `.venv` Missing in warn-text with `uv sync`, Open a terminal here and Check again; Compile and run disabled, its reason in the footer. |
| `mock-03-macos-several-stream-functions` | Mock | `&add_folder=several`: a Stream function choice of `front_door()` and `back_door()`; the footer command names `stream.py:front_door`. |
| `mock-04-macos-compiling` | Mock | `&add=compiling`: "Compiling heat_map", the `run_stream` request line, and "waiting for the runtime's answer · 1s". Start from is dimmed, and Compiling… shows with no Cancel. |
| `mock-05-macos-running-with-warnings` | Mock | `&add=done&add_run=warning`: "2 compile warnings" in the cross-floor check's own lines, the same lines in warn-text in the compile output, the preview addressed `jonathanf-macbook/heat_map/…`, Open graph and Open stream. |
| `mock-06-macos-name-taken` | Mock | `&add=done&add_folder=taken`: the runtime's refusal of `main`, Run as `main-2`, Compile and run disabled, and the footer's command `cd /Users/jonathanf/code/main-v2 && tatolab run -d --name main-2`, cut off at this width. The section's heading holds focus, since the refused Compile and run left the page. |
| `mock-07-macos-new-project` | Mock | `&add=new`: Directory, Runs, Run mode and What you get, with Create. |
| `mock-08-macos-new-project-created` | Mock | `&add=created`: after `tatolab new`, `.venv` Missing with `uv sync`, Compile and run disabled until it is synced. |
| `mock-09-macos-create-refused` | Mock | `&add=created&add_cli=missing`: the bar "Create was refused: This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead." |
| `mock-10-macos-runtime-stopped` | Mock | `state=stopped`: Compile and run disabled, the footer reading "The runtime isn't running, so it can't compile a stream." |
| `mock-11-linux-project-folder` | Mock | `platform=linux`: Linux chrome, Ctrl K, and `/home/…` paths. |
| `mock-12-macos-run-notice-running` | Mock | `?page=add-stream&add=away&add_run=warning`: Streams opened while the run compiled. Once it answered, `heat_map` is listed Running, and a notice at the bottom right reads "heat_map is running" and, in the done view's own words in warn-text, "It compiled with 2 warnings. Read them before you rely on this stream.", with View and Dismiss. |
| `mock-13-macos-run-notice-refused` | Mock | `&add_folder=taken`: the run refused while away. The notice reads "Compile and run was refused" and the runtime's words in full in danger-text; no `main-2` is listed. |
| `mock-14-macos-run-notice-view-opens-the-result` (light) | Mock | View on the running notice: the Add stream done view of `heat_map`, with its 2 compile warnings and the compile output, and the notice gone. |

## The window as a design system built on shadcn (#51)

Issue #51. **Mock** — [`design-system/mock/`](design-system/mock/).
- **How they were shot:** `shoot-before-and-after-in-chromium.mjs`, run in Chromium 149 at 1440×900. Each preset is shot in both themes from two servers: `origin/main` served on 1421 (`-before`) and this branch on 1420 (`-after`).
- **What changes between them:**
  - The `-after` frames are composed from the design system on stock shadcn, and keep their screens' layout.
  - The window's root keeps the browser's 16 px, where `main`'s was 13 px. Every control, row and gap now takes `DESIGN.md`'s size: controls and sidebar rows 28 px where they drew 22.75, segments 24 px, table rows 32 px, icons 16 px. Text stays 13/18.
  - The window's text is set in Geist, where `main` uses Inter. Code and machine words stay in Geist Mono, from the same family.
  - The side panel opens at 320 px and can be dragged wider. Its header is the tab toolbar's 40 px, so their hairlines meet wherever the toolbar fits on one line.
  - At 1440 px that holds on Graph, and on Logs with the mock's counts, whether all steps or one step is chosen. Logs has little room to spare: counts in the hundreds or a longer step name wrap the toolbar, as a narrower window does.

| image (`-light` / `-dark`, `-before` / `-after`) | preset | shows |
|---|---|---|
| `01-macos-streams-list` | `state=running` | The Streams list: the segmented filter with counts, the filter field, row icon buttons (Open graph dimmed on stopped and failed rows), Failed in red with its reason. |
| `02-macos-overview` | `stream=main&tab=overview` | Overview: the output picker, the preview, the steps table, and the details panel's sections and key–value rows with copy buttons. |
| `03-macos-overview-failed-stream` | `stream=lobby-recorder` | The red failure banner with Retry; the preview's empty state. |
| `04-macos-graph-step-selected` | `tab=graph&step=brightnessmeter` | The Graph toolbar's icon buttons and pressed toggles; the inspector as a resizable side panel. In `-after`, the cards' 32 px heads and 24 px port rows are the heights their layout reserves for them. |
| `05-macos-graph-step-in-error` | `state=node-error&…&step=displaywindow` | The inspector's failure banner with Show errors, and the step's config as mono fields. |
| `06-macos-logs-record-selected` | `tab=logs&record=problem` | The Logs toolbar: search field with ⌘F, level control, step filter, toggles, copy and clear. Beside the details panel, `-after` fits it on one line. The step filter leads with a filter icon. Below 960 px, Load #4 drops out of view; a screen reader still reads it, and the line count's tooltip, which shows to the pointer, gives it too. |
| `07-macos-logs-step-menu-open` | `…&only_step=brightnessmeter&step_menu=open` | The step menu: Show all steps, and `brightnessmeter` ticked. With one step chosen, the toolbar still fits its one line. |
| `08-macos-logs-not-loaded` | `stream=lobby-recorder&tab=logs` | A failed stream's Logs: the empty state with the log folder, Open log folder and Retry. |
| `09-macos-inspect-raw` / `10-macos-inspect-tree` | `tab=inspect`, `&inspect=tree` | Inspect: the outline as list rows, the Raw/Tree segmented control, Copy, and the tree's disclosure rows. |
| `11-macos-remove-dialog` | `remove=pattern-two` | The removal question as a confirmation dialog, with Cancel holding focus. `-after` uses stock shadcn's backdrop, which blurs the window behind it. |
| `12-macos-streams-empty` | `state=empty` | The first-stream guide with `tatolab dev` and its Copy button. |
| `13-linux-logs-record-selected` | `platform=linux&…&record=problem` | Linux chrome: no traffic-light strip, and Ctrl F on the search field. |
| `14-macos-logs-levels-keyboard-focus` (`-after` only) | `tab=logs`, then Tab and → from the search field | The arrow key moved to Info and chose it ("11 of 13"); the focus ring is drawn at the `ring` token's full strength. |
| `15-macos-logs-details-dragged-wider` (`-after` only) | `…&record=problem`, then the separator dragged 180 px left | The details panel resized by its separator; the Logs toolbar wraps to fit the narrower work area. |
| `16-macos-logs-at-the-opening-window-size` (`-after` only) | `…&record=problem` at 1040×700, the size the window opens at | Beside the 320 px details panel the work area has about 450 px, so the Logs toolbar wraps onto two rows and its hairline sits below the panel header's. |
| `17-macos-logs-at-the-smallest-window` (`-after` only) | `…&record=problem` at 860×580, the window's smallest | The work area keeps its 300 px minimum and the details panel narrows to fit beside it. The toolbar wraps. The log rows keep their time, level and step, and the message starts beyond the work area's edge until the panel is hidden. |
| `18-macos-logs-details-hidden` (`-after` only) | `tab=logs&details=closed` at 1440×900 | With the details panel hidden the toolbar is wider than 960 px, so Load #4 shows beside the line count with its own spacing. |

## A stream's Logs on the new design, with the pointer to older records on disk (#39)

Issue #39, in two labelled sets.

**Live (local proof)** — [`stream-logs/live-macos/`](stream-logs/live-macos/). Captured on the owner's Mac (macOS 26.7.1).
- **The app:** Electron 44.9.1 ran unpackaged from this branch, with `machineDirectoriesUnderATestRoot` switched on in its built copy only, and its home under a scratch `CFFIXED_USER_HOME`. The page's viewport was set to 1440×900 through the DevTools protocol (Electron's window cannot be resized over it), shot at 2×.
- **The runtime:** the test-root `tatolabd` of streamlib main (0.55.1), built in a scratch worktree, ran by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, with its loopback HTTP on 14446 and its relays on the machine's free 4443 and 4445. No launch agent was registered; `owner-runtime-unchanged.txt` records the installed app's runtime before and after.
- **The streams**, each a `tatolab new` sample, kept:
  - `front-door`, the sample as written, its meter logging once a second;
  - `chatty-meter`, the same with the meter logging every frame, so the runtime soon holds only its newest 4096 records.
- Playwright drove the window over the DevTools protocol. `live-local-api-contract-test.txt` is the live contract test against this runtime's socket (25 passed).

| image | label | shows |
|---|---|---|
| ![](stream-logs/live-macos/01-front-door-logs-record-selected.png) | Live (local proof) | `front-door`'s Logs, `Load #1`, its records oldest first, a `brightness` record selected. Rows from the meter name the step `brightnessmeter` (its `processor_id` matched to the graph's node `id`); the H.264 encoder's and the engine's records carry no `processor_id` and read `runtime`. Warnings 360 are the encoder's own. The details give Process `own process`, Show in graph, the fields, and the record with `"host_ts": 1792781509645596000`. That is the same line the stream's JSONL segment holds (`01-front-door-selected-record-as-on-disk.jsonl`, beside `…-as-the-window-shows-it.txt`). `01-front-door-window-against-tatolab-logs.txt`: `tatolab logs --stream front-door` printed 508 records, and the window held the same 508, each agreeing in time, level and message. Read again 6 s later, the window had followed from 612 to 618 rows. |
| ![](stream-logs/live-macos/02-front-door-logs-record-selected-dark.png) | Live (local proof) | The same in dark, 632 lines by then. |
| ![](stream-logs/live-macos/03-front-door-show-in-graph.png) | Live (local proof) | Show in graph from that record: Graph opens with `brightnessmeter` selected, its card outlined, its link in blue, and the inspector on it. |
| ![](stream-logs/live-macos/04-chatty-meter-earlier-records-pointer.png) | Live (local proof) | `chatty-meter` scrolled to its top: "2,104 earlier records are in /private/tmp/proof39/projects/chatty-meter/.streamlib/logs/ Open" above the oldest record held, following off. `tatolab logs --stream chatty-meter` printed the runtime's 4096 at that moment. Open opened the folder with no refusal. `04-chatty-meter-earlier-records-on-disk.txt`, read a minute later: the window held its 5000 newest (sequences 5817 to 10816), and the pointer counted 5,816. The segment on disk held 10836 lines, every record of the load. |
| ![](stream-logs/live-macos/05-chatty-meter-stopped-logs.png) | Live (local proof) | `tatolab stop chatty-meter`: the Logs tab turns to Not loaded, with the stream's log folder and Open log folder; Graph is dimmed and the header offers Start. |

**Mock** — [`stream-logs/mock/`](stream-logs/mock/). Each frame from `npm run dev` presets in Chromium at 1440×900 (mock-08 at the default 1040×700), light and dark.

| image (light / dark) | preset | shows |
|---|---|---|
| `mock-01-macos-logs-record-selected` | `stream=main&tab=logs&record=problem` | The error record selected: the toolbar's levels with counts (Warnings amber, Errors red), Step, Load #4 and the line count; the details with its JSON record. |
| `mock-02-macos-logs-earlier-records-pointer` | `stream=camera&tab=logs&held_records=40`, scrolled to the top | "229 earlier records are in ~/streams/camera/.streamlib/logs/ Open". |
| `mock-03-macos-logs-errors-only` | `state=node-error&…&levels=errors&record=problem` | Errors chosen: the one `displaywindow` error of all the lines held ("1 of 18"), Process `runtime`. |
| `mock-04-macos-logs-failed-stream` | `stream=lobby-recorder&tab=logs` | A failed stream: Failed to load, the runtime's reason, its log folder, Open log folder and Retry. |
| `mock-05-macos-logs-stopped-stream` | `stream=pattern-two&tab=logs` | A stopped stream: Not loaded, its log folder, Open log folder. |
| `mock-06-linux-logs-record-selected` | `platform=linux&…&record=problem` | Linux chrome, Ctrl F on the search. |
| `mock-07-macos-logs-details-closed-wrapped` | `…&details=closed`, Wrap pressed | Details hidden, long lines wrapped under their message column. |
| `mock-08-macos-logs-at-the-default-window-size` | `…&record=problem`, 1040×700 | The toolbar wraps onto three lines beside the details; every control whole. |
| `mock-09-macos-logs-step-menu-one-step-chosen` | `…&only_step=brightnessmeter&step_menu=open` | The step menu open: Show all steps, `brightnessmeter` ticked with its class, `runtime` with `tatolabd`; the rows narrowed to that step. |

## A stream's Graph on the new design (#38)

Issue #38, in two labelled sets.

**Live (local proof)** — [`stream-graph/live-macos/`](stream-graph/live-macos/). Captured on the owner's Mac (macOS 26.7.1).
- **The app:** Electron 44.9.1 ran unpackaged from this branch, with `machineDirectoriesUnderATestRoot` switched on in its built copy only, and its home under `/tmp/proof38/home` (`CFFIXED_USER_HOME`). Its window opened at its default 1040×700; from image 02 on, the page's viewport was set to 1440×900 through the DevTools protocol (Electron's window cannot be resized over it), shot at 2×.
- **The runtime:** the test-root `tatolabd` of streamlib main (0.55.1), built in a scratch worktree, ran by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof` with its loopback HTTP on 14446 and its relay on the machine's free 4443 and 4445. No launch agent was registered, and the installed app's runtime kept running (pid and agent unchanged before and after).
- **The streams**, each a `tatolab new` sample (test pattern → halftone effect → H.264 exposed public, with a meter on a fan-out), kept:
  - `front-door`, the sample as written;
  - `dock-counter`, whose meter reads every frame `ordered` and sleeps 250 ms on each, so its link drops.
- Playwright drove the window over the DevTools protocol. Beside the images, `*.tatolab-graph.json` is what the unit's `tatolab graph --stream` printed a moment later, and `live-local-api-contract-test.txt` is the live contract test run against this runtime's socket (25 passed, none skipped).

| image | label | shows |
|---|---|---|
| ![](stream-graph/live-macos/01-front-door-graph.png) | Live (local proof) | `front-door`'s Graph at the default 1040×700: the canvas opens at 85% from the graph's left edge, `testpatternsource` and `halftonelenseffect` readable, the rest a pan away; the inspector sums up the stream (4 · 2 in their own process, 3 links, 1 exposed, `h264encoder/encoded_video` Public). |
| ![](stream-graph/live-macos/02-front-door-graph-wide.png) | Live (local proof) | At 1440×900 the whole graph fits: the four steps of `02-front-door-graph.tatolab-graph.json` with their declared ports and Running, `encoded_video` with the video icon its `catalog_entry.section` names and a globe for Public, and the runtime's preview page playing inside `h264encoder`'s card. |
| ![](stream-graph/live-macos/03-front-door-h264encoder-selected.png) | Live (local proof) | `h264encoder` selected: its links in blue; the inspector plays its output with the address beneath, and gives Type `tatolab.stream:H264Encoder`, Built-in, In the runtime, Config None, Exposure Public, and its counters at 0. |
| ![](stream-graph/live-macos/04-front-door-hover-exposed-output.png) | Live (local proof) | Hovering `encoded_video`: the preview opens beside the port playing the sample's bars and mascot, with `jonathanf-macbook/front-door/h264encoder/encod…`, Public and "Click the port to pin". The blue ring on `h264encoder`'s card is keyboard focus, left by the Escape that deselected it after image 03. |
| ![](stream-graph/live-macos/05-front-door-pinned-and-internal-hover.png) | Live (local proof) | `encoded_video` pinned as a floating preview over the canvas, its port name in blue; hovering the internal `halftonelenseffect/video_to_downstream` says "Internal. Expose it to this machine or publicly to preview it." with no frame. |
| ![](stream-graph/live-macos/06-dock-counter-dropping.png) | Live (local proof) | `dock-counter` with `brightnessmeter` selected: the link into it amber with "638 dropped", its card's foot "638 dropped in", and the inspector's counter `halftonelenseffect/video… dropped 638`. `06-dock-counter-dropping.tatolab-graph.json`, read a moment later, has its `dropped_bags_by_link` at 688. |
| ![](stream-graph/live-macos/07-dock-counter-dropping-dark.png) | Live (local proof) | The same in dark, the count climbed to 905. |

**Mock** — [`stream-graph/mock/`](stream-graph/mock/). Each frame from `npm run dev` presets in Chromium at 1440×900 (mock-10 at 1040×700), light and dark. Previews are the mock's stand-in drawn in the frame, not a runtime's.

| image (light / dark) | preset | shows |
|---|---|---|
| `mock-01-macos-graph` | `stream=main&tab=graph` | The four steps of `main` with their ports, the effect's exposed output playing in its card, the stream summary in the inspector. |
| `mock-02-macos-graph-step-selected` | `…&step=invertingeffect` | The selected step's links in blue; its inspector with preview, type, origin, process, config, exposure This machine and counters. |
| `mock-03-macos-graph-dropping` | `state=dropping&…&step=brightnessmeter` | The meter's link amber with its count over the cards, "dropped in" and "refused" in amber in the card feet. |
| `mock-04-macos-graph-hover-exposed-output` | `…&hover=invertingeffect.video_to_downstream` | The hover preview beside an exposed output. |
| `mock-05-macos-graph-hover-internal-output` | `…&hover=testpatternsource.video` | An internal output's hover: expose it to preview it. |
| `mock-06-macos-graph-pinned-preview` | `…&pin=invertingeffect.video_to_downstream` | A pinned floating preview. |
| `mock-07-macos-graph-previews-and-counters-off` | `state=dropping&…&previews=off&counters=off` | Both toggles off: no card previews, no counters, the dropping link neutral. |
| `mock-08-macos-graph-step-in-error` | `state=node-error&…&step=displaywindow` | A step in error: red card, the failed link red and wider with "This link failed" over the cards, and Show errors in the inspector. |
| `mock-09-linux-graph-video-and-audio` | `platform=linux&stream=camera&tab=graph&step=microphonesource` | Linux chrome; a video and an audio output, each with its kind's icon and level. |
| `mock-10-macos-graph-at-the-default-window-size` | `state=dropping&…&step=invertingeffect`, 1040×700 | The opening view at the readable 85% floor. |
| `mock-11-macos-graph-source-in-another-stream` | `stream=attached-demo&tab=graph` | `mp4writer` reading `main/invertingeffect`, a dashed, dimmed card marked Another stream. |
| `mock-12-macos-graph-keyboard-focus` | `…&focus=invertingeffect` | A card holding keyboard focus: a 3 px ring outline around it, nothing selected. |
| `mock-13-macos-graph-keyboard-focus-selected` | `…&step=invertingeffect&focus=invertingeffect` | The same card selected too: the focus outline stays over the selection's border and its links in blue. |

## A stream's Overview and Inspect on the new design (#37)

Issue #37, in three labelled sets.

**Live (local proof)** — [`stream-overview-inspect/live-macos/`](stream-overview-inspect/live-macos/). Captured on the owner's Mac (macOS 26.7.1).
- **The app:** Electron 44.9.1 ran unpackaged, with `machineDirectoriesUnderATestRoot` switched on in its built copy only, and its appData under `/tmp/proof37/home` (`CFFIXED_USER_HOME`).
- **The runtime:** the test-root `tatolabd` of streamlib main (0.55.1) ran by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, with its loopback HTTP on 14446. No launch agent was registered, and the installed app's runtime kept running.
- **The relay ports:** for this one run the test runtime's relay took the machine's free 4443 and 4445. The preview page reads the relay only at `http://127.0.0.1:4443`, so a test runtime's preview cannot play on its own test ports.
- **The streams**, each a `tatolab new` sample (test pattern → halftone effect → H.264 exposed public, with a meter on a fan-out), kept:
  - `front-door`, the sample as written;
  - `dock-counter`, whose meter takes every frame and sleeps 250 ms on each, so its link drops;
  - `test-pattern`, stopped and started from the window;
  - `lobby-recorder`, failed after its `.venv` was moved aside and the runtime restarted.
- Playwright drove the window. Each image is the window at its default 1040×700, shot at 2×, with `<image>.tatolab-streams.txt` beside it holding what the unit's `tatolab streams` or `tatolab graph --stream` printed at that moment.

| image | label | shows |
|---|---|---|
| ![](stream-overview-inspect/live-macos/02-front-door-overview-playing.png) | Live (local proof) | `front-door` opens on Overview. The runtime's preview page plays `h264encoder/encoded_video` in the window: "playing h264encoder/encoded_video" over the sample's colour bars, halftone lens and mascot. The picker shows the one public output, the address beneath is `jonathanf-macbook/front-door/h264encoder/encoded_video`, and the header reads Running · Always on. The frame's URL is `02-front-door-preview-src.txt`. |
| ![](stream-overview-inspect/live-macos/03-front-door-inspect.png) | Live (local proof) | Inspect shows `tatolab graph --stream front-door`, with an outline of stream / nodes 4 / links 3 / exposed 1 / machine. `config_checksum` keeps all its digits (6086514543335466803). `03-inspect-shown.json` (what the window shows) and `03-inspect-tatolab-graph.json` (what the CLI printed a moment later) are the same 278 lines. They differ only in the three `written_bags_by_output_port` counters, which climbed between the two reads. |
| ![](stream-overview-inspect/live-macos/04-front-door-inspect-tree.png) | Live (local proof) | The same document as a tree. |
| ![](stream-overview-inspect/live-macos/05-dock-counter-dropping.png) | Live (local proof) | `dock-counter`: "halftonelenseffect → brightnessmeter has dropped 467 messages since it was wired" in amber with Show in graph, while its preview plays. Beside it, `tatolab graph --stream dock-counter` shows the meter's `dropped_bags_by_link` climbing. |
| ![](stream-overview-inspect/live-macos/06-test-pattern-stopped-from-the-header.png) | Live (local proof) | Stop pressed in `test-pattern`'s header. The header reads Stopped, with Start; Graph and Logs are dimmed. The preview reads "Stopped, so nothing to preview" with Start stream, and the steps stay "4 as of the last load", each Not loaded. `tatolab streams` reads `stopped`. |
| ![](stream-overview-inspect/live-macos/07-test-pattern-started-from-the-preview.png) | Live (local proof) | Start stream pressed in the preview: Running again, its output playing (`kept 4`). |
| ![](stream-overview-inspect/live-macos/08-lobby-recorder-failed.png) | Live (local proof) | `lobby-recorder`: Failed in red, and the banner holds the runtime's whole reason ("`start` retried it, and it did not load: … its interpreter …/.venv/bin/python is gone; run `uv sync` in …"), with Retry. "Not loaded, so nothing to preview". The reason begins "`start` retried it" because the first proof run had already retried it. |
| ![](stream-overview-inspect/live-macos/09-lobby-recorder-retry-refused.png) | Live (local proof) | Retry from the banner: under the header, "Retry was refused:" and then the runtime's own words. |
| ![](stream-overview-inspect/live-macos/10-front-door-overview-dark.png) | Live (local proof) | `front-door`'s Overview in dark, still playing. |
| ![](stream-overview-inspect/live-macos/11-front-door-terminal-opened.png) | Live (local proof) | Terminal pressed: no refusal in the header. Terminal.app opened a window whose `zsh` runs in `/private/tmp/proof37/projects/front-door` (read with `lsof -d cwd`). Open project showed no refusal either. |

**Linux (container, unbundled)** — [`stream-overview-inspect/linux-container/`](stream-overview-inspect/linux-container/). `run-the-stream-page-in-ubuntu-22.04.sh` runs the committed tree in `ubuntu:22.04` on the Mac (arm64): Electron 44.9.1 unpackaged, under Xvfb with openbox. The images are from the tree at e769ac0. **No runtime ran.** The stand-in local API replays the recorded responses, now including the `graph` tool. No preview page is served there, so the preview frame is black.

| image | label | shows |
|---|---|---|
| ![](stream-overview-inspect/linux-container/linux-01-main-overview-light.png) | Linux (container, unbundled) · stand-in runtime | openbox's title bar, Ctrl K. `main`'s header (Running · Always on · `/root/streams/pattern`) wraps its actions under the name. The picker shows `invertingeffect video_to_downstream`, This machine, and the address `linux-container-stand-in/main/invertingeffect/video_to_downstream`. Steps 4 in pipeline order. |
| ![](stream-overview-inspect/linux-container/linux-02-main-overview-dark.png) | Linux (container, unbundled) · stand-in runtime | The same in dark. |
| ![](stream-overview-inspect/linux-container/linux-03-main-inspect-dark.png) | Linux (container, unbundled) · stand-in runtime | Inspect, dark: `tatolab graph --stream main`, with the recorded document's `config_checksum` 6086514543335466803 intact. |
| ![](stream-overview-inspect/linux-container/linux-04-main-stopped-steps-as-of-the-last-load.png) | Linux (container, unbundled) · stand-in runtime | Stop from the header: Stopped, Start stream, steps "4 as of the last load", each Not loaded. |
| ![](stream-overview-inspect/linux-container/linux-05-lobby-recorder-failed.png) | Linux (container, unbundled) · stand-in runtime | The failed `lobby-recorder` with its recorded reason in the banner. |
| ![](stream-overview-inspect/linux-container/linux-06-terminal-refused-without-x-terminal-emulator.png) | Linux (container, unbundled) · stand-in runtime | Terminal pressed on a desktop with no `x-terminal-emulator`: under the header, "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator." |
| ![](stream-overview-inspect/linux-container/linux-07-terminal-opened-with-xterm.png) | Linux (container, unbundled) · stand-in runtime | After `apt-get install xterm`, which registers it as `x-terminal-emulator`, Terminal opens an xterm whose prompt is `~/streams/lobby-recorder`, the folder the stand-in lists for the stream. `/proc/<pid>/cwd` agrees (`linux-07-terminal-opened-with-xterm.txt`). |

**Mock** — [`stream-overview-inspect/mock/`](stream-overview-inspect/mock/). Each frame from `npm run dev` presets in Chromium at 1440×900, light and dark. The preview is the mock's stand-in drawn in the frame, not a runtime's.

| image (light / dark) | preset | shows |
|---|---|---|
| `mock-01-macos-overview` | `stream=main` | The Overview: picker, preview, address, steps in pipeline order with origin, state and process, and the details panel (Instance 4, Steps 4 · 2 Python, Outputs, From the terminal). |
| `mock-02-macos-overview-dropping` | `state=dropping&stream=main` | The amber line naming `invertingeffect → brightnessmeter`, with "dropped" and "refused" counters on its steps. |
| `mock-03-macos-overview-stopped-as-of-the-last-load` | `stream=main&stream_page_action=stop_stream` | Stopped from the header: muted preview with Start stream, and the steps as of the last load. |
| `mock-04-macos-overview-failed` | `stream=lobby-recorder` | The failed banner with the reason and Retry; "Its steps show here once it is loaded." |
| `mock-05-macos-inspect-raw` | `stream=main&tab=inspect` | Inspect: outline, Raw, Copy, the command. |
| `mock-06-macos-inspect-tree` | `stream=main&tab=inspect&inspect=tree` | Inspect's tree. |
| `mock-07-linux-overview-two-outputs` | `stream=camera&platform=linux` | Linux chrome; two previewable outputs (This machine and Public) in the details. |
| `mock-08-linux-terminal-refused-light` | `stream=camera&platform=linux&terminal=missing`, then Terminal | The refusal of a desktop with no `x-terminal-emulator`, in its own words under the header. |

## The window on React, Tailwind and shadcn: the shell and the Streams list (#36)

Issue #36, at the branch's final commit, in three labelled sets. Each image is the window at its default 1040×700.

**Live (local proof)** — [`react-window/live-macos/`](react-window/live-macos/). The owner's Mac (macOS 26.7.1). Electron 44.9.1 ran unpackaged, with `machineDirectoriesUnderATestRoot` switched on in its built copy only. tatolabd 0.45.6, the test-root unit, ran by hand under `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`, so no launch agent was registered and the installed app's runtime kept running. Four test-pattern streams:
- `main` and `test-pattern`, kept;
- `lobby-recorder`, failed after its `.venv` was removed and the runtime restarted;
- `dev-session`, attached to a `tatolab run` in the background.

Playwright drove the window. Beside each image, `<image>.tatolab-streams.txt` is what the unit's `tatolab streams` printed at that moment.

| image | label | shows |
|---|---|---|
| ![](react-window/live-macos/01-streams-light.png) | Live (local proof) | The shell and the Streams list, light. "3 of 4 loaded on jonathanf-macbook". `dev-session` Running / Dev session; `lobby-recorder` Failed in red with "it did not re-load at the runtime's start:…" beneath; `main` and `test-pattern` Running / Always on, 4 steps. These match `tatolab streams`. |
| ![](react-window/live-macos/02-streams-dark.png) | Live (local proof) | The same list after the title bar's theme toggle: dark. |
| ![](react-window/live-macos/03-stopping-test-pattern.png) | Live (local proof) | Stop clicked on `test-pattern`: its row reads "Stopping…" with a spinner while the runtime answers. |
| ![](react-window/live-macos/04-test-pattern-stopped.png) | Live (local proof) | `test-pattern` Stopped (dimmed), steps "—", Start offered. `tatolab streams` reads `stopped -`. |
| ![](react-window/live-macos/05-test-pattern-started-again.png) | Live (local proof) | Start clicked: Running again with 4 steps (`kept 4`). |
| ![](react-window/live-macos/06-lobby-recorder-retry-refused.png) | Live (local proof) | Retry on `lobby-recorder`. Under its row, "Retry was refused:" then the runtime's own words: "Invalid configuration: the kept stream `lobby-recorder` was not loaded: its interpreter …/.venv/bin/python is gone; run `uv sync` in …". Its `failed_because` now begins "`start` retried it". |
| ![](react-window/live-macos/07-lobby-recorder-retried-after-uv-sync.png) | Live (local proof) | After `uv sync` in its project, Retry loads it: Running, 4 steps (`kept 4`). |
| ![](react-window/live-macos/08-dev-session-stopped-and-gone.png) | Live (local proof) | Stop on the Dev session: the runtime unloads it, its `tatolab run` exits, and its row is gone (`tatolab streams` lists three). |
| ![](react-window/live-macos/09-remove-main-asks-first.png) | Live (local proof) | Remove… on `main` asks first: "Remove main?", that the runtime unloads and forgets it, and that its project folder stays. |
| ![](react-window/live-macos/10-main-removed.png) | Live (local proof) | After Remove, `main` is gone from the list and from `tatolab streams`. |
| ![](react-window/live-macos/11-test-pattern-stream-page.png) | Live (local proof) | `test-pattern`'s row opens its page: the hosted stream view's band, graph and log dock, restyled onto the new tokens. |
| ![](react-window/live-macos/12-macos-native-window-light.png) | Live (local proof) | The real window captured with `screencapture -l`. The traffic lights sit level with the 44 px title bar, inset 8 px. |
| ![](react-window/live-macos/12-macos-native-window-dark.png) | Live (local proof) | The same, dark. |

**Live** — [`react-window/live-macos-installed/`](react-window/live-macos-installed/). This branch built with `scripts/build-tatolab-app.sh` at 0.54.12, the version of the runtime unit it bundles, built from streamlib main (v0.54.12 plus one docs commit). It was signed with the Developer ID identity the release uses, not notarized, and installed by hand over the owner's `/Applications/Tatolab.app` 0.54.11, after a zip backup. The window was driven through macOS accessibility (JavaScript for Automation pressing each control by its accessible name) and captured with `screencapture -l`, with `tatolab streams` recorded beside each image. On first launch the app restarted the bundled runtime under 0.54.12, and the launch agent stayed registered with Service Management.

| image | label | shows |
|---|---|---|
| ![](react-window/live-macos-installed/01-installed-0.54.12-streams.png) | Live | The installed, signed app on the owner's real runtime, which holds no streams. The empty state reads "No streams on jonathanf-macbook yet", the status bar reads "Runtime running" and "Tatolab 0.54.12", and the traffic lights sit level with the title bar. This matches `tatolab streams` ("No streams in this runtime."). |
| ![](react-window/live-macos-installed/02-installed-app-check-running.png) | Live | A throwaway stream, `app-check`, loaded on the real runtime. It is `tatolab new`'s sample with its public exposure deleted (`exposed: []`). Running / Always on, 4 steps. |
| ![](react-window/live-macos-installed/03-installed-app-check-stopped-from-the-window.png) | Live | Stop pressed in the installed app's window, through macOS accessibility: Stopped, "—", "None of 1 loaded". `tatolab streams` reads `stopped -`. |
| ![](react-window/live-macos-installed/04-installed-app-check-started-from-the-window.png) | Live | Start pressed: Running, 4 steps (`kept 4`). |
| ![](react-window/live-macos-installed/05-installed-remove-app-check-asks-first.png) | Live | The row's More menu, Remove…: "Remove app-check?", what the runtime does, and that its project folder stays. |
| ![](react-window/live-macos-installed/06-installed-app-check-removed-from-the-window.png) | Live | Remove confirmed: the runtime forgot it ("No streams in this runtime."), and the window is back to its empty state. |

**Linux (container, unbundled)** — [`react-window/linux-container/`](react-window/linux-container/). The recipe there runs the committed tree in `ubuntu:22.04` on the Mac (arm64): Electron 44.9.1 unpackaged, under Xvfb with openbox and stalonetray. **No runtime ran.** The `systemctl` stand-in from `electron-window/linux-stand-ins/` started the **stand-in local API**, which replays responses recorded from tatolabd 0.45.6 (`src/main/test-fixtures/`), including stop, start and remove.

| image | label | shows |
|---|---|---|
| ![](react-window/linux-container/linux-01-streams-light.png) | Linux (container, unbundled) · stand-in runtime | openbox's title bar, the stand-in machine `linux-container-stand-in`, Ctrl K in Search, the tray mark top right. `main` Running, `pattern-two` Stopped, `lobby-recorder` Failed with its reason. |
| ![](react-window/linux-container/linux-02-streams-dark.png) | Linux (container, unbundled) · stand-in runtime | The same in dark. |
| ![](react-window/linux-container/linux-03-main-stopped.png) | Linux (container, unbundled) · stand-in runtime | Stop on `main`: Stopped, "None of 3 loaded". |
| ![](react-window/linux-container/linux-04-pattern-two-started-lobby-recorder-retry-refused.png) | Linux (container, unbundled) · stand-in runtime | Start on `pattern-two` (Running, 4 steps), and Retry on `lobby-recorder`, refused in the recorded words under "Retry was refused:". |

**Mock** — [`react-window/mock/`](react-window/mock/). Every screen, each in light and dark, from `npm run dev` presets in Chromium.

| image (light / dark) | preset | shows |
|---|---|---|
| `mock-01-macos-streams` | `state=running` | The list with each state: Running, Dev session, Stopped, Failed. |
| `mock-02-macos-no-streams-yet` | `state=empty` | The empty state: Tato, "No streams on jonathanf-macbook yet", the two Add stream choices, `tatolab dev` with Copy. |
| `mock-03-macos-a-stream-starting` | `state=loading` | `main` Starting with a spinner, steps "—". |
| `mock-04-macos-retry-refused` | `stream_action=start_stream:lobby-recorder` | A refused Retry, in the runtime's words under its row. |
| `mock-05-macos-stop-not-recorded` | `stop_not_recorded=camera&stream_action=stop_stream:camera` | A stop the runtime could not record: `camera` Stopped, with "Stopped, but not recorded, so it loads again when the runtime restarts:" in warn-text, then the runtime's reason. |
| `mock-06-macos-remove-asks-first` | `remove=pattern-two` | The Remove confirmation. |
| `mock-07-macos-stream-graph-and-logs` | `stream=main` | A stream's page, hosted: graph and logs. |
| `mock-08-macos-settings` | `page=settings` | Settings, hosted: the page #41 retired (see its section). |
| `mock-09-macos-add-stream-guide` | `page=add-stream` | What every Add stream control opens until #40: the first-stream guide. |
| `mock-10-macos-runtime-off` | `state=stopped` | Tatolab is off; the status bar reads "Runtime stopped". |
| `mock-11-macos-first-launch-setup` | `state=setup` | First-launch setup fills the window. |
| `mock-12-macos-search` | `search=main` | ⌘K Search over the list. |
| `mock-13-macos-uninstall-sheet` | `sheet=uninstall` | The uninstall sheet over Settings. |
| `mock-14-macos-runtime-not-responding` | `state=unreachable` | The runtime not responding; the status bar reads "Runtime not responding" in danger-text. |
| `mock-15-linux-streams` | `platform=linux` | Linux chrome: no traffic-light strip, Ctrl K. |
| `mock-16-linux-install-the-runtime` | `platform=linux&state=setup` | The Linux installer page. |

## Updating the app from a local feed (Linux container; tatolabd stand-in)

Issue #25. `scripts/build-tatolab-linux-app.sh --local-proof-test-root --app-update-feed-url
http://127.0.0.1:8765/app/` built 0.46.0, whose AppImage, `.deb` and `latest-linux.yml` were laid
out as the feed lays them (`app/latest-linux.yml`, `releases/0.46.0/`) and served by
`python3 -m http.server` on 127.0.0.1; then the same build at 0.45.0. The 0.45.0 AppImage ran as an
ordinary user under Xvfb with openbox and stalonetray, with `APPIMAGE_EXTRACT_AND_RUN=1` (no FUSE in
the container), a `systemctl` stand-in answering `enabled`, and the recorded local API from
[`electron-window/linux-stand-ins/`](electron-window/linux-stand-ins/) on
`/tmp/tatolab-proof/run/local-api.sock`. **No runtime ran.** The first attempt failed in
electron-updater's words, `ENOENT … resources/app-update.yml`, shown under the Updates row while
0.45.0 kept running; the package script now writes that file, and both versions were rebuilt.

| image | label | shows |
|---|---|---|
| ![](app-updates/linux-01-appimage-0.45.0-finds-0.46.0.png) | Linux (container, AppImage) · stand-in runtime | 0.45.0 checked the feed at launch on its own: Settings reads "Tatolab 0.46.0 is available." with "Install and Relaunch"; nothing downloaded. |
| ![](app-updates/linux-02-tray-install-item.png) | Linux (container, AppImage) · stand-in runtime | The tray menu offers "Install Tatolab 0.46.0…" between Run Tatolab and Quit (shot on the first attempt's build, whose menu is the same). |
| ![](app-updates/linux-03-downloading.png) | Linux (container, AppImage) · stand-in runtime | After "Install and Relaunch": "Downloading Tatolab 0.46.0… 0%", the button disabled. The log read `downloading`, then `installing`. |
| ![](app-updates/linux-04-reopened-as-0.46.0-up-to-date.png) | Linux (container, AppImage) · stand-in runtime | electron-updater replaced `Tatolab-0.45.0-local-proof-x86_64.AppImage` with `Tatolab-0.46.0-local-proof-x86_64.AppImage` and reopened it: Version "Tatolab 0.46.0", "Tatolab is up to date." |
| ![](app-updates/linux-05-deb-open-download.png) | Linux (container, the .deb's app) · stand-in runtime | The same 0.45.0 build run outside an AppImage, as the `.deb` installs it: "Its download opens in your browser." with "Open Download"; choosing it opened `http://127.0.0.1:8765/releases/0.46.0/Tatolab-0.46.0-local-proof-amd64.deb` (an `xdg-open` stand-in recorded the URL). |

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
| ![](electron-window/live-macos-local-proof-02-settings.png) | Live (local proof) | Settings: Run Tatolab on, the command Not linked (a local-proof build links none), the version and the machine. The page #41 retired. |
| ![](electron-window/live-macos-local-proof-03-menu-bar-menu.png) | Live (local proof) | The menu bar menu under the Electron app's template icon (the installed app's icon sits beside it): "Runtime running · 1 stream" greyed, Open Tatolab, ✓ Run Tatolab, Quit Tatolab. |
| ![](electron-window/live-macos-local-proof-04-run-tatolab-refusal-not-shown.png) | Live (local proof) | Run Tatolab clicked off and then on. Unpackaged Electron has no agent plist, so registration was refused, but the window shows nothing. The refusal is only in the log: `registration_failed: The operation couldn't be completed. Unable to read plist: com.tatolab.tatolabd.plist`. The Tauri app has the same behaviour, because `set_run_tatolab` answers nothing and only the status follows. |

## The window on the Electron backend (Linux container, unbundled; tatolabd stand-in)

Issue #23 together with #18's wiring (01–06 on PR B at 445bcfe merged locally; 07–09 on main after #31): the window
reads everything through the preload's bridge and the main process's IPC handlers. Electron
44.9.1 (`--no-sandbox`, as root in the container) under Xvfb, with openbox and stalonetray. **No
runtime ran.** [`linux-stand-ins/`](electron-window/linux-stand-ins/) puts a `systemctl` stand-in
first on the PATH. Its `tatolabd.service` starts a **stand-in local API**, which answers
`/health`, `list_streams`, `logs` and `/api/graph` from the responses recorded from a real runtime
in `src/main/test-fixtures/`, on `$XDG_RUNTIME_DIR/streamlib/local-api.sock`.

| image | label | shows |
|---|---|---|
| ![](electron-window/live-linux-01-running-graph-and-logs.png) | Linux (container, unbundled) · stand-in runtime | The Electron window in openbox, titled Tatolab, on the stand-in: machine `linux-container-stand-in`, "Tatolab is running", `main` Kept and `pattern-two` Stopped (dimmed); `main`'s graph with its four recorded nodes and links, and the log dock following the recorded records with three warnings. The Tatolab mark sits in the tray at the top right. |
| ![](electron-window/live-linux-02-settings-run-tatolab-on.png) | Linux (container, unbundled) · stand-in runtime | Settings with Run Tatolab on, naming `tatolabd.service`, the `tatolab` command Not installed (no `~/.local/bin/tatolab` in the container), and This computer `linux-container-stand-in`. The page #41 retired. |
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
| ![](electron-window/03-macos-settings-light.png) ![](electron-window/03-macos-settings-dark.png) | Mock (Chromium 141) | Settings: Run Tatolab on, Login Items with Open Login Items…, the `tatolab` command at `/usr/local/bin/tatolab`, About with the version, the Mac and stream records, Quit Tatolab. The page #41 retired. |
| ![](electron-window/04-macos-approval-light.png) ![](electron-window/04-macos-approval-dark.png) | Mock (Chromium 141) | "Needs approval" in the sidebar, the page "Allow Tatolab in Login Items" with its Open Login Items… button. |
| ![](electron-window/05-macos-setup-light.png) ![](electron-window/05-macos-setup-dark.png) | Mock (Chromium 141) | "Runtime missing" in red, the page "This copy of Tatolab is missing its runtime" with what to do. |
| ![](electron-window/06-macos-uninstall-sheet-light.png) ![](electron-window/06-macos-uninstall-sheet-dark.png) | Mock (Chromium 141) | The Uninstall Tatolab? sheet over Settings: its three steps, records kept, Cancel and Uninstall. |
| ![](electron-window/07-macos-uninstalling-light.png) ![](electron-window/07-macos-uninstalling-dark.png) | Mock (Chromium 141) | The same sheet after Uninstall: "macOS asks for your password now", Cancel greyed and Uninstalling… with its spinner. |
| ![](electron-window/08-macos-unreachable-light.png) ![](electron-window/08-macos-unreachable-dark.png) | Mock (Chromium 141) | "Not responding" in red, the page "The runtime isn't responding" with Run Tatolab On, the `tatolab streams` command and "Still asking." |
| ![](electron-window/09-linux-running-overview-light.png) ![](electron-window/09-linux-running-overview-dark.png) | Mock (Chromium 141) | `jonathanf-workstation` on Linux: the Overview tab of `main` with its exposed output, four nodes, and three terminal commands with copy buttons; Ctrl key caps. |
| ![](electron-window/10-linux-settings-light.png) ![](electron-window/10-linux-settings-dark.png) | Mock (Chromium 141) | Linux Settings: Run Tatolab naming `tatolabd.service`, the command in `~/.local/bin`, records in `~/.local/state/tatolab`, Quit and Uninstall Tatolab… The page #41 retired. |
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

## The calm-native design, chosen 2026-10-12 (Mock)

Both judges — one speaking for the owner — picked **calm-native** (OrbStack-spirited): state written as words, no status dots, stopped streams dimmed, only a failure in red with its reason. Grafts from the other directions: a loaded stream lands on its graph with live logs docked below; a reserved slot for future stream actions; the failure reason on a second sidebar line; Built-in / Python on nodes. Per the owner's ruling the app reads only the stream list, graph, logs and health; watching an exposed output is a placeholder behind a feature flag, off by default. (Mock renders — the runner-ups' main screens are included for comparison.)

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
