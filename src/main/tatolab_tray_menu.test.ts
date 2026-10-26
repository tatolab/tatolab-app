import { expect, test } from "vitest";
import type { RuntimeAgentRegistration, RuntimeState, TatolabAppUpdateState, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import {
  appUpdateTrayMenuItemPresentation,
  TatolabTrayMenu,
  type TrayMenuChoice,
  type TrayMenuItemDescription,
  type TrayMenuItemId,
} from "./tatolab_tray_menu.js";

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
  runtimeState: RuntimeState,
  appUpdate: TatolabAppUpdateState = { kind: "not_offered", reason: "Only a packaged Tatolab updates itself." },
  runtimeAgent: RuntimeAgentRegistration = "enabled",
): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    run_tatolab: runTatolab,
    runtime_agent: runtimeAgent,
    runtime_state: runtimeState,
    machine_name: null,
    streams: [],
    first_run_finished: true,
    command_line_tool_linked_at: null,
    command_line_tool_usr_local_bin_link: { kind: "not_linked" },
    app_update: appUpdate,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
    python_for_new_environments: { kind: "built_in", python_version: "3.12.12" },
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

test("each status shows in the status line and the check, with login items after the check while macOS waits for approval and nothing to press while the app recovers the runtime", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith(true, "stopped", undefined, "requires_approval"));
  tatolabTrayMenu.showStatus(statusWith(true, "blocked_by_the_service_manager"));
  tatolabTrayMenu.showStatus(statusWith(true, "never_answered"));
  tatolabTrayMenu.showStatus(statusWith(true, "running"));
  expect(shownMenus.slice(1)).toEqual([
    [
      { kind: "item", id: "tray_status_line", label: "Needs your approval in Login Items", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: true },
      { kind: "item", id: "open_login_items_settings", label: "Open Login Items…", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
    [
      { kind: "item", id: "tray_status_line", label: "Runtime blocked by macOS", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
    [
      { kind: "item", id: "tray_status_line", label: "Runtime didn't start", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: true },
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
  trayMenu.clickTrayMenuItem("open_login_items_settings");
  trayMenu.clickTrayMenuItem("check_for_app_updates");
  trayMenu.clickTrayMenuItem("quit_tatolab");
  expect(trayMenu.trayMenuChoices).toEqual([
    "open_tatolab",
    "toggle_run_tatolab_switch",
    "open_login_items_settings",
    "check_for_app_updates",
    "quit_the_app",
  ]);
});

test("a packaged app shows Check for Updates… just above Quit Tatolab", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith(true, "running", { kind: "not_checked" }));
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
