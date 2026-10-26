import { describe, expect, it } from "vitest";
import { APP_UPDATE_SCHEDULE_EXPLANATION, presentTatolabAppUpdate } from "./app_update_presentation";

describe("presentTatolabAppUpdate", () => {
  it("offers a check while nothing is under way, and says when it checks", () => {
    expect(presentTatolabAppUpdate({ kind: "not_checked" })).toEqual({
      description: APP_UPDATE_SCHEDULE_EXPLANATION,
      actionLabel: "Check for Updates…",
      isActionEnabled: true,
      failure: null,
    });
    expect(presentTatolabAppUpdate({ kind: "up_to_date" }).description).toBe("Tatolab is up to date.");
  });

  it("waits while a check, a download or an install is under way", () => {
    expect(presentTatolabAppUpdate({ kind: "checking" }).isActionEnabled).toBe(false);
    expect(presentTatolabAppUpdate({ kind: "downloading", version: "0.47.0", percent: 42 })).toMatchObject({
      description: "Downloading Tatolab 0.47.0… 42%",
      isActionEnabled: false,
    });
    expect(presentTatolabAppUpdate({ kind: "installing", version: "0.47.0" })).toMatchObject({
      description: "Installing Tatolab 0.47.0. Tatolab reopens when it's done.",
      isActionEnabled: false,
    });
  });

  it("offers to install a newer version in place, or to open its download", () => {
    expect(presentTatolabAppUpdate({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" })).toMatchObject({
      description: "Tatolab 0.47.0 is available.",
      actionLabel: "Install and Relaunch",
      isActionEnabled: true,
    });
    expect(presentTatolabAppUpdate({ kind: "available", version: "0.47.0", delivery: "open_the_download" })).toMatchObject({
      actionLabel: "Open Download",
      isActionEnabled: true,
    });
  });

  it("shows a failure in the updater's own words and offers the check again", () => {
    expect(presentTatolabAppUpdate({ kind: "failed", refusal: "net::ERR_NAME_NOT_RESOLVED" })).toEqual({
      description: APP_UPDATE_SCHEDULE_EXPLANATION,
      actionLabel: "Check for Updates…",
      isActionEnabled: true,
      failure: "Couldn't update Tatolab: net::ERR_NAME_NOT_RESOLVED",
    });
  });

  it("shows why an app that cannot update itself offers no check", () => {
    expect(presentTatolabAppUpdate({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." })).toEqual({
      description: "Only a packaged Tatolab updates itself.",
      actionLabel: null,
      isActionEnabled: false,
      failure: null,
    });
  });
});
