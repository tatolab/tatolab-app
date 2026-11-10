import { describe, expect, it } from "vitest";
import { APP_UPDATE_SCHEDULE_EXPLANATION, presentTatolabAppUpdate, presentTatolabAppUpdateMenuEntry } from "./app_update_presentation";

describe("presentTatolabAppUpdate", () => {
  it("offers a check while nothing is under way, and says when it checks and that it downloads in the background", () => {
    expect(presentTatolabAppUpdate({ kind: "not_checked" })).toEqual({
      description: APP_UPDATE_SCHEDULE_EXPLANATION,
      action: { label: "Check for Updates…", command: "check_for_updates", isEnabled: true },
      failure: null,
    });
    expect(presentTatolabAppUpdate({ kind: "up_to_date" }).description).toBe("Tato Studio is up to date.");
  });

  it("waits while a check, a download or an install is under way", () => {
    expect(presentTatolabAppUpdate({ kind: "checking" }).action?.isEnabled).toBe(false);
    expect(presentTatolabAppUpdate({ kind: "downloading", version: "0.47.0", percent: 42 })).toMatchObject({
      description: "Downloading Tato Studio 0.47.0… 42%",
      action: { isEnabled: false },
    });
    expect(presentTatolabAppUpdate({ kind: "installing", version: "0.47.0" })).toMatchObject({
      description: "Installing Tato Studio 0.47.0. Tato Studio reopens when it's done.",
      action: { isEnabled: false },
    });
  });

  it("offers Restart to Update once a newer version is staged", () => {
    expect(presentTatolabAppUpdate({ kind: "ready_to_restart", version: "0.47.0" })).toEqual({
      description: "Tato Studio 0.47.0 is ready. Restart to update to install it.",
      action: { label: "Restart to Update", command: "take_the_newer_version", isEnabled: true },
      failure: null,
    });
  });

  it("offers to download a newer version that did not download in the background, or to open a .deb's download", () => {
    expect(presentTatolabAppUpdate({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" })).toMatchObject({
      description: "Tato Studio 0.47.0 is available.",
      action: { label: "Download Update", command: "take_the_newer_version", isEnabled: true },
    });
    expect(presentTatolabAppUpdate({ kind: "available", version: "0.47.0", delivery: "open_the_download" })).toMatchObject({
      action: { label: "Open Download", command: "take_the_newer_version", isEnabled: true },
    });
  });

  it("shows a failure in the updater's own words and offers the check again", () => {
    expect(presentTatolabAppUpdate({ kind: "failed", refusal: "net::ERR_NAME_NOT_RESOLVED" })).toEqual({
      description: APP_UPDATE_SCHEDULE_EXPLANATION,
      action: { label: "Check for Updates…", command: "check_for_updates", isEnabled: true },
      failure: "Couldn't update Tato Studio: net::ERR_NAME_NOT_RESOLVED",
    });
  });

  it("shows why an app that cannot update itself offers no check", () => {
    expect(presentTatolabAppUpdate({ kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." })).toEqual({
      description: "Only a packaged Tato Studio updates itself.",
      action: null,
      failure: null,
    });
  });
});

describe("presentTatolabAppUpdateMenuEntry", () => {
  it("names the version a restart installs, and otherwise reads as Settings' control", () => {
    expect(presentTatolabAppUpdateMenuEntry({ kind: "ready_to_restart", version: "0.47.0" })).toEqual({
      label: "Restart to Update to 0.47.0",
      command: "take_the_newer_version",
      isEnabled: true,
    });
    expect(presentTatolabAppUpdateMenuEntry({ kind: "up_to_date" })).toEqual({ label: "Check for Updates…", command: "check_for_updates", isEnabled: true });
    expect(presentTatolabAppUpdateMenuEntry({ kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." })).toBeNull();
  });
});
