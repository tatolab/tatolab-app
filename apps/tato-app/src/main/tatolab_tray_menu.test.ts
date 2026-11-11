import { expect, test } from "vitest";
import type { RuntimeState, TatolabAppUpdateState, TatolabStatus } from "../shared/tatolab_backend_contract.js";
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
    (trayMenuChoice) => trayMenuChoices.push(trayMenuChoice),
  );
  return { tatolabTrayMenu, shownMenus, trayMenuChoices, clickTrayMenuItem, trayIconTooltip };
}

function statusWith(
  runtimeState: RuntimeState,
  appUpdate: TatolabAppUpdateState = { kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." },
): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    runtime_state: runtimeState,
    runtime_not_running_because: null,
    machine_name: null,
    streams: [],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "linked", path: "/Users/someone/.local/bin/tatolab" },
    app_update: appUpdate,
    app_update_announcement: null,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
  };
}

test("the tray menu is the status line, Open Tato Studio and Quit Tato Studio, which stops the runtime with the app", () => {
  const { shownMenus, trayIconTooltip } = buildTrayMenuOnAFakeTrayIconHost();
  expect(trayIconTooltip).toBe("Tato Studio");
  expect(shownMenus).toEqual([
    [
      { kind: "item", id: "tray_status_line", label: "Starting the runtime…", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tato Studio", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tato Studio", enabled: true },
    ],
  ]);
});

test("each status shows in the status line", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith("not_running"));
  tatolabTrayMenu.showStatus(statusWith("running"));
  expect(shownMenus.slice(1).map((trayMenuItems) => trayMenuItems[0])).toEqual([
    { kind: "item", id: "tray_status_line", label: "Runtime not running", enabled: false },
    { kind: "item", id: "tray_status_line", label: "Runtime running · 0 streams", enabled: false },
  ]);
});

test("a click on an item is that item's choice, and the status line chooses nothing", () => {
  const trayMenu = buildTrayMenuOnAFakeTrayIconHost();
  trayMenu.clickTrayMenuItem("tray_status_line");
  trayMenu.clickTrayMenuItem("open_tatolab");
  trayMenu.clickTrayMenuItem("app_updates");
  trayMenu.clickTrayMenuItem("quit_tatolab");
  expect(trayMenu.trayMenuChoices).toEqual(["open_tatolab", "respond_to_the_app_updates_item", "quit_the_app"]);
});

test("a packaged app shows Check for Updates… just above Quit Tatolab", () => {
  const { tatolabTrayMenu, shownMenus } = buildTrayMenuOnAFakeTrayIconHost();
  tatolabTrayMenu.showStatus(statusWith("running", { kind: "not_checked" }));
  expect(shownMenus.at(-1)?.slice(-3)).toEqual([
    { kind: "separator" },
    { kind: "item", id: "app_updates", label: "Check for Updates…", enabled: true },
    { kind: "item", id: "quit_tatolab", label: "Quit Tato Studio", enabled: true },
  ]);
});

test("the updates item names a newer version once one is found, offers Restart to Update once it is staged, and waits while an update is under way", () => {
  expect(appUpdateTrayMenuItemPresentation({ kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." })).toBeNull();
  expect(appUpdateTrayMenuItemPresentation({ kind: "up_to_date" })).toEqual({ label: "Check for Updates…", enabled: true });
  expect(appUpdateTrayMenuItemPresentation({ kind: "failed", refusal: "HttpError: 404" })).toEqual({ label: "Check for Updates…", enabled: true });
  expect(appUpdateTrayMenuItemPresentation({ kind: "checking" })).toEqual({ label: "Checking for Updates…", enabled: false });
  expect(appUpdateTrayMenuItemPresentation({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" })).toEqual({
    label: "Download Tato Studio 0.47.0…",
    enabled: true,
  });
  expect(appUpdateTrayMenuItemPresentation({ kind: "available", version: "0.47.0", delivery: "open_the_download" })).toEqual({
    label: "Download Tato Studio 0.47.0…",
    enabled: true,
  });
  expect(appUpdateTrayMenuItemPresentation({ kind: "downloading", version: "0.47.0", percent: 42 })).toEqual({ label: "Downloading Tato Studio 0.47.0… 42%", enabled: false });
  expect(appUpdateTrayMenuItemPresentation({ kind: "ready_to_restart", version: "0.47.0" })).toEqual({ label: "Restart to Update to 0.47.0", enabled: true });
  expect(appUpdateTrayMenuItemPresentation({ kind: "installing", version: "0.47.0" })).toEqual({ label: "Installing Tato Studio 0.47.0…", enabled: false });
});
