import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import {
  addStreamRunNoticeOf,
  advanceAddStreamFlow,
  initialAddStreamFlowState,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
  type AddStreamRunNotice,
  type AddStreamSource,
} from "./presentation/add_stream_flow";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** The backend's commands adding a project uses. */
export type AddStreamBackend = Pick<TatolabBackend, "chooseStreamProjectFolder" | "createStreamProject" | "runStreamProject" | "describeStreamAction">;

/** How often a queued load is read again while the flow follows it: as often as the app reads the runtime's status. */
export const PROJECT_LOAD_FOLLOWING_INTERVAL_MILLISECONDS = 2_000;

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
    const wasFollowing = this.flowState.step === "following";
    this.flowState = advanceAddStreamFlow(this.flowState, event);
    const isFollowing = this.flowState.step === "following";
    if (isFollowing && !wasFollowing) this.isTheNoticeOfTheLoadUnderWayDismissed = false;
    if (wasFollowing && !isFollowing) this.projectLoadFollowing.stop();
    if (wasFollowing && this.openDialogState === null) this.showTheNoticeOfTheLoad();
    this.notifyFlowListeners();
  }

  /**
   * The dialog opens, for `source`. It shows the load itself, so the notice of it goes. Opened afresh rather than from
   * that notice, it starts a new form, unless a load is still under way, which it shows again.
   */
  openDialog(source: AddStreamSource, isOpenedFromARunNotice: boolean): void {
    this.openDialogState = { source, isOpenedFromARunNotice };
    this.runNotice = null;
    if (!isOpenedFromARunNotice && this.flowState.step !== "following") this.flowState = initialAddStreamFlowState(source);
    this.notifyFlowListeners();
  }

  /** The dialog closes; a load under way shows in a notice from now on. */
  closeDialog(): void {
    if (this.openDialogState === null) return;
    this.openDialogState = null;
    if (this.flowState.step === "following") this.showTheNoticeOfTheLoad();
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
    const queuing = this.queueTheLoadOf(form.source, form.chosenFolder);
    if (queuing === null) return;
    this.dispatch({ kind: "work_started", work: "queuing_the_load" });
    queuing.then(
      (queued) => {
        this.dispatch({ kind: "load_queued", queued: { action: queued.action, projectDirectory: queued.project_directory } });
        this.projectLoadFollowing.start();
      },
      (rejection: unknown) =>
        this.dispatch({ kind: "work_refused", lead: form.source === "new_project" ? "Create was refused:" : "Import was refused:", words: describeBackendRejection(rejection) }),
    );
  }

  /** `create_project` for a new project, in `chosenFolder` or one the runtime draws; `run_project` for a project folder, `null` until one is chosen. */
  private queueTheLoadOf(source: AddStreamSource, chosenFolder: string | null): Promise<{ action: string; project_directory: string }> | null {
    if (source === "new_project") return this.backend.createStreamProject(chosenFolder);
    return chosenFolder === null ? null : this.backend.runStreamProject(chosenFolder);
  }

  private describeTheFollowedLoad(): Promise<void> {
    if (this.flowState.step !== "following") return Promise.resolve();
    return this.backend.describeStreamAction(this.flowState.queued.action).then(
      (followed) => this.dispatch(followed.kind === "described" ? { kind: "load_described", description: followed.description } : { kind: "load_not_held", words: followed.words }),
      // A read the runtime does not answer is tried again on the next round.
      () => {},
    );
  }

  private showTheNoticeOfTheLoad(): void {
    const isUnderWay = this.flowState.step === "following";
    if (isUnderWay && this.isTheNoticeOfTheLoadUnderWayDismissed) return;
    this.runNotice = addStreamRunNoticeOf(this.flowState);
  }

  private notifyFlowListeners(): void {
    for (const flowListener of this.flowListeners) flowListener();
  }
}
