import { describe, expect, it } from "vitest";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import {
  abbreviateHomeDirectory,
  holdsWindowShortcutModifier,
  platformOf,
  presentCommandLineTool,
  presentPlatform,
  presentWindowShortcut,
  shortcutHint,
  windowDragRegionAttribute,
} from "./platform_presentation";

function statusOn(platform: unknown): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: platform as TatolabPlatform,
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "ada-workstation",
    streams: [],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/Users/ada/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    app_update: { kind: "not_checked" },
    app_update_announcement: null,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
  };
}

const NO_MODIFIERS = { metaKey: false, ctrlKey: false, altKey: false };

describe("platformOf", () => {
  it("reads the platform the status names", () => {
    expect(platformOf(statusOn("linux"))).toBe("linux");
    expect(platformOf(statusOn("macos"))).toBe("macos");
  });

  it("reads a status that names no platform, or one newer than this window, as macOS", () => {
    expect(platformOf(statusOn(undefined))).toBe("macos");
    expect(platformOf(statusOn("windows"))).toBe("macos");
  });
});

describe("presentPlatform", () => {
  it("keeps the traffic-light band and the top bands' dragging for macOS's overlay title bar only", () => {
    expect(presentPlatform("macos").hasOverlayTitleBar).toBe(true);
    expect(presentPlatform("linux").hasOverlayTitleBar).toBe(false);
    expect(windowDragRegionAttribute("macos", "deep")).toBe("deep");
    expect(windowDragRegionAttribute("macos", "self")).toBe("");
    expect(windowDragRegionAttribute("linux", "deep")).toBeNull();
    expect(windowDragRegionAttribute("linux", "self")).toBeNull();
  });

  it("names the machine, and where the app's icon lives, as each platform does", () => {
    expect(presentPlatform("macos").quitTatolabExplanation).toContain("menu bar icon");
    expect(presentPlatform("linux").quitTatolabExplanation).toContain("tray icon");
    expect(presentPlatform("macos").quitTatolabExplanation).toContain("stops the runtime");
  });

  it("names the shell profile a login terminal reads its PATH from", () => {
    expect(presentPlatform("macos").loginShellProfile).toBe("~/.zprofile");
    expect(presentPlatform("linux").loginShellProfile).toBe("~/.profile");
  });
});

describe("presentWindowShortcut", () => {
  it("gives the key cap and the aria-keyshortcuts value of the platform's modifier with the key", () => {
    expect(presentWindowShortcut("macos", "K")).toEqual({ hint: "⌘K", ariaKeyShortcuts: "Meta+K" });
    expect(presentWindowShortcut("linux", "F")).toEqual({ hint: "Ctrl F", ariaKeyShortcuts: "Control+F" });
  });
});

describe("shortcutHint", () => {
  it("writes ⌘ before the key on macOS and Ctrl and a space before it on Linux", () => {
    expect(shortcutHint("macos", "K")).toBe("⌘K");
    expect(shortcutHint("macos", ",")).toBe("⌘,");
    expect(shortcutHint("linux", "K")).toBe("Ctrl K");
    expect(shortcutHint("linux", "1")).toBe("Ctrl 1");
  });
});

describe("streamRecordsDirectory", () => {
  it("names where each platform keeps the streams' records", () => {
    expect(presentPlatform("macos").streamRecordsDirectory).toBe("~/Library/Application Support/Tatolab");
    expect(presentPlatform("linux").streamRecordsDirectory).toBe("~/.local/state/tatolab");
  });
});

describe("holdsWindowShortcutModifier", () => {
  it("takes ⌘ on macOS and Ctrl on Linux", () => {
    expect(holdsWindowShortcutModifier("macos", { ...NO_MODIFIERS, metaKey: true })).toBe(true);
    expect(holdsWindowShortcutModifier("macos", { ...NO_MODIFIERS, ctrlKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", { ...NO_MODIFIERS, ctrlKey: true })).toBe(true);
    expect(holdsWindowShortcutModifier("linux", { ...NO_MODIFIERS, metaKey: true })).toBe(false);
  });

  it("refuses a chord with another modifier or none", () => {
    expect(holdsWindowShortcutModifier("macos", { metaKey: true, ctrlKey: true, altKey: false })).toBe(false);
    expect(holdsWindowShortcutModifier("macos", { metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", { metaKey: false, ctrlKey: true, altKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", NO_MODIFIERS)).toBe(false);
  });
});

describe("presentCommandLineTool", () => {
  it("shows the home-folder link to the copy inside the app, with the PATH line for the platform's login profile", () => {
    expect(presentCommandLineTool("macos", { kind: "linked", path: "/Users/ada/.local/bin/tatolab" })).toEqual({
      linkedAt: "/Users/ada/.local/bin/tatolab",
      shownValue: "~/.local/bin/tatolab",
      explanation: "Linked to the copy inside Tato Studio. It works in any terminal with ~/.local/bin on its PATH.",
      pathLineToAdd: {
        lead: "If a terminal can't find it, add this line to ~/.zprofile and open a new terminal:",
        line: 'export PATH="$HOME/.local/bin:$PATH"',
      },
      isLinkOffered: false,
    });
    expect(presentCommandLineTool("linux", { kind: "linked", path: "/home/ada/.local/bin/tatolab" }).pathLineToAdd?.lead).toBe(
      "If a terminal can't find it, add this line to ~/.profile and open a new terminal:",
    );
  });

  it("offers to link a free name with no password, and leaves a name something else holds alone", () => {
    expect(presentCommandLineTool("macos", { kind: "not_linked", path: "/Users/ada/.local/bin/tatolab" })).toEqual({
      linkedAt: null,
      shownValue: "Not linked",
      explanation: "Link ~/.local/bin/tatolab to the copy inside Tato Studio. No password is asked.",
      pathLineToAdd: null,
      isLinkOffered: true,
    });
    expect(presentCommandLineTool("linux", { kind: "taken_by_something_else", path: "/home/ada/.local/bin/tatolab" })).toEqual({
      linkedAt: null,
      shownValue: "Not linked",
      explanation: "~/.local/bin/tatolab is not a link to Tatolab, so Tato Studio leaves it alone.",
      pathLineToAdd: null,
      isLinkOffered: false,
    });
  });

  it("says why a build offers no link, in the words it gives", () => {
    expect(presentCommandLineTool("macos", { kind: "not_offered", reason: "This build of Tato Studio carries no tatolab command." })).toEqual({
      linkedAt: null,
      shownValue: "Not linked",
      explanation: "This build of Tato Studio carries no tatolab command.",
      pathLineToAdd: null,
      isLinkOffered: false,
    });
  });
});

describe("abbreviateHomeDirectory", () => {
  it("shortens a home directory to ~", () => {
    expect(abbreviateHomeDirectory("/Users/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada")).toBe("~");
    expect(abbreviateHomeDirectory("/private/tmp/pattern")).toBe("/private/tmp/pattern");
    expect(abbreviateHomeDirectory("/srv/home/ada/pattern")).toBe("/srv/home/ada/pattern");
  });
});
