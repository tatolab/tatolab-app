import { describe, expect, it } from "vitest";
import { AddStreamFlowOfTheWindow, type AddStreamBackend } from "./add_stream_flow_of_the_window";
import { addStreamActionOf } from "./presentation/add_stream_flow";
import type { StreamProjectFolderReport, StreamProjectRunOutcome, StreamRunAnswer } from "../shared/tatolab_backend_contract";

const HEAT_MAP_FOLDER: StreamProjectFolderReport = {
  folder: "/Users/someone/code/heat-map",
  folder_exists: true,
  stream_file_present: true,
  stream_functions: ["heat_map"],
  python_environment: { kind: "present", python_version: "3.12.10", tatolab_stream_version: "0.55.0" },
};

const HEAT_MAP_ANSWER_WITH_TWO_WARNINGS: StreamRunAnswer = {
  stream: "heat-map-heat-map-9127e0",
  display_name: "heat_map",
  stream_instance: "7",
  location: { project_directory: HEAT_MAP_FOLDER.folder, stream_function: "stream:heat_map" },
  node_count: 4,
  replaced_a_recorded_stream: false,
  compile_warnings: ["tatolab: the cross-floor check found 1 thing binding this app to one floor.", "  nodes/heat_render.py:4: imports `cupy`"],
};

const RUNNING_WITH_TWO_WARNINGS: StreamProjectRunOutcome = { kind: "running", answer: HEAT_MAP_ANSWER_WITH_TWO_WARNINGS };

/** A backend whose run answers only when the test settles it. */
function backendWithAPendingRun() {
  let settleTheRun: { answer: (outcome: StreamProjectRunOutcome) => void; refuse: (words: string) => void } | null = null;
  const backend: AddStreamBackend = {
    chooseStreamProjectFolder: async () => HEAT_MAP_FOLDER,
    proposeNewStreamProjectFolder: async () => HEAT_MAP_FOLDER,
    createStreamProject: async () => HEAT_MAP_FOLDER,
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
  addStreamFlow.openDialog("project_folder", false);
  addStreamFlow.chooseFolder();
  await Promise.resolve();
  return { addStreamFlow, ...pendingRun };
}

describe("the window's Add stream flow", () => {
  it("says which source the dialog is open on, and that it is closed once it closes", () => {
    const addStreamFlow = new AddStreamFlowOfTheWindow(backendWithAPendingRun().backend);
    expect(addStreamFlow.readOpenDialog()).toBeNull();

    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readOpenDialog()).toEqual({ source: "new_project", isOpenedFromARunNotice: false });

    addStreamFlow.closeDialog();
    expect(addStreamFlow.readOpenDialog()).toBeNull();
  });

  it("shows a run that answers while the dialog is open in the dialog, with no notice", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.performTheAction();
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "compiling", startedAtMs: 1000, request: { displayName: "heat_map" } });

    await answerTheRun(RUNNING_WITH_TWO_WARNINGS);

    expect(addStreamFlow.readFlowState().step).toBe("running");
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });

  it("keeps a run that answers after the dialog closed, and leaves a notice of it until the dialog opens again", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();

    await answerTheRun(RUNNING_WITH_TWO_WARNINGS);

    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "running", answer: { stream: "heat-map-heat-map-9127e0", display_name: "heat_map" } });
    expect(addStreamFlow.readRunNotice()).toEqual({ kind: "running", source: "project_folder", answer: HEAT_MAP_ANSWER_WITH_TWO_WARNINGS });
    addStreamFlow.openDialog("project_folder", true);
    expect(addStreamFlow.readRunNotice()).toBeNull();
    expect(addStreamFlow.readFlowState().step).toBe("running");
  });

  it("leaves a notice of a refusal in the runtime's own words, which Dismiss takes away", async () => {
    const { addStreamFlow, refuseTheRun } = await flowWithAFolderChosen();
    const listenedChanges: number[] = [];
    addStreamFlow.subscribeToFlow(() => listenedChanges.push(1));
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();

    await refuseTheRun("Runtime error: the stream function in /Users/someone/code/heat-map failed to compile");

    expect(addStreamFlow.readRunNotice()).toEqual({
      kind: "refused",
      source: "project_folder",
      title: "Adding the stream was refused",
      words: "Runtime error: the stream function in /Users/someone/code/heat-map failed to compile",
    });
    addStreamFlow.dismissRunNotice();
    expect(addStreamFlow.readRunNotice()).toBeNull();
    expect(listenedChanges.length).toBeGreaterThan(2);
  });

  it("leaves a notice of uv failing to set up the folder's Python, titled so and in uv's own words", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();

    await answerTheRun({ kind: "python_environment_not_made", words: "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`" });

    expect(addStreamFlow.readRunNotice()).toEqual({
      kind: "refused",
      source: "project_folder",
      title: "Tatolab couldn't set up the project's Python",
      words: "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`",
    });
  });

  it("Create writes the new project and adds it with no second press, and a refused add leaves Add as the dialog's action", async () => {
    const pendingRun = backendWithAPendingRun();
    const addStreamFlow = new AddStreamFlowOfTheWindow(pendingRun.backend, () => 1000);
    addStreamFlow.openDialog("new_project", false);
    addStreamFlow.proposeNewProjectFolder();
    await Promise.resolve();
    expect(addStreamActionOf(addStreamFlow.readFlowState().form)).toBe("create");

    addStreamFlow.performTheAction();
    await Promise.resolve();
    await Promise.resolve();
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "compiling", form: { hasCreatedTheNewProject: true } });

    await pendingRun.refuseTheRun("Runtime error: the stream function failed to compile");
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "form", form: { refusal: { lead: "Adding the stream was refused:" } } });
    expect(addStreamActionOf(addStreamFlow.readFlowState().form)).toBe("add");
  });

  it("leaves no notice for work other than a run that finishes while the dialog is closed", async () => {
    const { addStreamFlow } = await flowWithAFolderChosen();
    addStreamFlow.closeDialog();
    addStreamFlow.chooseFolder();
    await Promise.resolve();
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });

  it("opened afresh, the dialog starts a new form unless a run is still compiling", async () => {
    const { addStreamFlow, answerTheRun } = await flowWithAFolderChosen();
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();
    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readFlowState().step).toBe("compiling");

    await answerTheRun(RUNNING_WITH_TWO_WARNINGS);
    addStreamFlow.closeDialog();
    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readFlowState()).toEqual({ step: "form", form: expect.objectContaining({ source: "new_project", projectFolder: null }) });
  });
});
