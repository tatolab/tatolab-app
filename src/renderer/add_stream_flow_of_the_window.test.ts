import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AddStreamFlowOfTheWindow,
  MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW,
  PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS,
  type AddStreamBackend,
} from "./add_stream_flow_of_the_window";
import type { StreamActionDescription, StreamActionFollowed } from "../shared/tatolab_backend_contract";

const HALLWAYS = "/Users/someone/code/hallways";

function hallwaysDescription(changes: Partial<StreamActionDescription>): StreamActionDescription {
  return { action: "R1-3", project_directory: HALLWAYS, kind: "load", state: "queued", step: null, streams: [], failed_because: null, ...changes };
}

const HALLWAYS_DONE = hallwaysDescription({
  state: "done",
  streams: [
    { stream: "hallways-front_door-58034f", display_name: "front_door", state: "running" },
    { stream: "hallways-back_door-2416d3", display_name: "back_door", state: "failed" },
  ],
});

/** A backend that chooses `HALLWAYS`, queues its load as `R1-3`, and answers each read of it with the next of `followedAnswers`, the last again once they run out; `null` rejects as the runtime not answering. */
function scriptedBackend(followedAnswers: readonly (StreamActionFollowed | null)[]) {
  const actionsDescribed: string[] = [];
  const foldersRun: string[] = [];
  const foldersCreated: (string | null)[] = [];
  let answerIndex = 0;
  const backend: AddStreamBackend = {
    chooseStreamProjectFolder: async () => HALLWAYS,
    createStreamProject: async (folder) => {
      foldersCreated.push(folder);
      return { action: "R1-3", stream: "kind-butte-main-e51c2f", project_directory: folder ?? "/Users/someone/streams/kind-butte" };
    },
    runStreamProject: async (folder) => {
      foldersRun.push(folder);
      return { action: "R1-3", project_directory: folder };
    },
    describeStreamAction: async (action) => {
      actionsDescribed.push(action);
      const answer = followedAnswers[Math.min(answerIndex, followedAnswers.length - 1)] ?? null;
      answerIndex += 1;
      if (answer === null) throw "no runtime answers";
      return answer;
    },
  };
  return { backend, actionsDescribed, foldersRun, foldersCreated };
}

function described(description: StreamActionDescription): StreamActionFollowed {
  return { kind: "described", description };
}

async function importHallways(addStreamFlow: AddStreamFlowOfTheWindow): Promise<void> {
  addStreamFlow.openDialog("project_folder", false);
  addStreamFlow.chooseFolder();
  await vi.advanceTimersByTimeAsync(0);
  addStreamFlow.performTheAction();
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the window's add-project flow", () => {
  it("queues the chosen folder's import, follows the load each round to its end, then stops reading it", async () => {
    vi.useFakeTimers();
    const { backend, actionsDescribed, foldersRun } = scriptedBackend([
      described(hallwaysDescription({ state: "queued" })),
      described(hallwaysDescription({ state: "in_progress", step: "compiling" })),
      null,
      described(HALLWAYS_DONE),
    ]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    await importHallways(addStreamFlow);
    expect(foldersRun).toEqual([HALLWAYS]);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following", stepsSeen: ["Queued"] });

    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following", stepsSeen: ["Queued", "Compiling"] });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following" });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "ended", ending: { kind: "done", description: HALLWAYS_DONE } });

    const readsAtTheEnd = actionsDescribed.length;
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS * 3);
    expect(actionsDescribed).toHaveLength(readsAtTheEnd);
    expect(actionsDescribed.every((action) => action === "R1-3")).toBe(true);
    expect(addStreamFlow.readRunNotice()).toBeNull();
  });

  it("creates a new project with no folder chosen, letting the runtime draw one", async () => {
    vi.useFakeTimers();
    const { backend, foldersCreated } = scriptedBackend([described(HALLWAYS_DONE)]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    addStreamFlow.openDialog("new_project", false);
    addStreamFlow.performTheAction();
    await vi.advanceTimersByTimeAsync(0);
    expect(foldersCreated).toEqual([null]);
    expect(addStreamFlow.readFlowState()).toMatchObject({
      step: "ended",
      queued: { action: "R1-3", projectDirectory: "/Users/someone/streams/kind-butte", streamOfTheScaffold: "kind-butte-main-e51c2f" },
    });
  });

  it("shows the load under way in a notice once the dialog closes, updates it each step, and says what it came to", async () => {
    vi.useFakeTimers();
    const { backend } = scriptedBackend([
      described(hallwaysDescription({ state: "queued" })),
      described(hallwaysDescription({ state: "in_progress", step: "starting" })),
      described(HALLWAYS_DONE),
    ]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    await importHallways(addStreamFlow);
    addStreamFlow.closeDialog();
    expect(addStreamFlow.readRunNotice()).toMatchObject({ kind: "following", description: { state: "queued" } });

    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readRunNotice()).toMatchObject({ kind: "following", description: { step: "starting" } });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readRunNotice()).toMatchObject({ kind: "ended", ending: { kind: "done" } });

    addStreamFlow.openDialog("project_folder", true);
    expect(addStreamFlow.readRunNotice()).toBeNull();
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "ended" });
  });

  it("keeps a dismissed notice of a load under way gone until the load ends, and reopens the dialog on the load still under way", async () => {
    vi.useFakeTimers();
    const { backend } = scriptedBackend([
      described(hallwaysDescription({ state: "queued" })),
      described(hallwaysDescription({ state: "in_progress", step: "compiling" })),
      described(hallwaysDescription({ state: "failed", failed_because: `the project directory ${HALLWAYS} does not exist` })),
    ]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    await importHallways(addStreamFlow);
    addStreamFlow.closeDialog();
    addStreamFlow.dismissRunNotice();
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readRunNotice()).toBeNull();

    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following" });
    addStreamFlow.closeDialog();
    addStreamFlow.dismissRunNotice();

    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readRunNotice()).toEqual({
      kind: "failed",
      source: "project_folder",
      lead: "Importing the project failed:",
      words: `the project directory ${HALLWAYS} does not exist`,
    });
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "form", form: { chosenFolder: HALLWAYS, refusal: { lead: "Importing the project failed:" } } });
  });

  it("ends the following when the runtime no longer holds the load", async () => {
    vi.useFakeTimers();
    const words = "Invalid configuration: the stream action `R1-3` is not held: this runtime never queued it";
    const { backend, actionsDescribed } = scriptedBackend([{ kind: "not_held", words }]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    await importHallways(addStreamFlow);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "ended", ending: { kind: "no_longer_followed", words } });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS * 2);
    expect(actionsDescribed).toEqual(["R1-3"]);
  });

  it("stops following a load whose reads fail too many times in a row, saying why", async () => {
    vi.useFakeTimers();
    const { backend, actionsDescribed } = scriptedBackend([null]);
    const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
    await importHallways(addStreamFlow);
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS * (MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW - 2));
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following" });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "ended", ending: { kind: "no_longer_followed", words: "Tatolab could not read the load: no runtime answers" } });
    expect(actionsDescribed).toHaveLength(MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW);
  });

  it("opens on the load under way however the dialog is opened, and follows a load queued while the dialog was closed and reopened", async () => {
    vi.useFakeTimers();
    const pendingRun: { answer: (() => void) | null } = { answer: null };
    const { backend } = scriptedBackend([described(hallwaysDescription({ state: "queued" })), described(HALLWAYS_DONE)]);
    const addStreamFlow = new AddStreamFlowOfTheWindow({
      ...backend,
      runStreamProject: (folder) =>
        new Promise((resolve) => {
          pendingRun.answer = () => resolve({ action: "R1-3", project_directory: folder });
        }),
    });
    addStreamFlow.openDialog("project_folder", false);
    addStreamFlow.chooseFolder();
    await vi.advanceTimersByTimeAsync(0);
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();
    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readOpenDialog()).toEqual({ source: "project_folder", isOpenedFromARunNotice: false });
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "form", form: { source: "project_folder", chosenFolder: HALLWAYS, workUnderWay: "queuing_the_load" } });
    addStreamFlow.performTheAction();

    pendingRun.answer?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "following", form: { source: "project_folder" }, queued: { action: "R1-3" } });
    await vi.advanceTimersByTimeAsync(PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(addStreamFlow.readFlowState()).toMatchObject({ step: "ended", ending: { kind: "done" } });
    expect(addStreamFlow.readOpenDialog()).toEqual({ source: "project_folder", isOpenedFromARunNotice: false });

    addStreamFlow.closeDialog();
    addStreamFlow.openDialog("new_project", false);
    expect(addStreamFlow.readFlowState()).toEqual({ step: "form", form: { source: "new_project", chosenFolder: null, workUnderWay: null, refusal: null } });
  });

  it("says in a notice that the runtime refused to queue a load once the dialog was closed", async () => {
    vi.useFakeTimers();
    const { backend } = scriptedBackend([]);
    const pendingRun: { refuse: (() => void) | null } = { refuse: null };
    const addStreamFlow = new AddStreamFlowOfTheWindow({
      ...backend,
      runStreamProject: () =>
        new Promise((_resolve, reject) => {
          pendingRun.refuse = () => reject("no runtime answers at /tmp/local-api.sock");
        }),
    });
    addStreamFlow.openDialog("project_folder", false);
    addStreamFlow.chooseFolder();
    await vi.advanceTimersByTimeAsync(0);
    addStreamFlow.performTheAction();
    addStreamFlow.closeDialog();
    expect(addStreamFlow.readRunNotice()).toBeNull();

    pendingRun.refuse?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(addStreamFlow.readRunNotice()).toEqual({ kind: "failed", source: "project_folder", lead: "Import was refused:", words: "no runtime answers at /tmp/local-api.sock" });
  });

  it("returns to the form with the runtime's refusal when it does not queue the load", async () => {
    vi.useFakeTimers();
    const { backend } = scriptedBackend([]);
    const addStreamFlow = new AddStreamFlowOfTheWindow({ ...backend, runStreamProject: async () => Promise.reject("no runtime answers at /tmp/local-api.sock") });
    await importHallways(addStreamFlow);
    expect(addStreamFlow.readFlowState()).toEqual({
      step: "form",
      form: { source: "project_folder", chosenFolder: HALLWAYS, workUnderWay: null, refusal: { lead: "Import was refused:", words: "no runtime answers at /tmp/local-api.sock" } },
    });
  });
});
