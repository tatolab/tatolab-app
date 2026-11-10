import { localApiRequestFailure } from "./local_api_client.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { LanguageServerOfAWindow } from "./python_language_servers.js";
import { STOP_AND_CLOSE_BUTTON_LABEL, TatolabAppWindows } from "./tatolab_app_windows.js";

const STUDIO_WINDOW_CONTENTS_ID = 2;
const STOP_AND_CLOSE_BUTTON_INDEX = 0;

const foldersToRemove: string[] = [];
afterEach(async () => {
  for (const folder of foldersToRemove.splice(0)) await rm(folder, { recursive: true, force: true });
});

function aStatusListing(streams: ListedStream[]): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "jonathanf-macbook",
    streams,
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/usr/local/bin/tatolab" },
    app_update: { kind: "not_offered", reason: "a test updates nothing" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "reading" },
  };
}

function aStreamOf(projectFolder: string, state: string): ListedStream {
  return {
    stream: "night-show-main-0a1b2c",
    display_name: "main",
    location: { project_directory: projectFolder, project: "uuid-of-night-show", stream_asset: "asset-of-main" },
    state,
    node_count: state === "running" ? 3 : null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

/** The windows over a fake shell with the project `night-show` open in its studio window, stopping a project as `stopTheProject` answers. */
async function windowsWithNightShowOpen(stopTheProject: (projectFolder: string) => Promise<Result<void, string>>, whenAWindowStartingLanguageServersClosed: (languageServerOfTheWindow: LanguageServerOfAWindow) => void = () => {}) {
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "night-show-"));
  foldersToRemove.push(projectFolder);
  await writeFile(path.join(projectFolder, "pyproject.toml"), '[project]\nname = "night-show"\n');
  const fakeShell = new FakeTatolabElectronAppShell();
  const projectsStopped: string[] = [];
  const appWindows = new TatolabAppWindows({
    mainWindowHostFactory: fakeShell.tatolabElectronAppShell.mainWindowHostFactory,
    platformItems: { mainWindowChrome: { titleBarStyle: "default" }, setDockIconVisible: () => {} },
    dockIconHost: fakeShell.tatolabElectronAppShell.dockIconHost,
    watchFolderEntries: () => null,
    projectReadingsOfTheRuntime: { nameTheProject: async () => failedWith("no runtime answers"), listTheDependencies: async () => failedWith("no runtime answers") },
    projectFilesOfTheRuntime: {
      listProjectFiles: async () => failedWith("no runtime answers"),
      readProjectFile: async () => failedWith("no runtime answers"),
      writeProjectFile: async () => failedWith("no runtime answers"),
    },
    personSavingTheFiles: { kind: "person", name: "sam" },
    mintAnIdempotencyKey: () => "a-save",
    openTheProjectTransactionsFeedConnection: async () => localApiRequestFailure("no runtime answers"),
    runAfter: () => () => {},
    stopTheProjectAsItsWindowCloses: (folder) => {
      projectsStopped.push(folder);
      return stopTheProject(folder);
    },
    whenAWindowStartingLanguageServersClosed,
    whenAWindowShowingPortViewersClosed: () => {},
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  appWindows.showTheProjectsWindow();
  await appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const projectName = path.basename(projectFolder);
  return { fakeShell, appWindows, projectFolder, projectName, projectsStopped };
}

/** Let the question asked over the window, and what follows the person's answer, run. */
async function letTheQuestionRun(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((settled) => setImmediate(settled));
}

function questionsAskedOverTheWindow(fakeShell: FakeTatolabElectronAppShell) {
  return fakeShell.records.flatMap((fakeShellRecord) => (fakeShellRecord.asked === "ask_a_question_over_the_window" ? [fakeShellRecord.question] : []));
}

test("a studio window whose project runs no stream closes at once, asking nothing", async () => {
  const { fakeShell, appWindows, projectFolder, projectsStopped } = await windowsWithNightShowOpen(async () => succeeded(undefined));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "stopped")]));

  expect(fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID)).toBe("let_it_close");
  expect(questionsAskedOverTheWindow(fakeShell)).toEqual([]);
  expect(projectsStopped).toEqual([]);
  expect(fakeShell.studioWindowsOpen()).toEqual([]);
});

test("closing a running project's window asks first, and Stop and Close stops the project, then closes the window", async () => {
  const { fakeShell, appWindows, projectFolder, projectName, projectsStopped } = await windowsWithNightShowOpen(async () => succeeded(undefined));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "running")]));
  fakeShell.buttonsChosenInTheNextQuestionsOverAWindow.push(STOP_AND_CLOSE_BUTTON_INDEX);

  expect(fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID)).toBe("keep_it_open");
  await letTheQuestionRun();

  expect(questionsAskedOverTheWindow(fakeShell)).toEqual([
    {
      message: `Closing this window stops ${projectName}.`,
      detail: `Every stream of ${projectName} stops running. Open the project and run it again to start it.`,
      buttonLabels: [STOP_AND_CLOSE_BUTTON_LABEL, "Cancel"],
      cancelButtonIndex: 1,
    },
  ]);
  expect(projectsStopped).toEqual([projectFolder]);
  expect(fakeShell.studioWindowsOpen()).toEqual([]);
});

test("Cancel keeps a running project's window open and its project running", async () => {
  const { fakeShell, appWindows, projectFolder, projectsStopped } = await windowsWithNightShowOpen(async () => succeeded(undefined));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "preparing")]));

  expect(fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID)).toBe("keep_it_open");
  await letTheQuestionRun();

  expect(questionsAskedOverTheWindow(fakeShell)).toHaveLength(1);
  expect(projectsStopped).toEqual([]);
  expect(fakeShell.studioWindowsOpen()).toHaveLength(1);
});

test("a stop the runtime refuses keeps the window open and shows the refusal in the runtime's own words", async () => {
  const refusal = "Runtime error: the project's removal is queued ahead of this stop";
  const { fakeShell, appWindows, projectFolder, projectName } = await windowsWithNightShowOpen(async () => failedWith(refusal));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "running")]));
  fakeShell.buttonsChosenInTheNextQuestionsOverAWindow.push(STOP_AND_CLOSE_BUTTON_INDEX);

  fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID);
  await letTheQuestionRun();

  expect(questionsAskedOverTheWindow(fakeShell).at(-1)).toEqual({
    message: `${projectName} did not stop, so its window stays open.`,
    detail: refusal,
    buttonLabels: ["OK"],
    cancelButtonIndex: 0,
  });
  expect(fakeShell.studioWindowsOpen()).toHaveLength(1);
});

test("a second close while the question is up asks it once", async () => {
  const { fakeShell, appWindows, projectFolder } = await windowsWithNightShowOpen(async () => succeeded(undefined));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "running")]));

  fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID);
  fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID);
  await letTheQuestionRun();

  expect(questionsAskedOverTheWindow(fakeShell)).toHaveLength(1);
});

test("a window closing as the app quits asks nothing", async () => {
  const { fakeShell, appWindows, projectFolder, projectsStopped } = await windowsWithNightShowOpen(async () => succeeded(undefined));
  appWindows.sendEveryWindowTheStatus(aStatusListing([aStreamOf(projectFolder, "running")]));
  appWindows.letEveryWindowCloseAsTheAppQuits();

  expect(fakeShell.requestTheCloseOfTheWindow(STUDIO_WINDOW_CONTENTS_ID)).toBe("let_it_close");
  expect(questionsAskedOverTheWindow(fakeShell)).toEqual([]);
  expect(projectsStopped).toEqual([]);
});

test("a popped-out view's language servers send it their events, and stop as it closes", async () => {
  const languageServersStopped: LanguageServerOfAWindow[] = [];
  const { fakeShell, appWindows } = await windowsWithNightShowOpen(async () => succeeded(undefined), (languageServerOfTheWindow) => languageServersStopped.push(languageServerOfTheWindow));
  const studioWindow = appWindows.studioWindowWithContents(STUDIO_WINDOW_CONTENTS_ID) ?? expect.unreachable("no studio window");
  appWindows.popOutTheViewOf(studioWindow, { view_type_id: "code", window_title: "night-show · Code", pinned_to: null });
  const poppedOutWindowContentsId = STUDIO_WINDOW_CONTENTS_ID + 1;
  const languageServerOfThePoppedOutView = appWindows.languageServerOfTheWindowWithContents(poppedOutWindowContentsId) ?? expect.unreachable("no language server for the popped-out view");
  expect(languageServerOfThePoppedOutView).not.toBe(studioWindow.languageServerOfTheWindow);
  expect(appWindows.studioWindowServingTheContents(poppedOutWindowContentsId)).toBe(studioWindow);

  languageServerOfThePoppedOutView.sendTheWindowALanguageServerEvent({ session: "language-server-1", kind: "ended", because: "stopped" });
  expect(fakeShell.records).toContainEqual(expect.objectContaining({ asked: "send_window_event", windowContentsId: poppedOutWindowContentsId }));

  expect(fakeShell.requestTheCloseOfTheWindow(poppedOutWindowContentsId)).toBe("let_it_close");
  expect(languageServersStopped).toEqual([languageServerOfThePoppedOutView]);
});
