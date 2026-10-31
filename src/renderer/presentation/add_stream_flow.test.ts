import { describe, expect, it } from "vitest";
import type { ListedStream, StreamActionDescription } from "../../shared/tatolab_backend_contract";
import {
  addStreamActionOf,
  addStreamActionUnavailableBecause,
  addStreamBlockerTheFormDoesNotShow,
  addStreamDialogSection,
  addStreamRunNoticeOf,
  addStreamStepAnnouncement,
  advanceAddStreamFlow,
  canCancelTheFollowedAction,
  followedStepOrCancellingWords,
  followedStepWords,
  followingHeadingWords,
  initialAddStreamFlowState,
  presentAddStreamRunNotice,
  presentStreamsTakenIn,
  projectLoadDoneHeadingWords,
  projectLoadDoneLeadWords,
  projectLoadNotFinishedHeadingWords,
  projectLoadRequestWords,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
} from "./add_stream_flow";

function afterEvents(state: AddStreamFlowState, events: readonly AddStreamFlowEvent[]): AddStreamFlowState {
  return events.reduce(advanceAddStreamFlow, state);
}

const HALLWAYS = "/Users/someone/code/hallways";
const HALLWAYS_LOAD = { action: "R1-3", projectDirectory: HALLWAYS, streamOfTheScaffold: null };

/** `describe_stream_action` of `HALLWAYS_LOAD`, shaped as the runtime answered it recorded. */
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

function listing(stream: string, changes: Partial<ListedStream>): ListedStream {
  return {
    stream,
    display_name: stream,
    location: { project_directory: HALLWAYS, stream_function: "stream:x" },
    state: "running",
    node_count: 3,
    failed_because: null,
    action: null,
    step: null,
    ...changes,
  };
}

const importing = afterEvents(initialAddStreamFlowState("project_folder"), [
  { kind: "work_started", work: "choosing_a_folder" },
  { kind: "folder_chosen", folder: HALLWAYS },
  { kind: "work_started", work: "queuing_the_load" },
  { kind: "load_queued", queued: HALLWAYS_LOAD },
]);

describe("the add-project flow", () => {
  it("imports only once a folder is chosen, and creates a new project with or without one, the runtime drawing it", () => {
    const form = initialAddStreamFlowState("project_folder").form;
    expect(addStreamActionOf(form)).toBe("import");
    expect(addStreamActionUnavailableBecause(form, true)).toBe("Choose a project folder first.");
    expect(addStreamActionUnavailableBecause({ ...form, chosenFolder: HALLWAYS }, true)).toBeNull();

    const newProjectForm = initialAddStreamFlowState("new_project").form;
    expect(addStreamActionOf(newProjectForm)).toBe("create");
    expect(addStreamActionUnavailableBecause(newProjectForm, true)).toBeNull();
    expect(addStreamActionUnavailableBecause({ ...newProjectForm, workUnderWay: "choosing_a_folder" }, true)).toBe("Choose a folder in the dialog.");
    expect(addStreamActionUnavailableBecause({ ...newProjectForm, workUnderWay: "queuing_the_load" }, true)).toBe("Wait for the runtime to queue it.");
  });

  it("says the runtime is down in the body, and leaves a folder still to choose to the form", () => {
    const form = initialAddStreamFlowState("project_folder").form;
    expect(addStreamBlockerTheFormDoesNotShow(form, false)).toBe("The runtime isn't running, so it can't add a project.");
    expect(addStreamBlockerTheFormDoesNotShow(form, true)).toBeNull();
  });

  it("follows a queued load through its steps, each seen once, and ignores a description of another action", () => {
    expect(importing).toMatchObject({ step: "following", queued: HALLWAYS_LOAD, description: null, stepsSeen: ["Queued"], form: { workUnderWay: null } });
    const compiling = afterEvents(importing, [
      { kind: "load_described", description: hallwaysDescription({ state: "queued" }) },
      { kind: "load_described", description: hallwaysDescription({ state: "in_progress", step: "making_the_venv" }) },
      { kind: "load_described", description: hallwaysDescription({ state: "in_progress", step: "compiling" }) },
      { kind: "load_described", description: hallwaysDescription({ state: "in_progress", step: "compiling" }) },
      { kind: "load_described", description: { ...hallwaysDescription({ state: "done" }), action: "R1-99" } },
    ]);
    expect(compiling).toMatchObject({ step: "following", stepsSeen: ["Queued", "Making the environment", "Compiling"] });
    expect(compiling.step === "following" && followedStepWords(compiling.description)).toBe("Compiling");
    expect(followedStepWords(null)).toBe("Queued");
    expect(followedStepWords(hallwaysDescription({ state: "in_progress", step: "warming_up" }))).toBe("Warming up");
  });

  it("ends done with the load's streams, cancelled, or no longer held, and returns a failed load to the form in the runtime's words", () => {
    expect(advanceAddStreamFlow(importing, { kind: "load_described", description: HALLWAYS_DONE })).toMatchObject({ step: "ended", ending: { kind: "done", description: HALLWAYS_DONE } });
    expect(advanceAddStreamFlow(importing, { kind: "load_described", description: hallwaysDescription({ state: "cancelled" }) })).toMatchObject({ step: "ended", ending: { kind: "cancelled" } });
    expect(advanceAddStreamFlow(importing, { kind: "load_no_longer_followed", action: "R1-3", words: "Invalid configuration: the stream action `R1-3` is not held" })).toMatchObject({
      step: "ended",
      ending: { kind: "no_longer_followed", words: "Invalid configuration: the stream action `R1-3` is not held" },
    });

    const failed = advanceAddStreamFlow(importing, {
      kind: "load_described",
      description: hallwaysDescription({ state: "failed", failed_because: `the project directory ${HALLWAYS} does not exist` }),
    });
    expect(failed).toEqual({
      step: "form",
      form: { source: "project_folder", chosenFolder: HALLWAYS, workUnderWay: null, refusal: { lead: "Importing the project failed:", words: `the project directory ${HALLWAYS} does not exist` } },
    });
    const createFailed = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "work_started", work: "queuing_the_load" },
      { kind: "load_queued", queued: HALLWAYS_LOAD },
      { kind: "load_described", description: hallwaysDescription({ state: "failed", failed_because: null }) },
    ]);
    expect(createFailed.form.refusal).toEqual({ lead: "Creating the project failed:", words: "The runtime gave no reason." });
  });

  it("follows only a load the form is queuing, keeps one under way, ignores the end of another action, and starts afresh once it ended", () => {
    expect(advanceAddStreamFlow(initialAddStreamFlowState("project_folder"), { kind: "load_queued", queued: HALLWAYS_LOAD })).toEqual(initialAddStreamFlowState("project_folder"));
    expect(advanceAddStreamFlow(importing, { kind: "add_another" })).toBe(importing);
    expect(advanceAddStreamFlow(importing, { kind: "folder_chosen", folder: "/elsewhere" })).toBe(importing);
    expect(advanceAddStreamFlow(importing, { kind: "load_no_longer_followed", action: "R1-99", words: "gone" })).toBe(importing);
    const ended = advanceAddStreamFlow(importing, { kind: "load_described", description: HALLWAYS_DONE });
    expect(advanceAddStreamFlow(ended, { kind: "add_another" })).toEqual(initialAddStreamFlowState("project_folder"));
  });

  it("words the following view: its heading and the request it sent", () => {
    expect(followingHeadingWords("project_folder", HALLWAYS_LOAD)).toBe("Importing hallways");
    expect(followingHeadingWords("new_project", { action: "R1-7", projectDirectory: "/Users/someone/streams/kind-butte", streamOfTheScaffold: "kind-butte-main-e51c2f" })).toBe("Creating kind-butte");
    expect(projectLoadRequestWords("new_project", null)).toBe("create_project  (a folder under ~/streams)");
    expect(projectLoadRequestWords("project_folder", HALLWAYS)).toBe(`run_project  ${HALLWAYS}`);
  });

  it("lists a done load's streams through the runtime's listing, with a failed one's reason, and heads it by how many failed", () => {
    const listedStreams = [
      listing("hallways-front_door-58034f", { display_name: "Front door" }),
      listing("hallways-back_door-2416d3", { display_name: "back_door", state: "failed", node_count: null, failed_because: "RuntimeError: no camera at /dev/video0" }),
    ];
    const streamsTakenIn = presentStreamsTakenIn(HALLWAYS_DONE, listedStreams);
    expect(streamsTakenIn).toEqual([
      { stream: "hallways-front_door-58034f", displayName: "Front door", stateLabel: "Running", isRunning: true, isFailed: false, failedBecause: null },
      { stream: "hallways-back_door-2416d3", displayName: "back_door", stateLabel: "Failed", isRunning: false, isFailed: true, failedBecause: "RuntimeError: no camera at /dev/video0" },
    ]);
    expect(projectLoadDoneHeadingWords(HALLWAYS, streamsTakenIn)).toBe("hallways is running, 1 of 2 streams failed");
    expect(projectLoadDoneLeadWords(streamsTakenIn)).toBe("A failed stream's traceback is in its logs.");
    expect(projectLoadDoneHeadingWords(HALLWAYS, streamsTakenIn.slice(0, 1))).toBe("hallways is running");
    expect(projectLoadDoneLeadWords(streamsTakenIn.slice(0, 1))).toBe("Its stream is loaded.");
    expect(projectLoadDoneHeadingWords(HALLWAYS, streamsTakenIn.slice(1))).toBe("hallways failed to start");
    expect(projectLoadDoneHeadingWords(HALLWAYS, [streamsTakenIn[1], streamsTakenIn[1]])).toBe("Every stream of hallways failed");
    expect(projectLoadDoneHeadingWords(HALLWAYS, [])).toBe("The runtime loaded no stream from hallways");

    expect(presentStreamsTakenIn(HALLWAYS_DONE, null).map((streamTakenIn) => [streamTakenIn.displayName, streamTakenIn.stateLabel])).toEqual([
      ["front_door", "Running"],
      ["back_door", "Failed"],
    ]);
    expect(projectLoadNotFinishedHeadingWords("project_folder", HALLWAYS_LOAD, { kind: "cancelled", description: hallwaysDescription({ state: "cancelled" }) })).toBe(
      "Importing hallways was cancelled",
    );
    expect(projectLoadNotFinishedHeadingWords("new_project", HALLWAYS_LOAD, { kind: "no_longer_followed", words: "gone" })).toBe("Tatolab stopped following hallways");
  });

  it("moves focus on a new step or folder, and announces a folder ready to import", () => {
    const chosen = afterEvents(initialAddStreamFlowState("project_folder"), [{ kind: "folder_chosen", folder: HALLWAYS }]);
    expect(addStreamDialogSection(initialAddStreamFlowState("project_folder"))).toBe("form:project_folder:no_folder");
    expect(addStreamDialogSection(chosen)).toBe("form:project_folder:folder");
    expect(addStreamDialogSection(importing)).toBe("following:project_folder:folder");
    expect(addStreamStepAnnouncement(chosen, true)).toBe(`${HALLWAYS} is ready to import.`);
    expect(addStreamStepAnnouncement(chosen, false)).toBe("");
    expect(addStreamStepAnnouncement(importing, true)).toBe("");
  });
});

describe("the notice of a load followed away from the dialog", () => {
  it("says the step while under way, the streams once done, and a failure in the runtime's words", () => {
    const followingNotice = addStreamRunNoticeOf(importing);
    expect(followingNotice).toEqual({ kind: "following", source: "project_folder", queued: HALLWAYS_LOAD, description: null, cancel: null });
    expect(followingNotice === null ? null : presentAddStreamRunNotice(followingNotice, null)).toEqual({
      title: "Importing hallways",
      detail: "Queued…",
      tone: "plain",
      isUnderWay: true,
      canCancel: true,
    });

    const ended = advanceAddStreamFlow(importing, { kind: "load_described", description: HALLWAYS_DONE });
    const endedNotice = addStreamRunNoticeOf(ended);
    expect(endedNotice === null ? null : presentAddStreamRunNotice(endedNotice, null)).toEqual({
      title: "hallways is running, 1 of 2 streams failed",
      detail: "front_door: Running · back_door: Failed",
      tone: "warning",
      isUnderWay: false,
      canCancel: false,
    });

    const failed = advanceAddStreamFlow(importing, { kind: "load_described", description: hallwaysDescription({ state: "failed", failed_because: "missing" }) });
    const failedNotice = addStreamRunNoticeOf(failed);
    expect(failedNotice === null ? null : presentAddStreamRunNotice(failedNotice, null)).toEqual({
      title: "Importing the project failed",
      detail: "missing",
      tone: "failure",
      isUnderWay: false,
      canCancel: false,
    });

    const notHeld = advanceAddStreamFlow(importing, { kind: "load_no_longer_followed", action: "R1-3", words: "Invalid configuration: not held" });
    const notHeldNotice = addStreamRunNoticeOf(notHeld);
    expect(notHeldNotice === null ? null : presentAddStreamRunNotice(notHeldNotice, null)).toMatchObject({ title: "Tatolab stopped following hallways", tone: "warning" });

    expect(addStreamRunNoticeOf(initialAddStreamFlowState("project_folder"))).toBeNull();
    const refusedQueuing = afterEvents(initialAddStreamFlowState("project_folder"), [{ kind: "work_refused", lead: "Import was refused:", words: "no runtime answers" }]);
    const refusedQueuingNotice = addStreamRunNoticeOf(refusedQueuing);
    expect(refusedQueuingNotice === null ? null : presentAddStreamRunNotice(refusedQueuingNotice, null)).toMatchObject({ title: "Import was refused", detail: "no runtime answers", tone: "failure" });
    const folderDialogRefused = afterEvents(initialAddStreamFlowState("project_folder"), [{ kind: "work_refused", lead: "The folder dialog was refused:", words: "no display" }]);
    expect(addStreamRunNoticeOf(folderDialogRefused)).toBeNull();
    expect(projectLoadDoneHeadingWords(HALLWAYS, [])).toBe("The runtime loaded no stream from hallways");
  });
});

describe("Cancel on a followed load", () => {
  const alreadyCancelledRefusal = "Invalid configuration: the stream action `R1-3` is already cancelled, so there is nothing to cancel";

  it("says Cancelling while the cancel is asked or the runtime ends the load, then ends at cancelled when the following reads it", () => {
    const asked = advanceAddStreamFlow(importing, { kind: "cancel_asked", action: "R1-3" });
    expect(asked).toMatchObject({ step: "following", cancel: { kind: "asking" } });
    expect(canCancelTheFollowedAction(asked.step === "following" ? asked.cancel : null)).toBe(false);
    const answered = advanceAddStreamFlow(asked, { kind: "cancel_answered", action: "R1-3" });
    expect(answered).toMatchObject({ step: "following", cancel: { kind: "answered" } });
    expect(answered.step === "following" ? followedStepOrCancellingWords(answered.description, answered.cancel) : null).toBe("Cancelling");
    const answeredNotice = addStreamRunNoticeOf(answered);
    expect(answeredNotice === null ? null : presentAddStreamRunNotice(answeredNotice, null)).toMatchObject({ detail: "Cancelling…", canCancel: false, isUnderWay: true });

    const cancelled = advanceAddStreamFlow(answered, { kind: "load_described", description: hallwaysDescription({ state: "cancelled" }) });
    expect(cancelled).toMatchObject({ step: "ended", ending: { kind: "cancelled" } });
    expect(advanceAddStreamFlow(cancelled, { kind: "cancel_answered", action: "R1-3" })).toBe(cancelled);
    expect(advanceAddStreamFlow(cancelled, { kind: "add_another" })).toMatchObject({ step: "form", form: { source: "project_folder", chosenFolder: null } });
  });

  it("keeps a refused cancel's words under the step, Cancel pressable again, and ignores a cancel of another action", () => {
    const refused = afterEvents(importing, [
      { kind: "cancel_asked", action: "R1-3" },
      { kind: "cancel_refused", action: "R1-3", words: alreadyCancelledRefusal },
    ]);
    expect(refused).toMatchObject({ step: "following", cancel: { kind: "refused", words: alreadyCancelledRefusal } });
    expect(refused.step === "following" ? followedStepOrCancellingWords(refused.description, refused.cancel) : null).toBe("Queued");
    expect(canCancelTheFollowedAction(refused.step === "following" ? refused.cancel : null)).toBe(true);
    const refusedNotice = addStreamRunNoticeOf(refused);
    expect(refusedNotice === null ? null : presentAddStreamRunNotice(refusedNotice, null)).toEqual({
      title: "Importing hallways",
      detail: `Queued… Cancel was refused: ${alreadyCancelledRefusal}`,
      tone: "warning",
      isUnderWay: true,
      canCancel: true,
    });
    expect(advanceAddStreamFlow(importing, { kind: "cancel_asked", action: "R9-9" })).toBe(importing);
    expect(advanceAddStreamFlow(initialAddStreamFlowState("new_project"), { kind: "cancel_asked", action: "R1-3" })).toEqual(initialAddStreamFlowState("new_project"));
  });
});
