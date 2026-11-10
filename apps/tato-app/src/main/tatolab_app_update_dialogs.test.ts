import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { QuestionOverTheWindow } from "./tatolab_main_window.js";
import {
  LAST_OPENED_APP_VERSION_FILE_NAME,
  LastOpenedAppVersionFile,
  tellThePersonWhenAnUpdateLanded,
  updateReadyDialogOverTheWindowInFront,
  type TatolabAppUpdateDialogsSources,
} from "./tatolab_app_update_dialogs.js";

const appConfigDirectoriesMade: string[] = [];

afterEach(async () => {
  await Promise.all(appConfigDirectoriesMade.splice(0).map((appConfigDirectory) => rm(appConfigDirectory, { recursive: true, force: true })));
});

async function anEmptyAppConfigDirectory(): Promise<string> {
  const appConfigDirectory = path.join(os.tmpdir(), `tl-update-dialogs-${randomUUID()}`);
  await mkdir(appConfigDirectory, { recursive: true });
  appConfigDirectoriesMade.push(appConfigDirectory);
  return appConfigDirectory;
}

/** Dialog sources that record each question asked and each web page opened, answering the buttons the test lines up. */
function recordingUpdateDialogsSources(buttonsChosen: Result<number, string>[] = []) {
  const questionsAsked: QuestionOverTheWindow[] = [];
  const webPagesOpened: string[] = [];
  const sources: TatolabAppUpdateDialogsSources = {
    askAQuestionOverTheWindowInFront: (question) => {
      questionsAsked.push(question);
      return Promise.resolve(buttonsChosen.shift() ?? succeeded(question.cancelButtonIndex));
    },
    openAWebPageInTheBrowser: (webPageUrl) => {
      webPagesOpened.push(webPageUrl);
      return Promise.resolve(succeeded(undefined));
    },
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  };
  return { sources, questionsAsked, webPagesOpened };
}

function lastOpenedVersionFileIn(appConfigDirectory: string): LastOpenedAppVersionFile {
  return LastOpenedAppVersionFile.inAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {}));
}

test("the update-ready dialog names the version, offers Install Update or Cancel, and reads a dialog it could not show as Cancel", async () => {
  const { sources, questionsAsked } = recordingUpdateDialogsSources([succeeded(0), succeeded(1), failedWith("the window is not open")]);
  const askWhetherToInstall = updateReadyDialogOverTheWindowInFront(sources);

  expect(await askWhetherToInstall("0.69.0")).toBe("install_update");
  expect(await askWhetherToInstall("0.69.0")).toBe("cancel");
  expect(await askWhetherToInstall("0.69.0")).toBe("cancel");
  expect(questionsAsked[0]).toEqual({
    message: "Tato Studio 0.69.0 is ready to install.",
    detail: "Installing it restarts Tato Studio, which stops every stream it runs until you run it again.",
    buttonLabels: ["Install Update", "Cancel"],
    cancelButtonIndex: 1,
  });
});

test("the first launch says nothing and remembers its version, and a later launch of the same version says nothing", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  const { sources, questionsAsked } = recordingUpdateDialogsSources();

  await tellThePersonWhenAnUpdateLanded("0.68.56", lastOpenedVersionFileIn(appConfigDirectory), sources);
  await tellThePersonWhenAnUpdateLanded("0.68.56", lastOpenedVersionFileIn(appConfigDirectory), sources);

  expect(questionsAsked).toEqual([]);
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "utf8"))).toEqual({ app_version: "0.68.56" });
});

test("the first launch after an update names the new version and that dependencies update on their own, once, and Release Notes opens its notes", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  await writeFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), JSON.stringify({ app_version: "0.68.47" }));
  const { sources, questionsAsked, webPagesOpened } = recordingUpdateDialogsSources([succeeded(1)]);

  await tellThePersonWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), sources);
  await tellThePersonWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), sources);

  expect(questionsAsked).toEqual([
    {
      message: "Tato Studio is now version 0.69.0.",
      detail: "Each project's dependencies are brought up to date automatically the next time it runs.",
      buttonLabels: ["OK", "Release Notes"],
      cancelButtonIndex: 0,
    },
  ]);
  expect(webPagesOpened).toEqual(["https://github.com/tatolab/tatolab-app/releases/tag/v0.69.0"]);
});

test("OK closes the update-landed dialog and opens nothing", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  await writeFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), JSON.stringify({ app_version: "0.68.47" }));
  const { sources, questionsAsked, webPagesOpened } = recordingUpdateDialogsSources([succeeded(0)]);

  await tellThePersonWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), sources);

  expect(questionsAsked).toHaveLength(1);
  expect(webPagesOpened).toEqual([]);
});

test("a remembered version that is malformed reads as none, so the launch says nothing and remembers its own", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  await writeFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "{ not json");
  const { sources, questionsAsked } = recordingUpdateDialogsSources();

  await tellThePersonWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), sources);

  expect(questionsAsked).toEqual([]);
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "utf8"))).toEqual({ app_version: "0.69.0" });
});
