import type { PythonForNewEnvironments, StreamProjectFolderReport, StreamProjectRunOutcome, StreamRunAnswer } from "../../shared/tatolab_backend_contract";

/** Where a new stream starts from: a project folder the person has, or a new project `tatolab new` writes. */
export type AddStreamSource = "project_folder" | "new_project";

/** The run the window asks `run_stream` for: a folder, the stream function as `tatolab run` takes it, and the name to load it under. */
export interface AddStreamRunRequest {
  folder: string;
  streamFunction: string | null;
  streamName: string | null;
}

/** What the backend is doing for the form while it waits. */
export type AddStreamWorkUnderWay = "choosing_a_folder" | "creating_the_project";

/** Everything the form holds, kept while a run compiles so a refusal returns to it. */
export interface AddStreamForm {
  source: AddStreamSource;
  /** The folder the person chose to run, with what it holds; `null` until one is chosen. */
  projectFolder: StreamProjectFolderReport | null;
  /** The new project's directory, proposed or chosen, then what `tatolab new` wrote there; `null` until proposed. */
  newProjectFolder: StreamProjectFolderReport | null;
  hasCreatedTheNewProject: boolean;
  /** The `@stream` function chosen when the folder's `stream.py` has several. */
  chosenStreamFunction: string | null;
  streamName: string;
  /** The runtime's refusal of a name a listed stream holds, with the first name none holds. */
  nameTaken: { refusal: string; freeName: string } | null;
  /** The last refusal the backend gave, in its own words, after the window's lead naming what was refused. */
  refusal: { lead: string; words: string } | null;
  workUnderWay: AddStreamWorkUnderWay | null;
}

/** The add-stream dialog: the form, a run compiling since `startedAtMs` (the app setting up the folder's Python first when it had none), or the stream running. */
export type AddStreamFlowState =
  | { step: "form"; form: AddStreamForm }
  | { step: "compiling"; form: AddStreamForm; request: AddStreamRunRequest; startedAtMs: number; makesThePythonEnvironmentFirst: boolean }
  | { step: "running"; form: AddStreamForm; request: AddStreamRunRequest; answer: StreamRunAnswer };

/** What happened in the dialog, from the person or from the backend's answer. */
export type AddStreamFlowEvent =
  | { kind: "source_chosen"; source: AddStreamSource }
  | { kind: "work_started"; work: AddStreamWorkUnderWay }
  | { kind: "folder_dialog_cancelled" }
  | { kind: "project_folder_answered"; report: StreamProjectFolderReport }
  | { kind: "new_project_folder_answered"; report: StreamProjectFolderReport }
  | { kind: "new_project_created"; report: StreamProjectFolderReport }
  | { kind: "stream_function_chosen"; streamFunction: string }
  | { kind: "stream_name_edited"; streamName: string }
  | { kind: "work_refused"; lead: string; words: string }
  | { kind: "run_started"; request: AddStreamRunRequest; nowMs: number }
  | { kind: "run_answered"; outcome: StreamProjectRunOutcome }
  | { kind: "run_refused"; words: string }
  | { kind: "add_another" };

/** The form as it first shows for `source`, nothing chosen yet. */
export function emptyAddStreamForm(source: AddStreamSource): AddStreamForm {
  return {
    source,
    projectFolder: null,
    newProjectFolder: null,
    hasCreatedTheNewProject: false,
    chosenStreamFunction: null,
    streamName: "",
    nameTaken: null,
    refusal: null,
    workUnderWay: null,
  };
}

/** The dialog as it first shows for `source`. */
export function initialAddStreamFlowState(source: AddStreamSource): AddStreamFlowState {
  return { step: "form", form: emptyAddStreamForm(source) };
}

/** The last part of `folder`, which names a new project's stream. */
export function folderBaseName(folder: string): string {
  return folder.replace(/\/+$/, "").split("/").at(-1) ?? "";
}

/** The folder a run would compile now: the chosen project folder, or the new project once `tatolab new` wrote it. */
export function folderToRun(form: AddStreamForm): StreamProjectFolderReport | null {
  if (form.source === "project_folder") return form.projectFolder;
  return form.hasCreatedTheNewProject ? form.newProjectFolder : null;
}

/** The stream function to ask `run_stream` for: none for a `stream.py` with one or no `@stream`, which the runtime finds itself, else the chosen one as `tatolab run` takes it. */
export function streamFunctionArgumentFor(report: StreamProjectFolderReport, chosenStreamFunction: string | null): string | null {
  if (report.stream_functions.length <= 1 || chosenStreamFunction === null) return null;
  return `stream.py:${chosenStreamFunction}`;
}

/** The run the form asks for now; `null` until there is a folder to run. A blank name lets the runtime name the stream after its function. */
export function runRequestOf(form: AddStreamForm): AddStreamRunRequest | null {
  const folder = folderToRun(form);
  if (folder === null) return null;
  const streamName = form.streamName.trim();
  return { folder: folder.folder, streamFunction: streamFunctionArgumentFor(folder, form.chosenStreamFunction), streamName: streamName === "" ? null : streamName };
}

function withForm(state: AddStreamFlowState, changes: Partial<AddStreamForm>): AddStreamFlowState {
  return { step: "form", form: { ...state.form, ...changes } };
}

function streamFunctionsChoiceAfter(previous: StreamProjectFolderReport | null, report: StreamProjectFolderReport, form: AddStreamForm): Pick<AddStreamForm, "chosenStreamFunction" | "streamName"> {
  const isTheSameFolder = previous?.folder === report.folder;
  if (isTheSameFolder && form.chosenStreamFunction !== null && report.stream_functions.includes(form.chosenStreamFunction)) {
    return { chosenStreamFunction: form.chosenStreamFunction, streamName: form.streamName };
  }
  const firstStreamFunction = report.stream_functions[0] ?? null;
  return { chosenStreamFunction: firstStreamFunction, streamName: isTheSameFolder && form.streamName !== "" ? form.streamName : (firstStreamFunction ?? "") };
}

/** The dialog after `event`. An event of the form changes only the form step: one that arrives while a run compiles or once it runs is about a form no longer shown. */
export function advanceAddStreamFlow(state: AddStreamFlowState, event: AddStreamFlowEvent): AddStreamFlowState {
  const form = state.form;
  switch (event.kind) {
    case "run_answered":
      if (state.step !== "compiling") return state;
      switch (event.outcome.kind) {
        case "running":
          return { step: "running", form, request: state.request, answer: event.outcome.answer };
        case "name_taken":
          return withForm(state, { nameTaken: { refusal: event.outcome.refusal, freeName: event.outcome.free_name } });
        case "python_environment_not_made":
          return withForm(state, { refusal: { lead: PYTHON_ENVIRONMENT_NOT_MADE_LEAD, words: event.outcome.words } });
      }
    case "run_refused":
      return state.step === "compiling" ? withForm(state, { refusal: { lead: ADDING_THE_STREAM_REFUSED_LEAD, words: event.words } }) : state;
    case "add_another":
      return initialAddStreamFlowState(form.source);
    case "source_chosen":
      if (state.step === "running") return initialAddStreamFlowState(event.source);
      break;
  }
  return state.step === "form" ? advanceTheForm(state, event) : state;
}

function advanceTheForm(state: AddStreamFlowState, event: AddStreamFlowEvent): AddStreamFlowState {
  const form = state.form;
  switch (event.kind) {
    case "source_chosen":
      return withForm(state, { source: event.source, nameTaken: null, refusal: null, workUnderWay: null });
    case "work_started":
      return withForm(state, { workUnderWay: event.work, refusal: null });
    case "folder_dialog_cancelled":
      return withForm(state, { workUnderWay: null });
    case "project_folder_answered":
      return withForm(state, {
        projectFolder: event.report,
        ...streamFunctionsChoiceAfter(form.projectFolder, event.report, form),
        nameTaken: form.projectFolder?.folder === event.report.folder ? form.nameTaken : null,
        workUnderWay: null,
      });
    case "new_project_folder_answered":
      return withForm(state, {
        newProjectFolder: event.report,
        hasCreatedTheNewProject: form.hasCreatedTheNewProject && form.newProjectFolder?.folder === event.report.folder,
        streamName: form.newProjectFolder?.folder === event.report.folder ? form.streamName : folderBaseName(event.report.folder),
        workUnderWay: null,
      });
    case "new_project_created":
      return withForm(state, {
        newProjectFolder: event.report,
        hasCreatedTheNewProject: true,
        chosenStreamFunction: event.report.stream_functions[0] ?? null,
        workUnderWay: null,
      });
    case "stream_function_chosen":
      return withForm(state, { chosenStreamFunction: event.streamFunction, streamName: event.streamFunction, nameTaken: null });
    case "stream_name_edited":
      return withForm(state, { streamName: event.streamName, nameTaken: null });
    case "work_refused":
      return withForm(state, { refusal: { lead: event.lead, words: event.words }, workUnderWay: null });
    case "run_started":
      return {
        step: "compiling",
        form: { ...form, nameTaken: null, refusal: null, streamName: event.request.streamName ?? form.streamName },
        request: event.request,
        startedAtMs: event.nowMs,
        makesThePythonEnvironmentFirst: folderToRun(form)?.python_environment.kind === "missing",
      };
    case "run_answered":
    case "run_refused":
    case "add_another":
      return state;
  }
}

/** The dialog's one action: Create, for a new project `tatolab new` has not written yet, which writes it and then adds it; Add, for a folder that holds a project. */
export type AddStreamAction = "create" | "add";

/** Each action's button label. */
export const ADD_STREAM_ACTION_LABELS: Record<AddStreamAction, string> = { create: "Create", add: "Add" };

/** The action the form offers now: Create until `tatolab new` has written the new project, Add after, and for a project folder. */
export function addStreamActionOf(form: AddStreamForm): AddStreamAction {
  return form.source === "new_project" && !form.hasCreatedTheNewProject ? "create" : "add";
}

const THE_RUNTIME_IS_NOT_RUNNING = "The runtime isn't running, so it can't add a stream.";
const NO_PYTHON_TO_SET_UP_A_PROJECT_WITH = "This build of Tatolab carries no Python, so it can't set up this project. Run uv sync in its folder.";

/** Why the dialog's action cannot be pressed now, or `null` when it can. A folder with no `.venv` can be added while the app has a Python to set it up with. */
export function addStreamActionUnavailableBecause(form: AddStreamForm, isTheRuntimeRunning: boolean, pythonForNewEnvironments: PythonForNewEnvironments): string | null {
  if (!isTheRuntimeRunning) return THE_RUNTIME_IS_NOT_RUNNING;
  switch (form.workUnderWay) {
    case "choosing_a_folder":
      return "Choose a folder in the dialog.";
    case "creating_the_project":
      return "Wait for tatolab new to write the project.";
    case null:
      break;
  }
  if (addStreamActionOf(form) === "create") {
    if (form.newProjectFolder === null) return "Choose a directory for the new project.";
    return pythonForNewEnvironments.kind === "built_in_not_offered" ? NO_PYTHON_TO_SET_UP_A_PROJECT_WITH : null;
  }
  const folder = folderToRun(form);
  if (folder === null) return "Choose a project folder first.";
  if (folder.python_environment.kind === "missing" && pythonForNewEnvironments.kind === "built_in_not_offered") return NO_PYTHON_TO_SET_UP_A_PROJECT_WITH;
  if (form.nameTaken !== null) return "Choose another name, or use the one offered.";
  return null;
}

/**
 * Why Add or Create cannot be pressed, said in the dialog's body where the form does not already show it: the runtime
 * down, or no Python to set the project up with. A folder or name still to choose shows in the form itself.
 */
export function addStreamBlockerTheFormDoesNotShow(form: AddStreamForm, isTheRuntimeRunning: boolean, pythonForNewEnvironments: PythonForNewEnvironments): string | null {
  const reason = addStreamActionUnavailableBecause(form, isTheRuntimeRunning, pythonForNewEnvironments);
  return reason === THE_RUNTIME_IS_NOT_RUNNING || reason === NO_PYTHON_TO_SET_UP_A_PROJECT_WITH ? reason : null;
}

/** Whole seconds a run has been compiling, as the compile view counts them. */
export function compilingForWords(startedAtMs: number, nowMs: number): string {
  return `${Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))}s`;
}

/** What a running stream's done view says about its load: whether it replaced the project's kept stream, and its warnings to read or that it compiled cleanly. */
export function streamRunningSummary(answer: StreamRunAnswer): string {
  const replaced = answer.replaced_the_kept_record ? "It replaced the stream this project kept before. " : "";
  const warningCount = answer.compile_warnings.length;
  if (warningCount === 1) return `${replaced}It compiled with a warning. Read it before you rely on this stream.`;
  if (warningCount > 1) return `${replaced}It compiled with ${warningCount} warnings. Read them before you rely on this stream.`;
  return `${replaced}It compiled cleanly.`;
}

/** How many nodes a stream has, in words. */
export function nodeCountWords(nodeCount: number): string {
  return `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"}`;
}

/** One row of a folder's check: a `@stream` function found in its `stream.py`, or `stream.py` itself when it holds none or is missing. */
export interface StreamFunctionCheck {
  checked: "stream_function" | "stream_file";
  name: string;
  isFound: boolean;
  /** Why `stream.py` stands in for its functions; `null` on a function's row, which is its name alone. */
  detail: string | null;
}

/** A row for each `@stream` function `stream.py` holds, in file order; one row for `stream.py` when it is missing or marks none. */
export function presentStreamFunctionChecks(report: StreamProjectFolderReport): StreamFunctionCheck[] {
  if (!report.stream_file_present) return [{ checked: "stream_file", name: "stream.py", isFound: false, detail: "The stream function the runtime compiles lives in stream.py." }];
  if (report.stream_functions.length === 0) {
    return [{ checked: "stream_file", name: "stream.py", isFound: true, detail: "No @stream function found by reading it; the runtime decides when it compiles." }];
  }
  return report.stream_functions.map((streamFunction) => ({ checked: "stream_function", name: streamFunction, isFound: true, detail: null }));
}

/** The lead of the runtime's refusal of a run, before its own words. */
export const ADDING_THE_STREAM_REFUSED_LEAD = "Adding the stream was refused:";

/** The lead of the app's uv failing to set up a folder's Python, before uv's own words. */
export const PYTHON_ENVIRONMENT_NOT_MADE_LEAD = "Tatolab couldn't set up the project's Python:";

/** The title a run's refusal gets in the notice of a run that answered away from the dialog, by the lead it was given. */
const RUN_REFUSAL_NOTICE_TITLES: Record<string, string> = {
  [ADDING_THE_STREAM_REFUSED_LEAD]: "Adding the stream was refused",
  [PYTHON_ENVIRONMENT_NOT_MADE_LEAD]: "Tatolab couldn't set up the project's Python",
};

/** The Python new environments are made from, in words: Tatolab's own with its version, or the chosen interpreter's path. */
export function pythonForNewEnvironmentsWords(pythonForNewEnvironments: PythonForNewEnvironments): string {
  switch (pythonForNewEnvironments.kind) {
    case "built_in":
      return `Tatolab's Python ${pythonForNewEnvironments.python_version}`;
    case "built_in_not_offered":
      return "Tatolab's Python, which this build does not carry";
    case "chosen":
      return pythonForNewEnvironments.interpreter;
  }
}

/** The request a run sent, as the compile output's first line: the tool, the folder and each argument given. */
export function runRequestWords(request: AddStreamRunRequest): string {
  const requestWords = ["run_stream", request.folder];
  if (request.streamFunction !== null) requestWords.push(`stream_function=${request.streamFunction}`);
  if (request.streamName !== null) requestWords.push(`name=${request.streamName}`);
  requestWords.push("keep=true");
  return requestWords.join("  ");
}

/** How many compile warnings a run answered, in words. */
export function compileWarningsHeading(warningCount: number): string {
  return `${warningCount} compile ${warningCount === 1 ? "warning" : "warnings"}`;
}

/** What the compile view says it is doing: setting up the folder's Python first when it had none, then compiling. */
export function compilingHeadingVerb(makesThePythonEnvironmentFirst: boolean): string {
  return makesThePythonEnvironmentFirst ? "Setting up Python, then compiling" : "Compiling";
}

/** The compile output's line for setting up the folder's Python: the app's uv sync, and the Python it sets it up from. */
export function pythonEnvironmentSyncWords(pythonForNewEnvironments: PythonForNewEnvironments): string {
  return `uv sync  python=${pythonForNewEnvironmentsWords(pythonForNewEnvironments)}`;
}

/** What the compile output says it waits on, with the seconds so far: uv then the runtime, or the runtime alone. */
export function compileWaitingWords(makesThePythonEnvironmentFirst: boolean, startedAtMs: number, nowMs: number): string {
  return `waiting for ${makesThePythonEnvironmentFirst ? "uv and the runtime" : "the runtime's answer"} · ${compilingForWords(startedAtMs, nowMs)}`;
}

/** The name a compile view calls the stream by: the one asked for, else none yet. */
export function compilingStreamWords(request: AddStreamRunRequest): string {
  return request.streamName ?? "the stream";
}

/** The facts beside a running stream's name: its nodes. */
export function streamRunningFactsWords(answer: StreamRunAnswer): string {
  return nodeCountWords(answer.node_count);
}

/** What the compile output says the runtime did, after the request and its warnings: the load, and that it is kept. */
export function streamRunAnswerLines(answer: StreamRunAnswer): readonly string[] {
  const replaced = answer.replaced_the_kept_record ? ", in place of the stream this project kept" : "";
  return [
    `loaded ${answer.stream}: ${nodeCountWords(answer.node_count)}${replaced}`,
    `${answer.stream} is running; kept, so it loads again whenever the runtime starts`,
  ];
}

/**
 * Which part of the dialog shows: a step, and within the form its source and what the folder to run holds. Focus moves to
 * the part's heading when it changes and the control that held focus is gone.
 */
export function addStreamDialogSection(state: AddStreamFlowState): string {
  const folder = folderToRun(state.form);
  return [state.step, state.form.source, state.form.hasCreatedTheNewProject ? "created" : "", folder === null ? "no_folder" : "folder"].join(":");
}

/**
 * What the dialog's status line says, for a screen reader, of a milestone a focus move alone does not say: a folder ready
 * to compile only while Add can be pressed. Refusals speak through their own alert.
 */
export function addStreamStepAnnouncement(state: AddStreamFlowState, isTheRuntimeRunning: boolean, pythonForNewEnvironments: PythonForNewEnvironments): string {
  switch (state.step) {
    case "compiling":
    case "running":
      return "";
    case "form": {
      const folder = folderToRun(state.form);
      if (folder === null) return "";
      if (addStreamActionUnavailableBecause(state.form, isTheRuntimeRunning, pythonForNewEnvironments) !== null) return "";
      return state.form.source === "new_project" ? `tatolab new wrote ${folder.folder}. Add is ready.` : `${folder.folder} is ready to add.`;
    }
  }
}

/** What a run that landed while the add-stream dialog was not shown came to, for the notice that says so. */
export type AddStreamRunNotice =
  | { kind: "running"; source: AddStreamSource; answer: StreamRunAnswer }
  | { kind: "refused"; source: AddStreamSource; title: string; words: string };

/** The notice for the dialog as a run's answer left it: the stream running, or the refusal, titled by what refused it, in its refuser's own words; `null` for a dialog no run left. */
export function addStreamRunNoticeOf(state: AddStreamFlowState): AddStreamRunNotice | null {
  const source = state.form.source;
  if (state.step === "running") return { kind: "running", source, answer: state.answer };
  if (state.step !== "form") return null;
  if (state.form.nameTaken !== null) return { kind: "refused", source, title: "Adding the stream was refused", words: state.form.nameTaken.refusal };
  if (state.form.refusal === null) return null;
  const title = RUN_REFUSAL_NOTICE_TITLES[state.form.refusal.lead];
  return title === undefined ? null : { kind: "refused", source, title, words: state.form.refusal.words };
}

/** How bad a notice's news is: plain, a warning to read, or a failure. */
export type NoticeTone = "plain" | "warning" | "failure";

/** A run notice in words: its title, what it says under it, and how bad it is. */
export interface AddStreamRunNoticePresentation {
  title: string;
  detail: string;
  tone: NoticeTone;
}

/** A run notice in the done view's own words: the stream running with what its compile said, or the refusal as the runtime gave it. */
export function presentAddStreamRunNotice(notice: AddStreamRunNotice): AddStreamRunNoticePresentation {
  if (notice.kind === "refused") return { title: notice.title, detail: notice.words, tone: "failure" };
  return {
    title: `${notice.answer.stream} is running`,
    detail: streamRunningSummary(notice.answer),
    tone: notice.answer.compile_warnings.length === 0 ? "plain" : "warning",
  };
}
