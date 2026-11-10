import { expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import type { SystemMediaDevice } from "../system_media_access.js";
import { MediaAccessOfTheAppBundle, type AppMediaAccessSettings } from "./media_access_of_the_app_bundle.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** Electron's media access, answering TCC's status as scripted and recording each prompt and each pane opened. */
function scriptedAppMediaAccessSettings(status: string, promptAnswer: Result<boolean, string> = succeeded(true)) {
  const promptsShown: SystemMediaDevice[] = [];
  const panesOpened: SystemMediaDevice[] = [];
  const appMediaAccessSettings: AppMediaAccessSettings = {
    readMediaAccessStatus: () => status,
    askForMediaAccess: async (device) => {
      promptsShown.push(device);
      return promptAnswer;
    },
    openThePrivacyPaneOf: async (device) => {
      panesOpened.push(device);
      return succeeded(undefined);
    },
  };
  return { appMediaAccessSettings, promptsShown, panesOpened };
}

test("shows macOS's prompt only while TCC has not been answered, and answers what the person chose", async () => {
  const notAnswered = scriptedAppMediaAccessSettings("not-determined");
  expect(await new MediaAccessOfTheAppBundle(notAnswered.appMediaAccessSettings, quietTatolabAppLog).askAheadFor("camera")).toEqual({ kind: "allowed" });
  expect(notAnswered.promptsShown).toEqual(["camera"]);

  const allowedBefore = scriptedAppMediaAccessSettings("granted");
  expect(await new MediaAccessOfTheAppBundle(allowedBefore.appMediaAccessSettings, quietTatolabAppLog).askAheadFor("microphone")).toEqual({ kind: "allowed" });
  expect(allowedBefore.promptsShown).toEqual([]);
});

test("answers refused, with System Settings' privacy pane to open, when the person says no, said no before, or macOS could not ask", async () => {
  for (const [status, promptAnswer, promptsExpected] of [
    ["not-determined", succeeded(false), ["camera"]],
    ["not-determined", failedWith("askForMediaAccess threw"), ["camera"]],
    ["denied", succeeded(true), []],
    ["restricted", succeeded(true), []],
  ] as const) {
    const settings = scriptedAppMediaAccessSettings(status, promptAnswer);
    const answer = await new MediaAccessOfTheAppBundle(settings.appMediaAccessSettings, quietTatolabAppLog).askAheadFor("camera");
    expect(answer.kind).toBe("refused");
    if (answer.kind === "refused") answer.openWhereThePersonAllowsIt();
    await new Promise((resolve) => setImmediate(resolve));
    expect(settings.promptsShown).toEqual(promptsExpected);
    expect(settings.panesOpened).toEqual(["camera"]);
  }
});
