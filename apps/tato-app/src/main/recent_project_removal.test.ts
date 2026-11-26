import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { PROJECT_REMOVAL_FOLLOW_INTERVAL_MS, PROJECT_REMOVAL_LONGEST_WAIT_MS } from "./open_project.js";
import { aDeletionIn, aFolder, anOpenProject, closeAndRemoveWhatTheTestMade, writeAProject } from "./fake_runtime_changing_projects.js";
import { failedWith, succeeded } from "./result.js";

afterEach(closeAndRemoveWhatTheTestMade);

test("a deleted recent project is followed until the runtime has moved it to the Trash, then its studio window closes and it is forgotten", async () => {
  const studioFolder = await aFolder();
  const otherFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, deletionsQueued, studioWindowsClosed, waitsMs, recentFolders } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [
      { folder: studioFolder, opened_at_wall_clock_ms: 200 },
      { folder: otherFolder, opened_at_wall_clock_ms: 100 },
    ],
    deletionStates: [aDeletionIn("queued"), aDeletionIn("in_progress"), aDeletionIn("done")],
  });
  await openProject.openRecentProject(studioFolder);

  expect(await openProject.deleteRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(deletionsQueued).toEqual([studioFolder]);
  expect(waitsMs).toEqual([PROJECT_REMOVAL_FOLLOW_INTERVAL_MS, PROJECT_REMOVAL_FOLLOW_INTERVAL_MS]);
  expect(studioWindowsClosed).toEqual([studioFolder]);
  expect(recentFolders()).toEqual([otherFolder]);
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});

test("a deletion that fails, is cancelled or is no longer held is refused in the runtime's words, and the project stays among the recent projects with its window open", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const recentFolders = [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }];
  const notHeld = { notHeld: "describe_stream_action failed: no action deletion-1" };
  const refusalsOfEachEnd = [
    { deletionStates: [aDeletionIn("failed", "the folder is on another disk than the Trash")], refusal: "the folder is on another disk than the Trash" },
    { deletionStates: [aDeletionIn("failed")], refusal: `The runtime could not delete ${studioFolder}.` },
    { deletionStates: [aDeletionIn("cancelled")], refusal: `Deleting ${studioFolder} was cancelled; the project is where it was.` },
    { deletionStates: [notHeld], refusal: notHeld.notHeld },
  ];
  for (const { deletionStates, refusal } of refusalsOfEachEnd) {
    const deleting = await anOpenProject({ dialogAnswers: null, recentFolders, deletionStates });
    expect(await deleting.openProject.deleteRecentProject(studioFolder)).toEqual(failedWith(refusal));
    expect(deleting.recentFolders()).toEqual([studioFolder]);
    expect(deleting.studioWindowsClosed).toEqual([]);
  }
});

test("a removed recent project is let go of by the runtime, its files kept, then its studio window closes and it is forgotten, so opening the folder again loads it afresh", async () => {
  const studioFolder = await aFolder();
  const otherFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, removalsQueued, deletionsQueued, studioWindowsClosed, waitsMs, recentFolders, projectsStarted, projectsReloaded } = await anOpenProject({
    dialogAnswers: studioFolder,
    recentFolders: [
      { folder: studioFolder, opened_at_wall_clock_ms: 200 },
      { folder: otherFolder, opened_at_wall_clock_ms: 100 },
    ],
    listedStreams: [{ projectDirectory: studioFolder, state: "failed" }],
    deletionStates: [aDeletionIn("in_progress"), aDeletionIn("done")],
  });
  await openProject.openRecentProject(studioFolder);

  expect(await openProject.removeRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(removalsQueued).toEqual([studioFolder]);
  expect(deletionsQueued).toEqual([]);
  expect(waitsMs).toEqual([PROJECT_REMOVAL_FOLLOW_INTERVAL_MS]);
  expect(studioWindowsClosed).toEqual([studioFolder]);
  expect(recentFolders()).toEqual([otherFolder]);
  expect(await readFile(path.join(studioFolder, "tatolab-project.json"), "utf8")).toContain("studio");

  expect(await openProject.chooseProjectFolder("project_to_open")).toMatchObject({ ok: true });
  expect(projectsReloaded).toEqual([studioFolder]);
  expect(projectsStarted).toEqual([studioFolder]);
});

test("a recent project the runtime holds no stream of is removed without asking the runtime, and a removal that fails is refused in the runtime's words with the project kept", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const recentFolders = [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }];

  const unheld = await anOpenProject({ dialogAnswers: null, recentFolders });
  expect(await unheld.openProject.removeRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(unheld.removalsQueued).toEqual([]);
  expect(unheld.recentFolders()).toEqual([]);

  const failing = await anOpenProject({
    dialogAnswers: null,
    recentFolders,
    listedStreams: [{ projectDirectory: studioFolder, state: "stopped" }],
    deletionStates: [aDeletionIn("failed")],
  });
  expect(await failing.openProject.removeRecentProject(studioFolder)).toEqual(failedWith(`The runtime could not remove ${studioFolder}.`));
  expect(failing.recentFolders()).toEqual([studioFolder]);
  expect(failing.studioWindowsClosed).toEqual([]);
  expect(await failing.openProject.removeRecentProject("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
});

test("a deletion still running past the longest wait is refused saying so, and one of a folder not among the recent projects is never queued", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, waitsMs, deletionsQueued, describedDeletions, recentFolders } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }],
    deletionStates: [aDeletionIn("in_progress")],
  });
  expect(await openProject.deleteRecentProject("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(deletionsQueued).toEqual([]);

  expect(await openProject.deleteRecentProject(studioFolder)).toEqual(failedWith(`The runtime is still deleting ${studioFolder}. Its card stays here, and reads as gone from disk once the folder is in the Trash.`));
  expect(waitsMs.reduce((waitedMs, waitMs) => waitedMs + waitMs, 0)).toBe(PROJECT_REMOVAL_LONGEST_WAIT_MS + PROJECT_REMOVAL_FOLLOW_INTERVAL_MS);
  expect(describedDeletions()).toBe(PROJECT_REMOVAL_LONGEST_WAIT_MS / PROJECT_REMOVAL_FOLLOW_INTERVAL_MS + 1);
  expect(recentFolders()).toEqual([studioFolder]);
});
