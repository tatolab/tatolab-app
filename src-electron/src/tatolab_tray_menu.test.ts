// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import {
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
  TatolabTrayMenu.build(
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
  return { shownMenus, trayMenuChoices, clickTrayMenuItem, trayIconTooltip };
}

test("the tray menu is the status line, Open Tatolab and Quit Tatolab", () => {
  const { shownMenus, trayIconTooltip } = buildTrayMenuOnAFakeTrayIconHost();
  expect(trayIconTooltip).toBe("Tatolab");
  expect(shownMenus).toEqual([
    [
      { kind: "item", id: "tray_status_line", label: "Starting…", enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ],
  ]);
});

test("a click on Open Tatolab or Quit Tatolab is that choice, and the status line chooses nothing", () => {
  const trayMenu = buildTrayMenuOnAFakeTrayIconHost();
  trayMenu.clickTrayMenuItem("tray_status_line");
  trayMenu.clickTrayMenuItem("open_tatolab");
  trayMenu.clickTrayMenuItem("quit_tatolab");
  expect(trayMenu.trayMenuChoices).toEqual(["open_tatolab", "quit_the_app"]);
});
