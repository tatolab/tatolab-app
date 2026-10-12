# Tatolab.app — proof gallery

Everything below was captured while building ticket tatolab/streamlib#2609. **Live** = the real app on a real runtime on a Mac. **Linux** = arm64 Ubuntu containers on that Mac (runtime stand-ins labeled — no Linux runtime ran). **Mock** = the window's frontend in a browser with realistic mock data, for states that are hard to reach live.

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
