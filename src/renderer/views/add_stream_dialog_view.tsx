import { cn } from "cn";
import { Check, FolderInput, FolderPlus, LoaderCircle, type LucideIcon, SquareX, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ActionButton } from "../design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { RefusalLine } from "../design_system/refusal_line";
import {
  addStreamDialogSection,
  addStreamStepAnnouncement,
  ADD_STREAM_ACTION_LABELS,
  addStreamActionOf,
  addStreamActionUnavailableBecause,
  addStreamBlockerTheFormDoesNotShow,
  canCancelTheFollowedAction,
  followedStepOrCancellingWords,
  followingHeadingWords,
  NEW_PROJECT_FOLDER_THE_RUNTIME_DRAWS_WORDS,
  presentStreamsTakenIn,
  projectLoadDoneHeadingWords,
  projectLoadDoneLeadWords,
  projectLoadNotFinishedHeadingWords,
  projectLoadNotFinishedLeadWords,
  projectLoadRequestWords,
  type AddStreamFlowState,
  type AddStreamForm,
  type AddStreamSource,
  type ProjectLoadEnding,
  type QueuedProjectLoad,
  type StreamTakenInPresentation,
} from "../presentation/add_stream_flow";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { abbreviateHomeDirectory, streamActionRefusalLead } from "../presentation/stream_presentation";
import { streamPagePath, type StreamPageTab } from "./stream_page_path";
import { useAddStreamFlowState, useOpenAddStreamDialog, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The dialog's title and what it does, for each source it opens on. */
const ADD_STREAM_DIALOG_WORDS: Record<AddStreamSource, { title: string; description: ReactNode; icon: LucideIcon }> = {
  project_folder: {
    title: "Import project",
    icon: FolderInput,
    description: "The runtime sets up the project and starts every stream in it.",
  },
  new_project: {
    title: "New project",
    icon: FolderPlus,
    description: "The runtime writes a sample project, sets it up and starts its stream.",
  },
};

/** A step's heading, which takes focus when the dialog moves to that step. */
function AddStreamSectionHeading({ title, lead }: { title: ReactNode; lead: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold focus-visible:shadow-none" tabIndex={-1} data-add-stream-step-heading="">
        {title}
      </h2>
      <p className="text-fg-3">{lead}</p>
    </div>
  );
}

/** The folder a load takes, cut at its start so its own name stays in view, or what a new project gets without one, and Choose… or Change… to pick it in the app's dialog. */
function ProjectFolderRow({ form, onChoose }: { form: AddStreamForm; onChoose: () => void }) {
  const folder = form.chosenFolder;
  return (
    <FormDialogRow label="Folder" data-add-stream-folder={folder ?? ""}>
      {folder !== null ? (
        <span className="min-w-0 truncate font-mono text-sm text-fg [direction:rtl] select-text" title={folder}>
          <bdi>{abbreviateHomeDirectory(folder)}</bdi>
        </span>
      ) : (
        form.source === "new_project" && <span className="min-w-0 truncate text-fg-2">{NEW_PROJECT_FOLDER_THE_RUNTIME_DRAWS_WORDS}</span>
      )}
      <ActionButton
        appearance={folder === null && form.source === "project_folder" ? "secondary" : "quiet"}
        isDisabled={form.workUnderWay !== null}
        onPressed={onChoose}
        data-add-stream-action="choose_folder"
      >
        {folder === null ? "Choose…" : "Change…"}
      </ActionButton>
    </FormDialogRow>
  );
}

/** A well of the load's lines in Geist Mono: the request the window sent, then each step the runtime reported. */
function ProjectLoadOutputWell({ title, isWaiting, children }: { title: string; isWaiting: boolean; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-well" data-add-stream-load-output="">
      <div className="flex h-8 items-center gap-2 border-b px-3 text-xs text-fg-3">
        <span className="min-w-0 flex-1 truncate font-mono">{title}</span>
        {isWaiting && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />}
      </div>
      <div className="scrollbar-thin max-h-[340px] overflow-y-auto px-3 py-2.5 font-mono text-xs leading-5 select-text">{children}</div>
    </div>
  );
}

function ProjectLoadOutputLine({ isQuiet = false, children }: { isQuiet?: boolean; children: ReactNode }) {
  return <div className={cn("break-words whitespace-pre-wrap", isQuiet ? "text-fg-3" : "text-fg")}>{children}</div>;
}

function ProjectLoadFollowingView({ state }: { state: Extract<AddStreamFlowState, { step: "following" }> }) {
  const currentStepWords = followedStepOrCancellingWords(state.description, state.cancel);
  return (
    <div data-add-stream-step="following" data-add-stream-load-step={state.description?.step ?? state.description?.state ?? "queued"}>
      <AddStreamSectionHeading title={followingHeadingWords(state.form.source, state.queued)} lead={`${currentStepWords}…`} />
      {state.cancel?.kind === "refused" && (
        <div className="mb-3" data-add-stream-cancel-refusal="">
          <RefusalLine lead={streamActionRefusalLead("Cancel")} words={state.cancel.words} />
        </div>
      )}
      <ProjectLoadOutputWell title={state.queued.projectDirectory} isWaiting>
        <ProjectLoadOutputLine isQuiet>{projectLoadRequestWords(state.form.source, state.form.chosenFolder)}</ProjectLoadOutputLine>
        <ProjectLoadOutputLine isQuiet>queued as {state.queued.action}</ProjectLoadOutputLine>
        {state.queued.streamOfTheScaffold !== null && <ProjectLoadOutputLine isQuiet>its stream: {state.queued.streamOfTheScaffold}</ProjectLoadOutputLine>}
        {state.stepsSeen.map((stepWords, stepIndex) => (
          <ProjectLoadOutputLine key={stepIndex} isQuiet={stepIndex < state.stepsSeen.length - 1}>
            {stepWords.toLowerCase()}
          </ProjectLoadOutputLine>
        ))}
      </ProjectLoadOutputWell>
    </div>
  );
}

/** One stream a load took in: its name and state, why it failed, and the page to open on it. */
function StreamTakenInRow({ streamTakenIn, onOpen }: { streamTakenIn: StreamTakenInPresentation; onOpen: (streamId: string, tab: StreamPageTab) => void }) {
  return (
    <div className="flex items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0" data-add-stream-taken-in={streamTakenIn.stream} data-add-stream-taken-in-state={streamTakenIn.stateLabel}>
      {streamTakenIn.isFailed ? (
        <SquareX className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      ) : (
        <Check className={cn("mt-0.5 size-4 shrink-0", streamTakenIn.isRunning ? "text-brand-text" : "text-fg-3")} strokeWidth={2} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-fg">{streamTakenIn.displayName}</span>
          <span className={cn("text-xs", streamTakenIn.isFailed ? "text-danger-text" : "text-fg-3")}>{streamTakenIn.stateLabel}</span>
        </div>
        {streamTakenIn.failedBecause !== null && <p className="mt-0.5 line-clamp-3 text-xs text-danger-text select-text">{streamTakenIn.failedBecause}</p>}
      </div>
      <ActionButton
        size="small"
        appearance="quiet"
        onPressed={() => onOpen(streamTakenIn.stream, streamTakenIn.isFailed ? "logs" : "overview")}
        data-add-stream-action={streamTakenIn.isFailed ? "open_logs" : "open_stream"}
      >
        {streamTakenIn.isFailed ? "Open logs" : "Open stream"}
      </ActionButton>
    </div>
  );
}

function ProjectLoadEndedView({
  source,
  queued,
  ending,
  onOpen,
}: {
  source: AddStreamSource;
  queued: QueuedProjectLoad;
  ending: ProjectLoadEnding;
  onOpen: (streamId: string, tab: StreamPageTab) => void;
}) {
  const status = useTatolabStatus();
  if (ending.kind !== "done") {
    return (
      <div data-add-stream-step="ended" data-add-stream-ending={ending.kind}>
        <AddStreamSectionHeading title={projectLoadNotFinishedHeadingWords(source, queued, ending)} lead={projectLoadNotFinishedLeadWords(ending)} />
      </div>
    );
  }
  const streamsTakenIn = presentStreamsTakenIn(ending.description, status.streams);
  return (
    <div data-add-stream-step="ended" data-add-stream-ending="done">
      <AddStreamSectionHeading title={projectLoadDoneHeadingWords(queued.projectDirectory, streamsTakenIn)} lead={projectLoadDoneLeadWords(streamsTakenIn)} />
      {streamsTakenIn.length > 0 && (
        <section aria-label="Streams" className="overflow-hidden rounded-lg border">
          {streamsTakenIn.map((streamTakenIn) => (
            <StreamTakenInRow key={streamTakenIn.stream} streamTakenIn={streamTakenIn} onOpen={onOpen} />
          ))}
        </section>
      )}
      <p className="mt-3 truncate font-mono text-xs text-fg-3 select-text" title={queued.projectDirectory}>
        {abbreviateHomeDirectory(queued.projectDirectory)}
      </p>
    </div>
  );
}

/** New project or Import project, over the window while the flow's dialog is open: the runtime creates a project or loads a folder, and the dialog follows the load to its end. */
export function AddStreamDialogView() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const openDialog = useOpenAddStreamDialog();
  const flowState = useAddStreamFlowState();
  return (
    <FormDialog
      isOpen={openDialog !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) addStreamFlow.closeDialog();
      }}
      title={ADD_STREAM_DIALOG_WORDS[openDialog?.source ?? "project_folder"].title}
      description={ADD_STREAM_DIALOG_WORDS[openDialog?.source ?? "project_folder"].description}
      icon={openDialog !== null && flowState.step === "form" ? ADD_STREAM_DIALOG_WORDS[openDialog.source].icon : undefined}
      footer={openDialog !== null && <AddStreamDialogFooter />}
      data-add-stream-dialog={openDialog?.source}
    >
      {openDialog !== null && <AddStreamDialogBody />}
    </FormDialog>
  );
}

/** Close the dialog and show `streamId`'s page at `tab`. */
function useOpenTheStreamFromTheDialog(): (streamId: string, tab?: StreamPageTab) => void {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const navigate = useNavigate();
  return (streamId, tab) => {
    addStreamFlow.closeDialog();
    void navigate(streamPagePath(streamId, tab));
  };
}

function AddStreamDialogBody() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const flowState = useAddStreamFlowState();
  const openTheStream = useOpenTheStreamFromTheDialog();
  const form = flowState.form;
  const isTheRuntimeRunning = presentRuntimeStatus(status).displayState === "running";
  const blockerTheFormDoesNotShow = addStreamBlockerTheFormDoesNotShow(form, isTheRuntimeRunning);

  const dialogContent = useRef<HTMLDivElement>(null);
  const dialogSection = addStreamDialogSection(flowState);
  const dialogSectionShownBefore = useRef({ dialogSection, step: flowState.step });
  useEffect(() => {
    const shownBefore = dialogSectionShownBefore.current;
    if (shownBefore.dialogSection === dialogSection) return;
    dialogSectionShownBefore.current = { dialogSection, step: flowState.step };
    const focusWasLost = document.activeElement === null || document.activeElement === document.body;
    if (shownBefore.step !== flowState.step || focusWasLost) {
      const focusTarget =
        dialogContent.current?.querySelector<HTMLElement>("[data-add-stream-step-heading]") ?? dialogContent.current?.querySelector<HTMLElement>('[data-add-stream-action="choose_folder"]');
      focusTarget?.focus();
    }
  }, [dialogSection, flowState.step]);

  return (
    <div ref={dialogContent}>
      <p role="status" className="sr-only">
        {addStreamStepAnnouncement(flowState, isTheRuntimeRunning)}
      </p>
      {form.refusal !== null && flowState.step === "form" && (
        <div className="mb-4 focus-visible:shadow-none" tabIndex={-1} data-add-stream-refusal="" data-add-stream-step-heading="">
          <RefusalLine lead={form.refusal.lead} words={form.refusal.words} />
        </div>
      )}
      {flowState.step === "following" && <ProjectLoadFollowingView state={flowState} />}
      {flowState.step === "ended" && <ProjectLoadEndedView source={form.source} queued={flowState.queued} ending={flowState.ending} onOpen={openTheStream} />}
      {flowState.step === "form" && (
        <div data-add-stream-step={form.source}>
          <FormDialogRows>
            <ProjectFolderRow form={form} onChoose={() => addStreamFlow.chooseFolder()} />
          </FormDialogRows>
        </div>
      )}
      {flowState.step === "form" && blockerTheFormDoesNotShow !== null && (
        <p className="mt-3 text-xs text-fg-3" data-add-stream-blocker="">
          {blockerTheFormDoesNotShow}
        </p>
      )}
    </div>
  );
}

/** The dialog's actions for the step it is on: Cancel and Create or Import on the form, the load's step and its Cancel while it runs, or what to do once it ended. */
function AddStreamDialogFooter() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const flowState = useAddStreamFlowState();
  const openTheStream = useOpenTheStreamFromTheDialog();
  const form = flowState.form;
  const isTheRuntimeRunning = presentRuntimeStatus(status).displayState === "running";
  const addStreamAction = addStreamActionOf(form);
  const streamsTakenInByTheDoneLoad = flowState.step === "ended" && flowState.ending.kind === "done" ? flowState.ending.description.streams : [];
  const onlyStreamTakenIn = streamsTakenInByTheDoneLoad.length === 1 ? (streamsTakenInByTheDoneLoad.at(0) ?? null) : null;
  return (
    <FormDialogFooter>
      {flowState.step === "form" && (
        <>
          <div className="flex-1" />
          <ActionButton onPressed={() => addStreamFlow.closeDialog()} data-add-stream-action="cancel">
            Cancel
          </ActionButton>
          <ActionButton
            appearance="primary"
            isDisabled={addStreamActionUnavailableBecause(form, isTheRuntimeRunning) !== null}
            onPressed={() => addStreamFlow.performTheAction()}
            data-add-stream-action={addStreamAction}
          >
            {form.workUnderWay === "queuing_the_load" ? `${ADD_STREAM_ACTION_LABELS[addStreamAction]}…` : ADD_STREAM_ACTION_LABELS[addStreamAction]}
          </ActionButton>
        </>
      )}
      {flowState.step === "following" && (
        <>
          <span className="inline-flex items-center gap-2 text-fg-2">
            <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} aria-hidden />
            {followedStepOrCancellingWords(flowState.description, flowState.cancel)}…
          </span>
          <div className="flex-1" />
          <ActionButton
            icon={X}
            isDisabled={!canCancelTheFollowedAction(flowState.cancel)}
            tooltip="The runtime stops at the step it is on and removes a half-made environment"
            onPressed={() => addStreamFlow.cancelTheLoad()}
            data-add-stream-action="cancel_the_load"
          >
            {form.source === "new_project" ? "Cancel create" : "Cancel import"}
          </ActionButton>
          <ActionButton onPressed={() => addStreamFlow.closeDialog()} data-add-stream-action="close">
            Close
          </ActionButton>
        </>
      )}
      {flowState.step === "ended" && (
        <>
          <ActionButton appearance="quiet" onPressed={() => addStreamFlow.dispatch({ kind: "add_another" })} data-add-stream-action="add_another">
            Add another
          </ActionButton>
          <div className="ml-auto flex gap-2">
            {onlyStreamTakenIn !== null ? (
              <ActionButton appearance="primary" onPressed={() => openTheStream(onlyStreamTakenIn.stream)} data-add-stream-action="open_the_stream">
                Open stream
              </ActionButton>
            ) : (
              <ActionButton appearance="primary" onPressed={() => addStreamFlow.closeDialog()} data-add-stream-action="done">
                Done
              </ActionButton>
            )}
          </div>
        </>
      )}
    </FormDialogFooter>
  );
}
