import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { StreamProjectFolderReport } from "../shared/tatolab_backend_contract";
import {
  addStreamRunNoticeOf,
  advanceAddStreamFlow,
  folderToRun,
  initialAddStreamFlowState,
  runRequestOf,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
  type AddStreamRunNotice,
  type AddStreamRunRequest,
  type AddStreamSource,
} from "./presentation/add_stream_flow";

/** The backend's commands adding a stream uses. */
export type AddStreamBackend = Pick<
  TatolabBackend,
  | "chooseStreamProjectFolder"
  | "proposeNewStreamProjectFolder"
  | "checkStreamProjectFolder"
  | "createStreamProject"
  | "runStreamProject"
  | "openTerminalAtChosenProjectFolder"
>;

/**
 * The Add stream page's flow, held by the window rather than the page: a run outlives the page that started it, and
 * one that answers while the page is not shown leaves a notice saying what it came to, wherever the person is.
 */
export class AddStreamFlowOfTheWindow {
  private flowState: AddStreamFlowState = initialAddStreamFlowState("project_folder");
  private runNotice: AddStreamRunNotice | null = null;
  private isPageShown = false;
  private readonly flowListeners = new Set<() => void>();

  constructor(
    private readonly backend: AddStreamBackend,
    private readonly readMonotonicClockMs: () => number = () => performance.now(),
  ) {}

  readonly readFlowState = (): AddStreamFlowState => this.flowState;

  /** What the last run that answered while the page was not shown came to; `null` once the page shows or the notice is dismissed. */
  readonly readRunNotice = (): AddStreamRunNotice | null => this.runNotice;

  /** Calls `flowListener` after each change to the flow or the notice; the returned function stops it. */
  readonly subscribeToFlow = (flowListener: () => void): (() => void) => {
    this.flowListeners.add(flowListener);
    return () => this.flowListeners.delete(flowListener);
  };

  dispatch(event: AddStreamFlowEvent): void {
    const wasCompiling = this.flowState.step === "compiling";
    this.flowState = advanceAddStreamFlow(this.flowState, event);
    const isARunsAnswer = event.kind === "run_answered" || event.kind === "run_refused";
    if (isARunsAnswer && wasCompiling && !this.isPageShown) this.runNotice = addStreamRunNoticeOf(this.flowState);
    this.notifyFlowListeners();
  }

  /**
   * The page shows, for `source`. It says what a run came to itself, so the notice of it goes. Opened afresh rather than
   * from that notice, it starts a new form, unless a run is still compiling, which it shows again.
   */
  showPage(source: AddStreamSource, isOpenedFromARunNotice: boolean): void {
    this.isPageShown = true;
    this.runNotice = null;
    if (!isOpenedFromARunNotice && this.flowState.step !== "compiling") this.flowState = initialAddStreamFlowState(source);
    this.notifyFlowListeners();
  }

  /** The page leaves; a run that answers from now on leaves a notice. */
  leavePage(): void {
    this.isPageShown = false;
  }

  dismissRunNotice(): void {
    if (this.runNotice === null) return;
    this.runNotice = null;
    this.notifyFlowListeners();
  }

  proposeNewProjectFolder(): void {
    this.dispatch({ kind: "work_started", work: "choosing_a_folder" });
    this.backend.proposeNewStreamProjectFolder().then(
      (report) => this.dispatch({ kind: "new_project_folder_answered", report }),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "No directory was proposed:", words: describeBackendRejection(rejection) }),
    );
  }

  chooseFolder(): void {
    const source = this.flowState.form.source;
    this.dispatch({ kind: "work_started", work: "choosing_a_folder" });
    this.backend.chooseStreamProjectFolder(source === "project_folder" ? "project_to_run" : "new_project_directory").then(
      (report) => this.dispatch(report === null ? { kind: "folder_dialog_cancelled" } : folderAnsweredEvent(source, report)),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "The folder dialog was refused:", words: describeBackendRejection(rejection) }),
    );
  }

  checkTheFolderAgain(): void {
    const form = this.flowState.form;
    const folder = folderToRun(form);
    if (folder === null) return;
    this.dispatch({ kind: "work_started", work: "checking_the_folder" });
    this.backend.checkStreamProjectFolder(folder.folder).then(
      (report) => this.dispatch(folderAnsweredEvent(form.source, report)),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "Check again was refused:", words: describeBackendRejection(rejection) }),
    );
  }

  openATerminalInTheFolder(): void {
    const folder = folderToRun(this.flowState.form);
    if (folder === null) return;
    this.dispatch({ kind: "work_started", work: "opening_a_terminal" });
    this.backend.openTerminalAtChosenProjectFolder(folder.folder).then(
      () => this.dispatch({ kind: "terminal_opened" }),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "No terminal opened:", words: describeBackendRejection(rejection) }),
    );
  }

  createTheNewProject(): void {
    const newProjectFolder = this.flowState.form.newProjectFolder;
    if (newProjectFolder === null) return;
    this.dispatch({ kind: "work_started", work: "creating_the_project" });
    this.backend.createStreamProject(newProjectFolder.folder).then(
      (report) => this.dispatch({ kind: "new_project_created", report }),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "Create was refused:", words: describeBackendRejection(rejection) }),
    );
  }

  /** Compile and run what the form asks for. */
  compileAndRun(): void {
    const runRequest = runRequestOf(this.flowState.form);
    if (runRequest !== null) this.run(runRequest);
  }

  /** Run again under `freeName`, the name the runtime's refusal of a taken one was answered with. */
  runUnderTheFreeName(freeName: string): void {
    const runRequest = runRequestOf(this.flowState.form);
    if (runRequest !== null) this.run({ ...runRequest, streamName: freeName });
  }

  private run(request: AddStreamRunRequest): void {
    this.dispatch({ kind: "run_started", request, nowMs: this.readMonotonicClockMs() });
    this.backend.runStreamProject(request.folder, request.streamFunction, request.streamName).then(
      (outcome) => this.dispatch({ kind: "run_answered", outcome }),
      (rejection: unknown) => this.dispatch({ kind: "run_refused", words: describeBackendRejection(rejection) }),
    );
  }

  private notifyFlowListeners(): void {
    for (const flowListener of this.flowListeners) flowListener();
  }
}

function folderAnsweredEvent(source: AddStreamSource, report: StreamProjectFolderReport): AddStreamFlowEvent {
  return source === "project_folder" ? { kind: "project_folder_answered", report } : { kind: "new_project_folder_answered", report };
}
