// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import { AddStreamFlowOfTheWindow, type AddStreamBackend } from "./add_stream_flow_of_the_window";
import type { StreamProjectFolderReport, StreamProjectRunOutcome } from "./backend/tatolab_backend_contract";

const HEAT_MAP_FOLDER: StreamProjectFolderReport = {
  folder: "/Users/someone/code/heat-map",
  folder_exists: true,
  stream_file_present: true,
  stream_functions: ["heat_map"],
  python_environment: { kind: "present", python_version: "3.12.10", tatolab_stream_version: "0.55.0" },
};

const RUNNING_WITH_TWO_WARNINGS: StreamProjectRunOutcome = {
  kind: "running",
  answer: {
    stream: "heat_map",
    stream_instance: "7",
    kept: true,
    project_directory: HEAT_MAP_FOLDER.folder,
    node_count: 4,
    replaced_the_kept_record: false,
    compile_warnings: ["tatolab: the cross-floor check found 1 thing binding this app to one floor.", "  nodes/heat_render.py:4: imports `cupy`"],
  },
};

/** A backend whose run answers only when the test settles it. */
function backendWithAPendingRun() {
  let settleTheRun: { answer: (outcome: StreamProjectRunOutcome) => void; refuse: (words: string) => void } | null = null;
  const backend: AddStreamBackend = {
    chooseStreamProjectFolder: async () => HEAT_MAP_FOLDER,
    proposeNewStreamProjectFolder: async () => HEAT_MAP_FOLDER,
    checkStreamProjectFolder: async () => HEAT_MAP_FOLDER,
    createStreamProject: async () => HEAT_MAP_FOLDER,
    openTerminalAtChosenProjectFolder: async () => {},
    runStreamProject: () =>
      new Promise((resolve, reject) => {
        settleTheRun = { answer: resolve, refuse: reject };
      }),
  };
  return {
    backend,
    answerTheRun: async (outcome: StreamProjectRunOutcome) => {
      settleTheRun?.answer(outcome);
      await Promise.resolve();
    },
    refuseTheRun: async (words: string) => {
      settleTheRun?.refuse(words);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

async function flowWithAFolderChosen() {
  const pendingRun = backendWithAPendingRun();
  const addStreamFlow = new AddStreamFlowOfTheWindow(pendingRun.backend, () => 1000);
  addStreamFlow.setPageShown(true);
  addStreamFlow.chooseFolder();
  await Promise.resolve();
  return { addStreamFlow, ...pendingRun };
}

describe("the window's Add stream flow", () => {
  it("shows a run that answers while the page is shown on the page, with no notice", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.compileAndRun();
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "compiling", startedAtMs: 1000, request: { streamName: "heat_map" } });

    await answerTheRun(RUNNING_WITH_TWO_WARNINGS);

    expect(addStreamFlow.readFlowState().step).toBe("running");
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });

  it("keeps a run that answers after the page left, and leaves a notice of it until the page shows again", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.compileAndRun();
    addStreamFlow.setPageShown(false);

    await answerTheRun(RUNNING_WITH_TWO_WARNINGS);

    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "running", answer: { stream: "heat_map" } });
    expect(addStreamFlow.readRunNotice()).toEqual({ kind: "running", source: "project_folder", streamName: "heat_map", compileWarningCount: 2 });
    addStreamFlow.setPageShown(true);
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });

  it("leaves a notice of a refusal in the runtime's own words, which Dismiss takes away", async () => {
    const { addStreamFlow, refuseTheRun } = await flowWithAFolderChosen();
    const listenedChanges: number[] = [];
    addStreamFlow.subscribeToFlow(() => listenedChanges.push(1));
    addStreamFlow.compileAndRun();
    addStreamFlow.setPageShown(false);

    await refuseTheRun("Runtime error: the stream function in /Users/someone/code/heat-map failed to compile");

    expect(addStreamFlow.readRunNotice()).toEqual({
      kind: "refused",
      source: "project_folder",
      words: "Runtime error: the stream function in /Users/someone/code/heat-map failed to compile",
    });
    addStreamFlow.dismissRunNotice();
    expect(addStreamFlow.readRunNotice()).toBeNull();
    expect(listenedChanges.length).toBeGreaterThan(2);
  });

  it("leaves no notice for work other than a run that finishes away from the page", async () => {
    const { addStreamFlow } = await flowWithAFolderChosen();
    addStreamFlow.setPageShown(false);
    addStreamFlow.checkTheFolderAgain();
    await Promise.resolve();
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });
});
