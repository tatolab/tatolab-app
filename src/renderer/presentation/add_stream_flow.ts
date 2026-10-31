import type { ListedStream, StreamActionDescription, StreamTakenInByAnAction } from "../../shared/tatolab_backend_contract";
import { labelUnknownStreamState, presentStreamState, streamActionStepWords } from "./stream_presentation";

/** Where a new project comes from: a project folder the person has, or a new project the runtime writes. */
export type AddStreamSource = "project_folder" | "new_project";

/** The load `create_project` or `run_project` queued, which the flow follows with `describe_stream_action`. */
export interface QueuedProjectLoad {
  action: string;
  projectDirectory: string;
  /** The scaffold's stream id `create_project` answered; `null` for `run_project`, whose streams are known only as it loads them. */
  streamOfTheScaffold: string | null;
}

/** What the backend is doing for the form while it waits. */
export type AddStreamWorkUnderWay = "choosing_a_folder" | "queuing_the_load";

/** Everything the form holds, kept while a load runs so a failed one returns to it. */
export interface AddStreamForm {
  source: AddStreamSource;
  /** The folder chosen in the app's dialog; `null` until one is chosen, which for a new project leaves the runtime to draw one under `~/streams`. */
  chosenFolder: string | null;
  /** The last refusal or failure, in its own words, after the window's lead naming what failed. */
  refusal: { lead: string; words: string } | null;
  workUnderWay: AddStreamWorkUnderWay | null;
}

/** How a followed load ended, other than failing, which returns to the form: done with its streams, cancelled, or no longer followed, as the runtime no longer holds it or its description cannot be read. */
export type ProjectLoadEnding =
  | { kind: "done"; description: StreamActionDescription }
  | { kind: "cancelled"; description: StreamActionDescription }
  | { kind: "no_longer_followed"; words: string };

/** The add-project dialog: the form, a queued load followed through its steps, or how it ended. */
export type AddStreamFlowState =
  | { step: "form"; form: AddStreamForm }
  | { step: "following"; form: AddStreamForm; queued: QueuedProjectLoad; description: StreamActionDescription | null; stepsSeen: readonly string[] }
  | { step: "ended"; form: AddStreamForm; queued: QueuedProjectLoad; ending: ProjectLoadEnding };

/** What happened in the dialog, from the person or from the backend's answer. */
export type AddStreamFlowEvent =
  | { kind: "work_started"; work: AddStreamWorkUnderWay }
  | { kind: "folder_dialog_cancelled" }
  | { kind: "folder_chosen"; folder: string }
  | { kind: "work_refused"; lead: string; words: string }
  | { kind: "load_queued"; queued: QueuedProjectLoad }
  | { kind: "load_described"; description: StreamActionDescription }
  | { kind: "load_no_longer_followed"; action: string; words: string }
  | { kind: "add_another" };

/** The form as it first shows for `source`, nothing chosen yet. */
export function emptyAddStreamForm(source: AddStreamSource): AddStreamForm {
  return { source, chosenFolder: null, refusal: null, workUnderWay: null };
}

/** The dialog as it first shows for `source`. */
export function initialAddStreamFlowState(source: AddStreamSource): AddStreamFlowState {
  return { step: "form", form: emptyAddStreamForm(source) };
}

/** The last part of `folder`, which the runtime names a project's streams after. */
export function folderBaseName(folder: string): string {
  return folder.replace(/\/+$/, "").split("/").at(-1) ?? "";
}

/** What the folder row says of a new project before a folder is chosen: the runtime draws one. */
export const NEW_PROJECT_FOLDER_THE_RUNTIME_DRAWS_WORDS = "A new folder under ~/streams";

/** The lead of a create that failed, before the runtime's own words. */
export const CREATING_THE_PROJECT_FAILED_LEAD = "Creating the project failed:";
/** The lead of an import that failed, before the runtime's own words. */
export const IMPORTING_THE_PROJECT_FAILED_LEAD = "Importing the project failed:";
/** The lead of the runtime's refusal to queue a create, before its own words. */
export const CREATE_WAS_REFUSED_LEAD = "Create was refused:";
/** The lead of the runtime's refusal to queue an import, before its own words. */
export const IMPORT_WAS_REFUSED_LEAD = "Import was refused:";
/** What a failed load says when the runtime gave no reason. */
const NO_REASON_GIVEN_WORDS = "The runtime gave no reason.";

/** The lead a failed load of `source` gets. */
export function projectLoadFailedLead(source: AddStreamSource): string {
  return source === "new_project" ? CREATING_THE_PROJECT_FAILED_LEAD : IMPORTING_THE_PROJECT_FAILED_LEAD;
}

/** The lead the runtime's refusal to queue a load of `source` gets. */
export function projectLoadRefusedLead(source: AddStreamSource): string {
  return source === "new_project" ? CREATE_WAS_REFUSED_LEAD : IMPORT_WAS_REFUSED_LEAD;
}

function withForm(state: AddStreamFlowState, changes: Partial<AddStreamForm>): AddStreamFlowState {
  return { step: "form", form: { ...state.form, ...changes } };
}

function stepsSeenAfter(stepsSeen: readonly string[], description: StreamActionDescription): readonly string[] {
  const stepWords = followedStepWords(description);
  return stepsSeen.at(-1) === stepWords ? stepsSeen : [...stepsSeen, stepWords];
}

/** The dialog after `event`. A form event changes only the form step: one that arrives while a load runs or once it ended is about a form no longer shown. */
export function advanceAddStreamFlow(state: AddStreamFlowState, event: AddStreamFlowEvent): AddStreamFlowState {
  switch (event.kind) {
    case "load_described":
      return state.step === "following" && event.description.action === state.queued.action ? advanceTheFollowing(state, event.description) : state;
    case "load_no_longer_followed":
      return state.step === "following" && event.action === state.queued.action
        ? { step: "ended", form: state.form, queued: state.queued, ending: { kind: "no_longer_followed", words: event.words } }
        : state;
    case "add_another":
      return state.step === "following" ? state : initialAddStreamFlowState(state.form.source);
  }
  return state.step === "form" ? advanceTheForm(state, event) : state;
}

/** Whether a stream action has ended: done, cancelled or failed; any other state, one newer than this app among them, is still under way. */
export function isStreamActionEnded(description: StreamActionDescription): boolean {
  return description.state === "done" || description.state === "cancelled" || description.state === "failed";
}

function advanceTheFollowing(state: Extract<AddStreamFlowState, { step: "following" }>, description: StreamActionDescription): AddStreamFlowState {
  switch (description.state) {
    case "done":
      return { step: "ended", form: state.form, queued: state.queued, ending: { kind: "done", description } };
    case "cancelled":
      return { step: "ended", form: state.form, queued: state.queued, ending: { kind: "cancelled", description } };
    case "failed":
      return withForm(state, { refusal: { lead: projectLoadFailedLead(state.form.source), words: description.failed_because ?? NO_REASON_GIVEN_WORDS } });
    default:
      return { ...state, description, stepsSeen: stepsSeenAfter(state.stepsSeen, description) };
  }
}

function advanceTheForm(state: AddStreamFlowState, event: AddStreamFlowEvent): AddStreamFlowState {
  switch (event.kind) {
    case "work_started":
      return withForm(state, { workUnderWay: event.work, refusal: null });
    case "folder_dialog_cancelled":
      return withForm(state, { workUnderWay: null });
    case "folder_chosen":
      return withForm(state, { chosenFolder: event.folder, workUnderWay: null });
    case "work_refused":
      return withForm(state, { refusal: { lead: event.lead, words: event.words }, workUnderWay: null });
    case "load_queued":
      if (state.form.workUnderWay !== "queuing_the_load") return state;
      return { step: "following", form: { ...state.form, workUnderWay: null, refusal: null }, queued: event.queued, description: null, stepsSeen: [QUEUED_STEP_WORDS] };
    case "load_described":
    case "load_no_longer_followed":
    case "add_another":
      return state;
  }
}

/** The dialog's one action: Create, which has the runtime write a new project and load it; Import, which has it load a project folder. */
export type AddStreamAction = "create" | "import";

/** Each action's button label. */
export const ADD_STREAM_ACTION_LABELS: Record<AddStreamAction, string> = { create: "Create", import: "Import" };

/** The action the form offers for its source. */
export function addStreamActionOf(form: AddStreamForm): AddStreamAction {
  return form.source === "new_project" ? "create" : "import";
}

const THE_RUNTIME_IS_NOT_RUNNING = "The runtime isn't running, so it can't add a project.";

/** Why the dialog's action cannot be pressed now, or `null` when it can. A new project needs no folder: the runtime draws one. */
export function addStreamActionUnavailableBecause(form: AddStreamForm, isTheRuntimeRunning: boolean): string | null {
  if (!isTheRuntimeRunning) return THE_RUNTIME_IS_NOT_RUNNING;
  switch (form.workUnderWay) {
    case "choosing_a_folder":
      return "Choose a folder in the dialog.";
    case "queuing_the_load":
      return "Wait for the runtime to queue it.";
    case null:
      break;
  }
  if (form.source === "project_folder" && form.chosenFolder === null) return "Choose a project folder first.";
  return null;
}

/** Why the action cannot be pressed, said in the dialog's body where the form does not already show it: the runtime down. A folder still to choose shows in the form itself. */
export function addStreamBlockerTheFormDoesNotShow(form: AddStreamForm, isTheRuntimeRunning: boolean): string | null {
  const reason = addStreamActionUnavailableBecause(form, isTheRuntimeRunning);
  return reason === THE_RUNTIME_IS_NOT_RUNNING ? reason : null;
}

/** What a load waiting its turn in its project's queue is called among its steps. */
const QUEUED_STEP_WORDS = "Queued";

/** A followed load's step, capitalised: Queued, Making the environment, Compiling, Starting, or one newer than this app. */
export function followedStepWords(description: StreamActionDescription | null): string {
  if (description === null || description.state === "queued") return QUEUED_STEP_WORDS;
  const stepWords = description.step === null ? labelUnknownStreamState(description.state).toLowerCase() : streamActionStepWords(description.step);
  return stepWords.charAt(0).toUpperCase() + stepWords.slice(1);
}

/** The heading of a load under way: Creating or Importing, and the project's folder name. */
export function followingHeadingWords(source: AddStreamSource, queued: QueuedProjectLoad): string {
  return `${source === "new_project" ? "Creating" : "Importing"} ${folderBaseName(queued.projectDirectory)}`;
}

/** The request a load sent, as the following view's first line: the tool and the folder, or none when the runtime draws it. */
export function projectLoadRequestWords(source: AddStreamSource, chosenFolder: string | null): string {
  return source === "new_project" ? `create_project  ${chosenFolder ?? "(a folder under ~/streams)"}` : `run_project  ${chosenFolder ?? ""}`;
}

/** A stream an ended load took in, as the done view lists it: its name and state as the runtime's listing now shows them, and why it failed. */
export interface StreamTakenInPresentation {
  stream: string;
  displayName: string;
  stateLabel: string;
  isRunning: boolean;
  isFailed: boolean;
  /** Why it failed, from the runtime's listing; `null` when it did not or the listing does not say. */
  failedBecause: string | null;
}

/** Each stream `description` took in, read through the runtime's listing where it lists the stream, so a rename or a later state shows. */
export function presentStreamsTakenIn(description: StreamActionDescription, listedStreams: readonly ListedStream[] | null): StreamTakenInPresentation[] {
  return description.streams.map((streamTakenIn) => presentStreamTakenIn(streamTakenIn, listedStreams?.find((listing) => listing.stream === streamTakenIn.stream) ?? null));
}

function presentStreamTakenIn(streamTakenIn: StreamTakenInByAnAction, listing: ListedStream | null): StreamTakenInPresentation {
  const state = listing?.state ?? streamTakenIn.state;
  return {
    stream: streamTakenIn.stream,
    displayName: listing?.display_name ?? streamTakenIn.display_name,
    stateLabel: listing === null ? labelUnknownStreamState(state ?? "preparing") : presentStreamState(listing).label,
    isRunning: state === "running",
    isFailed: state === "failed",
    failedBecause: listing?.failed_because ?? null,
  };
}

/** The heading of a load that ended done: the project running, some of its streams failed, all of them failed, or none taken in. */
export function projectLoadDoneHeadingWords(projectDirectory: string, streamsTakenIn: readonly StreamTakenInPresentation[]): string {
  const projectName = folderBaseName(projectDirectory);
  const failedCount = streamsTakenIn.filter((streamTakenIn) => streamTakenIn.isFailed).length;
  if (streamsTakenIn.length === 0) return `The runtime loaded no stream from ${projectName}`;
  if (failedCount === 0) return `${projectName} is running`;
  if (failedCount === streamsTakenIn.length) return streamsTakenIn.length === 1 ? `${projectName} failed to start` : `Every stream of ${projectName} failed`;
  return `${projectName} is running, ${failedCount} of ${streamsTakenIn.length} streams failed`;
}

/** What the done view says under its heading. */
export function projectLoadDoneLeadWords(streamsTakenIn: readonly StreamTakenInPresentation[]): string {
  if (streamsTakenIn.some((streamTakenIn) => streamTakenIn.isFailed)) return "A failed stream's traceback is in its logs.";
  return streamsTakenIn.length === 1 ? "Its stream is loaded." : `Its ${streamsTakenIn.length} streams are loaded.`;
}

/** The heading of a load that ended without loading: cancelled, or no longer held. */
export function projectLoadNotFinishedHeadingWords(source: AddStreamSource, queued: QueuedProjectLoad, ending: Exclude<ProjectLoadEnding, { kind: "done" }>): string {
  const projectName = folderBaseName(queued.projectDirectory);
  if (ending.kind === "no_longer_followed") return `Tatolab stopped following ${projectName}`;
  return `${source === "new_project" ? "Creating" : "Importing"} ${projectName} was cancelled`;
}

/** What a load that ended without loading says under its heading. */
export function projectLoadNotFinishedLeadWords(ending: Exclude<ProjectLoadEnding, { kind: "done" }>): string {
  return ending.kind === "no_longer_followed" ? `${ending.words}. The Streams list shows where its streams are.` : "The runtime cancelled the load before it ended.";
}

/**
 * Which part of the dialog shows: a step, and within the form its source and whether a folder is chosen. Focus moves to
 * the part's heading when it changes and the control that held focus is gone.
 */
export function addStreamDialogSection(state: AddStreamFlowState): string {
  return [state.step, state.form.source, state.form.chosenFolder === null ? "no_folder" : "folder"].join(":");
}

/** What the dialog's status line says, for a screen reader, of a folder ready to import while Import can be pressed. Refusals speak through their own alert, and each step through its heading. */
export function addStreamStepAnnouncement(state: AddStreamFlowState, isTheRuntimeRunning: boolean): string {
  if (state.step !== "form" || state.form.source !== "project_folder" || state.form.chosenFolder === null) return "";
  return addStreamActionUnavailableBecause(state.form, isTheRuntimeRunning) === null ? `${state.form.chosenFolder} is ready to import.` : "";
}

/** A load the window followed while the dialog was closed, for the notice that says where it has got to or what it came to. */
export type AddStreamRunNotice =
  | { kind: "following"; source: AddStreamSource; queued: QueuedProjectLoad; description: StreamActionDescription | null }
  | { kind: "ended"; source: AddStreamSource; queued: QueuedProjectLoad; ending: ProjectLoadEnding }
  | { kind: "failed"; source: AddStreamSource; lead: string; words: string };

/** The notice for the dialog as a load left it: under way, ended, failed or refused back to the form; `null` for a dialog no load left. */
export function addStreamRunNoticeOf(state: AddStreamFlowState): AddStreamRunNotice | null {
  const source = state.form.source;
  switch (state.step) {
    case "following":
      return { kind: "following", source, queued: state.queued, description: state.description };
    case "ended":
      return { kind: "ended", source, queued: state.queued, ending: state.ending };
    case "form": {
      const refusal = state.form.refusal;
      const isTheLoadsFailure = refusal !== null && (refusal.lead === projectLoadFailedLead(source) || refusal.lead === projectLoadRefusedLead(source));
      return isTheLoadsFailure ? { kind: "failed", source, lead: refusal.lead, words: refusal.words } : null;
    }
  }
}

/** How bad a notice's news is: plain, a warning to read, or a failure. */
export type NoticeTone = "plain" | "warning" | "failure";

/** A load's notice in words: its title, what it says under it, how bad it is, and whether it is still under way. */
export interface AddStreamRunNoticePresentation {
  title: string;
  detail: string;
  tone: NoticeTone;
  isUnderWay: boolean;
}

/** A load's notice in the dialog's own words: its step while under way, its streams once done, and a failure as the runtime gave it. */
export function presentAddStreamRunNotice(notice: AddStreamRunNotice, listedStreams: readonly ListedStream[] | null): AddStreamRunNoticePresentation {
  switch (notice.kind) {
    case "following":
      return { title: followingHeadingWords(notice.source, notice.queued), detail: `${followedStepWords(notice.description)}…`, tone: "plain", isUnderWay: true };
    case "failed":
      return { title: notice.lead.replace(/:$/, ""), detail: notice.words, tone: "failure", isUnderWay: false };
    case "ended": {
      const ending = notice.ending;
      if (ending.kind !== "done") {
        return {
          title: projectLoadNotFinishedHeadingWords(notice.source, notice.queued, ending),
          detail: projectLoadNotFinishedLeadWords(ending),
          tone: "warning",
          isUnderWay: false,
        };
      }
      const streamsTakenIn = presentStreamsTakenIn(ending.description, listedStreams);
      const failedCount = streamsTakenIn.filter((streamTakenIn) => streamTakenIn.isFailed).length;
      return {
        title: projectLoadDoneHeadingWords(notice.queued.projectDirectory, streamsTakenIn),
        detail: streamsTakenIn.map((streamTakenIn) => `${streamTakenIn.displayName}: ${streamTakenIn.stateLabel}`).join(" · "),
        tone: streamsTakenIn.length === 0 ? "warning" : failedCount === 0 ? "plain" : failedCount === streamsTakenIn.length ? "failure" : "warning",
        isUnderWay: false,
      };
    }
  }
}
