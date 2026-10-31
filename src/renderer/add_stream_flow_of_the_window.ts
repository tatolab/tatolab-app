import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import {
  addStreamRunNoticeOf,
  advanceAddStreamFlow,
  initialAddStreamFlowState,
  projectLoadRefusedLead,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
  type AddStreamRunNotice,
  type AddStreamSource,
  type QueuedProjectLoad,
} from "./presentation/add_stream_flow";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** The backend's commands adding a project uses. */
export type AddStreamBackend = Pick<TatolabBackend, "chooseStreamProjectFolder" | "createStreamProject" | "runStreamProject" | "describeStreamAction">;

/** How often a queued load is read again while the flow follows it: as often as the app reads the runtime's status. */
export const PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS = 2_000;

/** How many reads of a followed load may fail in a row, a runtime restart among them, before the flow stops following it. */
export const MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW = 5;

/** Which source the open New project or Import project dialog starts from, and whether a load's notice opened it. */
export interface OpenAddStreamDialog {
  source: AddStreamSource;
  isOpenedFromARunNotice: boolean;
}

/**
 * The flow of adding a project, held by the window rather than its dialog: a load outlives the dialog that queued it,
 * and while the dialog is closed a notice says where it has got to and what it came to, wherever the person is.
 */
export class AddStreamFlowOfTheWindow {
  private flowState: AddStreamFlowState = initialAddStreamFlowState("project_folder");
  private runNotice: AddStreamRunNotice | null = null;
  private isTheNoticeOfTheLoadUnderWayDismissed = false;
  private describeFailuresInARow = 0;
  private openDialogState: OpenAddStreamDialog | null = null;
  private readonly flowListeners = new Set<() => void>();
  private readonly projectLoadFollowing = new RepeatingBackendPoll(() => this.describeTheFollowedLoad(), PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS);

  constructor(private readonly backend: AddStreamBackend) {}

  readonly readFlowState = (): AddStreamFlowState => this.flowState;

  /** Where a load followed while the dialog is closed has got to, or what it came to; `null` once the dialog opens or the notice is dismissed. */
  readonly readRunNotice = (): AddStreamRunNotice | null => this.runNotice;

  /** The dialog while it is open; `null` while it is closed. */
  readonly readOpenDialog = (): OpenAddStreamDialog | null => this.openDialogState;

  /** Calls `flowListener` after each change to the flow or the notice; the returned function stops it. */
  readonly subscribeToFlow = (flowListener: () => void): (() => void) => {
    this.flowListeners.add(flowListener);
    return () => this.flowListeners.delete(flowListener);
  };

  dispatch(event: AddStreamFlowEvent): void {
    const wasTheLoadUnderWay = isTheLoadUnderWay(this.flowState);
    const wasFollowing = this.flowState.step === "following";
    this.flowState = advanceAddStreamFlow(this.flowState, event);
    const isFollowing = this.flowState.step === "following";
    if (isFollowing && !wasFollowing) this.isTheNoticeOfTheLoadUnderWayDismissed = false;
    if (wasFollowing && !isFollowing) this.projectLoadFollowing.stop();
    if (wasTheLoadUnderWay && this.openDialogState === null) this.showTheNoticeOfTheLoad();
    this.notifyFlowListeners();
  }

  /**
   * The dialog opens. It shows the load itself, so the notice of it goes. While a load is being queued or followed, or
   * opened from the notice, it opens on that load's source and shows it; opened afresh otherwise, it starts a new form for `source`.
   */
  openDialog(source: AddStreamSource, isOpenedFromARunNotice: boolean): void {
    const showsTheLoad = isOpenedFromARunNotice || isTheLoadUnderWay(this.flowState);
    this.openDialogState = { source: showsTheLoad ? this.flowState.form.source : source, isOpenedFromARunNotice };
    this.runNotice = null;
    if (!showsTheLoad) this.flowState = initialAddStreamFlowState(source);
    this.notifyFlowListeners();
  }

  /** The dialog closes; a load under way shows in a notice from now on. */
  closeDialog(): void {
    if (this.openDialogState === null) return;
    this.openDialogState = null;
    if (isTheLoadUnderWay(this.flowState)) this.showTheNoticeOfTheLoad();
    this.notifyFlowListeners();
  }

  /** The notice goes; one of a load under way comes back only when the load ends. */
  dismissRunNotice(): void {
    if (this.runNotice === null) return;
    if (this.runNotice.kind === "following") this.isTheNoticeOfTheLoadUnderWayDismissed = true;
    this.runNotice = null;
    this.notifyFlowListeners();
  }

  chooseFolder(): void {
    const source = this.flowState.form.source;
    this.dispatch({ kind: "work_started", work: "choosing_a_folder" });
    this.backend.chooseStreamProjectFolder(source === "project_folder" ? "project_to_run" : "new_project_directory").then(
      (folder) => this.dispatch(folder === null ? { kind: "folder_dialog_cancelled" } : { kind: "folder_chosen", folder }),
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: "The folder dialog was refused:", words: describeBackendRejection(rejection) }),
    );
  }

  /** The dialog's action: Create has the runtime write a new project in the chosen folder, or one it draws, and load it; Import has it load the chosen folder. Either is then followed to its end. */
  performTheAction(): void {
    const form = this.flowState.form;
    if (form.workUnderWay !== null) return;
    const queuing = this.queueTheLoadOf(form.source, form.chosenFolder);
    if (queuing === null) return;
    this.dispatch({ kind: "work_started", work: "queuing_the_load" });
    queuing.then(
      (queued) => {
        this.dispatch({ kind: "load_queued", queued });
        if (this.flowState.step === "following" && this.flowState.queued.action === queued.action) this.followTheLoad();
      },
      (rejection: unknown) => this.dispatch({ kind: "work_refused", lead: projectLoadRefusedLead(form.source), words: describeBackendRejection(rejection) }),
    );
  }

  /** `create_project` for a new project, in `chosenFolder` or one the runtime draws; `run_project` for a project folder, `null` until one is chosen. */
  private queueTheLoadOf(source: AddStreamSource, chosenFolder: string | null): Promise<QueuedProjectLoad> | null {
    if (source === "new_project") {
      return this.backend
        .createStreamProject(chosenFolder)
        .then((queued) => ({ action: queued.action, projectDirectory: queued.project_directory, streamOfTheScaffold: queued.stream }));
    }
    if (chosenFolder === null) return null;
    return this.backend.runStreamProject(chosenFolder).then((queued) => ({ action: queued.action, projectDirectory: queued.project_directory, streamOfTheScaffold: null }));
  }

  private followTheLoad(): void {
    this.describeFailuresInARow = 0;
    this.projectLoadFollowing.start();
  }

  /** Reads the followed load once; one the runtime does not answer is read again next round, until `MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW` fail in a row. */
  private describeTheFollowedLoad(): Promise<void> {
    if (this.flowState.step !== "following") return Promise.resolve();
    const action = this.flowState.queued.action;
    return this.backend.describeStreamAction(action).then(
      (followed) => {
        this.describeFailuresInARow = 0;
        this.dispatch(
          followed.kind === "described" ? { kind: "load_described", description: followed.description } : { kind: "load_no_longer_followed", action, words: followed.words },
        );
      },
      (rejection: unknown) => {
        this.describeFailuresInARow += 1;
        if (this.describeFailuresInARow < MOST_FAILED_PROJECT_LOAD_READS_IN_A_ROW) return;
        this.dispatch({ kind: "load_no_longer_followed", action, words: `Tatolab could not read the load: ${describeBackendRejection(rejection)}` });
      },
    );
  }

  private showTheNoticeOfTheLoad(): void {
    if (this.flowState.step === "following" && this.isTheNoticeOfTheLoadUnderWayDismissed) return;
    this.runNotice = addStreamRunNoticeOf(this.flowState);
  }

  private notifyFlowListeners(): void {
    for (const flowListener of this.flowListeners) flowListener();
  }
}

/** Whether a load is being queued or followed, which the dialog shows again however it is opened. */
function isTheLoadUnderWay(flowState: AddStreamFlowState): boolean {
  return flowState.step === "following" || flowState.form.workUnderWay === "queuing_the_load";
}
