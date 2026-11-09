import { expect, test } from "vitest";
import type { SystemMenuBarMenu } from "../shared/tatolab_backend_contract.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import { electronAcceleratorOfTheShortcutHint, SystemMenuBarOfTheFocusedWindow, systemMenuBarMenusFrom } from "./system_menu_bar_of_the_focused_window.js";

const STUDIO_WINDOW_CONTENTS_ID = 2;
const OTHER_STUDIO_WINDOW_CONTENTS_ID = 3;

function menusNamed(menuLabel: string): SystemMenuBarMenu[] {
  return [
    {
      label: menuLabel,
      system_menu: null,
      entries: [{ kind: "command", entry_id: `${menuLabel}/Open project…`, label: "Open project…", shortcut_hint: "⌘O", unavailable_because: null }],
    },
  ];
}

function systemMenuBarOver(applicationMenu: ApplicationMenu) {
  const menusShown: (string | null)[] = [];
  const entriesSentToWindows: [number, string][] = [];
  let chooseAnEntryOfTheBarShown: (entryId: string) => void = () => {};
  const systemMenuBar = new SystemMenuBarOfTheFocusedWindow({
    applicationMenu,
    setTheApplicationMenu: (_applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen) => {
      menusShown.push(menusOfTheFocusedWindow?.[0]?.label ?? null);
      chooseAnEntryOfTheBarShown = whenAnEntryIsChosen;
    },
    sendTheWindowTheChosenEntry: (windowContentsId, entryId) => entriesSentToWindows.push([windowContentsId, entryId]),
  });
  return { systemMenuBar, menusShown, entriesSentToWindows, chooseAnEntry: (entryId: string) => chooseAnEntryOfTheBarShown(entryId) };
}

test("the bar shows the menus of the window in focus, the default bar for a window that sent none, and again the default once the focused window closes", () => {
  const { systemMenuBar, menusShown } = systemMenuBarOver("macos_menu_bar");

  systemMenuBar.showTheDefaultMenuBar();
  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern"));
  systemMenuBar.noticeTheWindowFocused(STUDIO_WINDOW_CONTENTS_ID);
  systemMenuBar.keepTheMenusOfTheWindow(OTHER_STUDIO_WINDOW_CONTENTS_ID, menusNamed("Camera"));
  systemMenuBar.noticeTheWindowFocused(OTHER_STUDIO_WINDOW_CONTENTS_ID);
  systemMenuBar.noticeTheWindowFocused(9);
  systemMenuBar.noticeTheWindowFocused(STUDIO_WINDOW_CONTENTS_ID);
  systemMenuBar.forgetTheWindow(OTHER_STUDIO_WINDOW_CONTENTS_ID);
  systemMenuBar.forgetTheWindow(STUDIO_WINDOW_CONTENTS_ID);

  expect(menusShown).toEqual([null, "Pattern", "Camera", null, "Pattern", null]);
});

test("menus a focused window sends again unchanged leave the bar as it is, and changed ones show at once", () => {
  const { systemMenuBar, menusShown } = systemMenuBarOver("macos_menu_bar");

  systemMenuBar.noticeTheWindowFocused(STUDIO_WINDOW_CONTENTS_ID);
  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern"));
  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern"));
  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern renamed"));

  expect(menusShown).toEqual([null, "Pattern", "Pattern renamed"]);
});

test("an entry chosen in the bar goes to the window whose menus it shows, and nowhere from the default bar", () => {
  const { systemMenuBar, entriesSentToWindows, chooseAnEntry } = systemMenuBarOver("macos_menu_bar");

  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern"));
  systemMenuBar.noticeTheWindowFocused(STUDIO_WINDOW_CONTENTS_ID);
  chooseAnEntry("Pattern/Open project…");
  systemMenuBar.noticeTheWindowFocused(9);
  chooseAnEntry("Pattern/Open project…");

  expect(entriesSentToWindows).toEqual([[STUDIO_WINDOW_CONTENTS_ID, "Pattern/Open project…"]]);
});

test("on Linux, where each window draws its own menus, the bar is set once with none and keeps nothing a window sends", () => {
  const { systemMenuBar, menusShown } = systemMenuBarOver("none");

  systemMenuBar.showTheDefaultMenuBar();
  systemMenuBar.keepTheMenusOfTheWindow(STUDIO_WINDOW_CONTENTS_ID, menusNamed("Pattern"));
  systemMenuBar.noticeTheWindowFocused(STUDIO_WINDOW_CONTENTS_ID);

  expect(menusShown).toEqual([null]);
});

test("menus in the contract's shape are read as sent, nested submenus and the desktop's own items among them, and anything else is refused", () => {
  const menus: SystemMenuBarMenu[] = [
    { label: "Tato Studio", system_menu: "app", entries: [{ kind: "separator" }, { kind: "system_items", system_items: "app_services_hide_and_quit" }] },
    {
      label: "Window",
      system_menu: "window",
      entries: [
        {
          kind: "submenu",
          label: "Layout",
          entries: [{ kind: "choice", entry_id: "Window/Layout/Build", label: "Build", shortcut_hint: "⌘1", is_chosen: true }],
        },
        { kind: "command", entry_id: "Window/New window", label: "New window", shortcut_hint: null, unavailable_because: "Not in this build yet" },
      ],
    },
  ];

  expect(systemMenuBarMenusFrom({ menus })).toEqual({ ok: true, value: menus });
  expect(systemMenuBarMenusFrom({ menus: [{ label: "File", system_menu: "dock", entries: [] }] }).ok).toBe(false);
  expect(systemMenuBarMenusFrom({ menus: [{ label: "File", system_menu: null, entries: [{ kind: "system_items", system_items: "everything" }] }] }).ok).toBe(false);
  expect(systemMenuBarMenusFrom({ menus: [{ label: "File", system_menu: null, entries: [{ kind: "choice", entry_id: "x", label: "x", shortcut_hint: null }] }] }).ok).toBe(false);
  expect(systemMenuBarMenusFrom({}).ok).toBe(false);
});

test("each key cap the window shows reads as the accelerator the bar draws, and one it cannot read draws none", () => {
  expect(electronAcceleratorOfTheShortcutHint("⌘O")).toBe("Command+O");
  expect(electronAcceleratorOfTheShortcutHint("⌘,")).toBe("Command+,");
  expect(electronAcceleratorOfTheShortcutHint("⌘1")).toBe("Command+1");
  expect(electronAcceleratorOfTheShortcutHint("F5")).toBe("F5");
  expect(electronAcceleratorOfTheShortcutHint("Shift F5")).toBe("Shift+F5");
  expect(electronAcceleratorOfTheShortcutHint("Shift A")).toBe("Shift+A");
  expect(electronAcceleratorOfTheShortcutHint("Ctrl O")).toBeNull();
});
