# Tatolab.app — proof gallery

Everything below was captured while building ticket tatolab/streamlib#2609. **Live** = the real app on a real runtime on a Mac. **Linux** = arm64 Ubuntu containers on that Mac (runtime stand-ins labeled — no Linux runtime ran). **Mock** = the window's frontend in a browser with realistic mock data, for states that are hard to reach live.

## In progress: three approachable design directions (being judged now)

After the owner's feedback (no green/red status dots; approachable DevEx, not a VS Code clone), three designers each took one direction. State is shown in words; only a failure gets colour. Each includes the new tap + live frame preview (select an output port to watch its frames). Two judges — one speaking for the owner — pick a winner and graft the best of the others before it's built into the real app.

### Calm native (OrbStack-spirited)

**empty-dark-1040**

![calm-native-empty-dark-1040.png](design-directions/v2/calm-native-empty-dark-1040.png)

**main-dark-1040**

![calm-native-main-dark-1040.png](design-directions/v2/calm-native-main-dark-1040.png)

**main-light-1040-linux**

![calm-native-main-light-1040-linux.png](design-directions/v2/calm-native-main-light-1040-linux.png)

**main-light-1040**

![calm-native-main-light-1040.png](design-directions/v2/calm-native-main-light-1040.png)

**settings-light-1040**

![calm-native-settings-light-1040.png](design-directions/v2/calm-native-settings-light-1040.png)

**tap-dark-1040**

![calm-native-tap-dark-1040.png](design-directions/v2/calm-native-tap-dark-1040.png)

**tap-light-1040**

![calm-native-tap-light-1040.png](design-directions/v2/calm-native-tap-light-1040.png)

### Focused split (Linear/Vercel-spirited)

**empty-dark-1040**

![focused-split-empty-dark-1040.png](design-directions/v2/focused-split-empty-dark-1040.png)

**main-dark-1040**

![focused-split-main-dark-1040.png](design-directions/v2/focused-split-main-dark-1040.png)

**main-light-1040-linux**

![focused-split-main-light-1040-linux.png](design-directions/v2/focused-split-main-light-1040-linux.png)

**main-light-1040**

![focused-split-main-light-1040.png](design-directions/v2/focused-split-main-light-1040.png)

**settings-light-1040**

![focused-split-settings-light-1040.png](design-directions/v2/focused-split-settings-light-1040.png)

**tap-dark-1040**

![focused-split-tap-dark-1040.png](design-directions/v2/focused-split-tap-dark-1040.png)

**tap-light-1040**

![focused-split-tap-light-1040.png](design-directions/v2/focused-split-tap-light-1040.png)

### Guided DevEx (next-step hints, copyable CLI)

**empty-dark-1040**

![guided-devex-empty-dark-1040.png](design-directions/v2/guided-devex-empty-dark-1040.png)

**main-dark-1040**

![guided-devex-main-dark-1040.png](design-directions/v2/guided-devex-main-dark-1040.png)

**main-light-1040-linux**

![guided-devex-main-light-1040-linux.png](design-directions/v2/guided-devex-main-light-1040-linux.png)

**main-light-1040**

![guided-devex-main-light-1040.png](design-directions/v2/guided-devex-main-light-1040.png)

**settings-light-1040**

![guided-devex-settings-light-1040.png](design-directions/v2/guided-devex-settings-light-1040.png)

**tap-dark-1040**

![guided-devex-tap-dark-1040.png](design-directions/v2/guided-devex-tap-dark-1040.png)

**tap-light-1040**

![guided-devex-tap-light-1040.png](design-directions/v2/guided-devex-tap-light-1040.png)

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
