import type { StreamProjectFolderReport, StreamProjectRunOutcome, StreamRunAnswer } from "../../shared/tatolab_backend_contract";
import { STREAM_RUN_MODE_LABELS } from "./stream_presentation";

/** Where a new stream starts from: a project folder the person has, or a new project `tatolab new` writes. */
export type AddStreamSource = "project_folder" | "new_project";

/** The run the window asks `run_stream` for: a folder, the stream function as `tatolab run` takes it, and the name to load it under. */
export interface AddStreamRunRequest {
  folder: string;
  streamFunction: string | null;
  streamName: string | null;
}

/** What the backend is doing for the form while it waits. */
export type AddStreamWorkUnderWay = "choosing_a_folder" | "checking_the_folder" | "creating_the_project" | "opening_a_terminal";

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

/** The Add stream page: the form, a run compiling since `startedAtMs`, or the stream running. */
export type AddStreamFlowState =
  | { step: "form"; form: AddStreamForm }
  | { step: "compiling"; form: AddStreamForm; request: AddStreamRunRequest; startedAtMs: number }
  | { step: "running"; form: AddStreamForm; request: AddStreamRunRequest; answer: StreamRunAnswer };

/** What happened on the page, from the person or from the backend's answer. */
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
  | { kind: "terminal_opened" }
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

/** The page as it first shows for `source`. */
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

/** The page after `event`. An event of the form changes only the form step: one that arrives while a run compiles or once it runs is about a form no longer shown. */
export function advanceAddStreamFlow(state: AddStreamFlowState, event: AddStreamFlowEvent): AddStreamFlowState {
  const form = state.form;
  switch (event.kind) {
    case "run_answered":
      if (state.step !== "compiling") return state;
      if (event.outcome.kind === "running") return { step: "running", form, request: state.request, answer: event.outcome.answer };
      return withForm(state, { nameTaken: { refusal: event.outcome.refusal, freeName: event.outcome.free_name } });
    case "run_refused":
      return state.step === "compiling" ? withForm(state, { refusal: { lead: "Compile and run was refused:", words: event.words } }) : state;
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
    case "terminal_opened":
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
      return { step: "compiling", form: { ...form, nameTaken: null, refusal: null, streamName: event.request.streamName ?? form.streamName }, request: event.request, startedAtMs: event.nowMs };
    case "run_answered":
    case "run_refused":
    case "add_another":
      return state;
  }
}

/** `word` as a POSIX shell reads it back unchanged: as it is when it holds only characters a shell leaves alone, else in single quotes. */
export function shellWord(word: string): string {
  return /^[A-Za-z0-9_./~@%+=:,-]+$/.test(word) ? word : `'${word.replaceAll("'", `'"'"'`)}'`;
}

/** The terminal command that does what Compile and run does: `tatolab run -d` in the folder, with the function and name the form gives. */
export function terminalCommandForTheRun(request: AddStreamRunRequest, functionsOwnName: string | null): string {
  const commandWords = ["cd", shellWord(request.folder), "&&", "tatolab", "run", "-d"];
  if (request.streamFunction !== null) commandWords.push(shellWord(request.streamFunction));
  if (request.streamName !== null && request.streamName !== functionsOwnName) commandWords.push("--name", shellWord(request.streamName));
  return commandWords.join(" ");
}

/** `uv sync` in `folder`, which creates the `.venv` the runtime compiles the project in. */
export function pythonEnvironmentSyncCommand(folder: string): string {
  return `cd ${shellWord(folder)} && uv sync`;
}

/** `tatolab new` for `folder`, the command Create runs. */
export function newProjectCommand(folder: string): string {
  return `tatolab new ${shellWord(folder)}`;
}

/**
 * Why Compile and run cannot be pressed now, or `null` when it can. A folder whose `.venv/bin/python` is missing waits for
 * its sync: the runtime compiles only in that interpreter, and refuses the run before it reads the name.
 */
export function compileAndRunUnavailableBecause(form: AddStreamForm, isTheRuntimeRunning: boolean): string | null {
  if (!isTheRuntimeRunning) return "The runtime isn't running, so it can't compile a stream.";
  switch (form.workUnderWay) {
    case "choosing_a_folder":
      return "Choose a folder in the dialog.";
    case "checking_the_folder":
      return "Wait for the folder to be checked.";
    case "creating_the_project":
      return "Wait for tatolab new to write the project.";
    case "opening_a_terminal":
      return "Wait for the terminal to open.";
    case null:
      break;
  }
  if (form.source === "new_project" && !form.hasCreatedTheNewProject) return "Create the project first.";
  const folder = folderToRun(form);
  if (folder === null) return "Choose a project folder first.";
  if (folder.python_environment.kind === "missing") return "Sync the project's .venv with uv sync, then check again.";
  if (form.nameTaken !== null) return "Choose another name, or use the one offered.";
  return null;
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

/** How many steps a stream has, in words. */
export function stepCountWords(stepCount: number): string {
  return `${stepCount} ${stepCount === 1 ? "step" : "steps"}`;
}

/** The function the stream is named after unless the form names it otherwise: the chosen one, else the folder's first. */
export function functionsOwnNameOf(form: AddStreamForm): string | null {
  const folder = folderToRun(form);
  return folder === null ? null : (form.chosenStreamFunction ?? folder.stream_functions[0] ?? null);
}

/** What the `stream.py` check says it found. */
export function streamFileCheckDetail(report: StreamProjectFolderReport): string {
  if (!report.stream_file_present) return "The stream function the runtime compiles lives in stream.py.";
  if (report.stream_functions.length === 0) return "No @stream function found by reading it; the runtime decides when it compiles.";
  if (report.stream_functions.length === 1) return `Stream function ${report.stream_functions[0]}()`;
  return `Stream functions ${report.stream_functions.map((streamFunction) => `${streamFunction}()`).join(", ")}`;
}

/** What the `.venv` check says it found: the versions it names, or where the stream compiles. */
export function pythonEnvironmentCheckDetail(report: StreamProjectFolderReport): string {
  const pythonEnvironment = report.python_environment;
  if (pythonEnvironment.kind === "missing") return "The stream compiles in the project's own .venv/bin/python.";
  const pythonWords = pythonEnvironment.python_version === null ? "Python" : `Python ${pythonEnvironment.python_version}`;
  return pythonEnvironment.tatolab_stream_version === null ? pythonWords : `${pythonWords} · tatolab-stream ${pythonEnvironment.tatolab_stream_version}`;
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

/** The name a compile view calls the stream by: the one asked for, else none yet. */
export function compilingStreamWords(request: AddStreamRunRequest): string {
  return request.streamName ?? "the stream";
}

/** The facts beside a running stream's name: its run mode, its steps. */
export function streamRunningFactsWords(answer: StreamRunAnswer): string {
  return `${STREAM_RUN_MODE_LABELS.always_on} · ${stepCountWords(answer.node_count)}`;
}

/** What the compile output says the runtime did, after the request and its warnings: the load, and that it is kept. */
export function streamRunAnswerLines(answer: StreamRunAnswer): readonly string[] {
  const replaced = answer.replaced_the_kept_record ? ", in place of the stream this project kept" : "";
  return [
    `loaded ${answer.stream} as instance ${answer.stream_instance}: ${stepCountWords(answer.node_count)}${replaced}`,
    `${answer.stream} is running; kept, so it loads again whenever the runtime starts`,
  ];
}

/** The terminal run the footer offers: the form's, under the free name while the asked one is refused as taken. */
export function terminalRunRequestOf(form: AddStreamForm): AddStreamRunRequest | null {
  const runRequest = runRequestOf(form);
  if (runRequest === null || form.nameTaken === null) return runRequest;
  return { ...runRequest, streamName: form.nameTaken.freeName };
}

/**
 * Which part of the page shows: a step, and within the form its source and what the folder to run holds. Focus moves to
 * the part's heading when it changes and the control that held focus is gone.
 */
export function addStreamPageSection(state: AddStreamFlowState): string {
  const folder = folderToRun(state.form);
  return [state.step, state.form.source, state.form.hasCreatedTheNewProject ? "created" : "", folder?.python_environment.kind ?? "no_folder"].join(":");
}

/**
 * What the page's status line says, for a screen reader, of a milestone a focus move alone does not say: a folder ready
 * to compile only while Compile and run can be pressed. Refusals speak through their own alert.
 */
export function addStreamStepAnnouncement(state: AddStreamFlowState, isTheRuntimeRunning: boolean): string {
  switch (state.step) {
    case "compiling":
    case "running":
      return "";
    case "form": {
      const folder = folderToRun(state.form);
      if (folder === null) return "";
      if (folder.python_environment.kind === "present") {
        return compileAndRunUnavailableBecause(state.form, isTheRuntimeRunning) === null ? `${folder.folder} has its .venv. Compile and run is ready.` : "";
      }
      return state.form.source === "new_project"
        ? `tatolab new wrote ${folder.folder}. Sync its .venv with uv sync, then check again.`
        : `${folder.folder} has no .venv. Sync it with uv sync, then check again.`;
    }
  }
}

/** What a run that landed while the Add stream page was not shown came to, for the notice that says so. */
export type AddStreamRunNotice = { kind: "running"; source: AddStreamSource; answer: StreamRunAnswer } | { kind: "refused"; source: AddStreamSource; words: string };

/** The notice for the page as a run's answer left it: the stream running, or the runtime's refusal in its own words; `null` for a page no run left. */
export function addStreamRunNoticeOf(state: AddStreamFlowState): AddStreamRunNotice | null {
  const source = state.form.source;
  if (state.step === "running") return { kind: "running", source, answer: state.answer };
  if (state.step !== "form") return null;
  if (state.form.nameTaken !== null) return { kind: "refused", source, words: state.form.nameTaken.refusal };
  return state.form.refusal === null ? null : { kind: "refused", source, words: state.form.refusal.words };
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
  if (notice.kind === "refused") return { title: "Compile and run was refused", detail: notice.words, tone: "failure" };
  return {
    title: `${notice.answer.stream} is running`,
    detail: streamRunningSummary(notice.answer),
    tone: notice.answer.compile_warnings.length === 0 ? "plain" : "warning",
  };
}
