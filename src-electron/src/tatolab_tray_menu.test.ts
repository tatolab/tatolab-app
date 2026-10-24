// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import type { MachineSetupState, TatolabAppUpdateState, TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import {
  appUpdateTrayMenuItemPresentation,
  setUpTatolabMenuItemPresentation,
  TatolabTrayMenu,
  type TrayMenuChoice,
  type TrayMenuItemDescription,
  type TrayMenuItemId,
} from "./tatolab_tray_menu.js";

test("set_up_tatolab_shows_only_while_machine_setup_is_missing_and_waits_while_the_prompt_shows", () => {
  expect(setUpTatolabMenuItemPresentation("complete")).toBe("hidden");
  expect(setUpTatolabMenuItemPresentation("needs_administrator")).toBe("shown_enabled");
  expect(setUpTatolabMenuItemPresentation("waiting_for_administrator")).toBe("shown_disabled");
});

function buildTrayMenuOnAFakeTrayIconHost() {
  const shownMenus: (readonly TrayMenuItemDescription[])[] = [];
  const trayMenuChoices: TrayMenuChoice[] = [];
  let clickTrayMenuItem: (trayMenuItemId: TrayMenuItemId) => void = () => {};
  let trayIconTooltip = "";
  const tatolabTrayMenu = TatolabTrayMenu.build(
    {
      createTrayIcon(_trayIconImage, tooltip, onMenuItemClicked) {
        trayIconTooltip = tooltip;
        clickTrayMenuItem = onMenuItemClicked;
        return { showMenu: (trayMenuItems) => shownMenus.push(trayMenuItems) };
      },
    },
    { pngFileName: "tray-coloured.png", isATemplate: false },
    true,
    (trayMenuChoice) => trayMenuChoices.push(trayMenuChoice),
  );
  return { tatolabTrayMenu, shownMenus, trayMenuChoices, clickTrayMenuItem, trayIconTooltip };
}

function statusWith(
  runTatolab: boolean,
  machineSetupState: MachineSetupState,
  appUpdate: TatolabAppUpdateState = { kind: "not_offered", reason: "Only a packaged Tatolab updates itself." },
): TatolabStatus {
  return {
    app_version: "0.45.0",
    platform: "macos",
    run_tatolab: runTatolab,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: null,
    streams: [],
    machine_setup_state: machineSetupState,
    command_line_tool_linked_at: null,
    app_update: appUpdate,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
  };
}

test("the tray menu is the status line, Open Tatolab, the Run Tatolab check and Quit Tatolab", () => {
  const { shownMenus, trayIconTooltip } = buildTrayMenuOnAFakeTrayIconHost();
  expect(trayIconTooltip).toBe("Tatolab");
  expect(shownMenus).toEqual([
    [
      { kind: "item", id: "tray_status_line", label: "Starting…", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
  ]);
});

test("each status shows in the status line and the check, with Set Up Tatolab… after the check while setup is missing", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith(false, "needs_administrator"));
  tatolabTrayMenu.showStatus(statusWith(false, "waiting_for_administrator"));
  tatolabTrayMenu.showStatus(statusWith(true, "complete"));
  expect(shownMenus.slice(1)).toEqual([
    [
      { kind: "item", id: "tray_status_line", label: "Setup unfinished", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: false },
      { kind: "item", id: "set_up_tatolab", label: "Set Up Tatolab…", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
    [
      { kind: "item", id: "tray_status_line", label: "Setting up Tatolab…", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: false },
      { kind: "item", id: "set_up_tatolab", label: "Set Up Tatolab…", enabled: false },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
    [
      { kind: "item", id: "tray_status_line", label: "Runtime running · 0 streams", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
  ]);
});

test("a click on an item is that item's choice, and the status line chooses nothing", () => {
  const trayMenu = buildTrayMenuOnAFakeTrayIconHost();
  trayMenu.clickTrayMenuItem("tray_status_line");
  trayMenu.clickTrayMenuItem("open_tatolab");
  trayMenu.clickTrayMenuItem("run_tatolab");
  trayMenu.clickTrayMenuItem("set_up_tatolab");
  trayMenu.clickTrayMenuItem("check_for_app_updates");
  trayMenu.clickTrayMenuItem("quit_tatolab");
  expect(trayMenu.trayMenuChoices).toEqual(["open_tatolab", "toggle_run_tatolab_switch", "set_up_tatolab", "check_for_app_updates", "quit_the_app"]);
});

test("a packaged app shows Check for Updates… just above Quit Tatolab", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith(true, "complete", { kind: "not_checked" }));
  expect(shownMenus.at(-1)?.slice(-3)).toEqual([
    { kind: "separator" },
    { kind: "item", id: "check_for_app_updates", label: "Check for Updates…", enabled: true },
    { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
  ]);
});

test("the updates item names a newer version once one is found, and waits while an update is under way", () => {
  expect(appUpdateTrayMenuItemPresentation({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." })).toBeNull();
  expect(appUpdateTrayMenuItemPresentation({ kind: "up_to_date" })).toEqual({ label: "Check for Updates…", enabled: true });
  expect(appUpdateTrayMenuItemPresentation({ kind: "failed", refusal: "HttpError: 404" })).toEqual({ label: "Check for Updates…", enabled: true });
  expect(appUpdateTrayMenuItemPresentation({ kind: "checking" })).toEqual({ label: "Checking for Updates…", enabled: false });
  expect(appUpdateTrayMenuItemPresentation({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" })).toEqual({
    label: "Install Tatolab 0.47.0…",
    enabled: true,
  });
  expect(appUpdateTrayMenuItemPresentation({ kind: "available", version: "0.47.0", delivery: "open_the_download" })).toEqual({
    label: "Download Tatolab 0.47.0…",
    enabled: true,
  });
  expect(appUpdateTrayMenuItemPresentation({ kind: "downloading", version: "0.47.0", percent: 42 })).toEqual({ label: "Downloading Tatolab 0.47.0…", enabled: false });
  expect(appUpdateTrayMenuItemPresentation({ kind: "installing", version: "0.47.0" })).toEqual({ label: "Installing Tatolab 0.47.0…", enabled: false });
});
