import { cn } from "cn";
import { Check, FolderInput, FolderPlus, LoaderCircle, type LucideIcon, TriangleAlert, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { PythonForNewEnvironments, StreamGraphExposedPort, StreamProjectFolderReport, StreamRunAnswer } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { FieldMenu, MenuSingleChoiceGroup } from "../design_system/menus";
import { RefusalLine } from "../design_system/refusal_line";
import { TextField } from "../design_system/text_field";
import {
  streamAlreadyImportedFrom,
  streamAlreadyImportedWords,
  displayNamePlaceholderOf,
  addStreamDialogSection,
  addStreamStepAnnouncement,
  ADD_STREAM_ACTION_LABELS,
  addStreamActionOf,
  addStreamActionUnavailableBecause,
  addStreamBlockerTheFormDoesNotShow,
  compileWarningsHeading,
  compileWaitingWords,
  compilingHeadingVerb,
  compilingStreamWords,
  pythonEnvironmentSyncWords,
  pythonForNewEnvironmentsWords,
  runRequestWords,
  presentStreamFunctionChecks,
  streamRunAnswerLines,
  streamRunningFactsWords,
  streamRunningSummary,
  type AddStreamFlowEvent,
  type AddStreamForm,
  type AddStreamRunRequest,
  type AddStreamSource,
} from "../presentation/add_stream_flow";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { choosePreviewedOutput, exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { abbreviateHomeDirectory } from "../presentation/stream_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { streamPagePath, type StreamPageTab } from "./stream_page_path";
import { useAddStreamFlowState, useOpenAddStreamDialog, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The dialog's title and what it does, for each source it opens on. */
const ADD_STREAM_DIALOG_WORDS: Record<AddStreamSource, { title: string; description: ReactNode; icon: LucideIcon }> = {
  project_folder: {
    title: "Import project",
    icon: FolderInput,
    description: "Tatolab sets up the project and starts its stream.",
  },
  new_project: {
    title: "New project",
    icon: FolderPlus,
    description: (
      <>
        <span className="font-mono text-xs">tatolab new</span> writes the sample stream into a new folder, and the app runs it.
      </>
    ),
  },
};

/** How often the compile view counts the seconds a run has taken. */
const COMPILING_CLOCK_TICK_MILLISECONDS = 1000;

/** The monotonic clock, read again every second while `isTicking`. */
function useMonotonicNowMsWhile(isTicking: boolean): number {
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    if (!isTicking) return;
    setNowMs(performance.now());
    const clockTick = window.setInterval(() => setNowMs(performance.now()), COMPILING_CLOCK_TICK_MILLISECONDS);
    return () => window.clearInterval(clockTick);
  }, [isTicking]);
  return nowMs;
}

/** A path or command in Geist Mono, in running text. */
function MachineWords({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs select-text">{children}</span>;
}

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

/** The folder a run compiles, cut at its start so its own name stays in view, and Choose… or Change… to pick it in the app's dialog. */
function ProjectFolderRow({ folder, isChoosing, onChoose }: { folder: string | null; isChoosing: boolean; onChoose: (() => void) | null }) {
  return (
    <FormDialogRow label="Folder" data-add-stream-folder={folder ?? ""}>
      {folder !== null && (
        <span className="min-w-0 truncate font-mono text-sm text-fg [direction:rtl] select-text" title={folder}>
          <bdi>{abbreviateHomeDirectory(folder)}</bdi>
        </span>
      )}
      {onChoose !== null && (
        <ActionButton appearance={folder === null ? "secondary" : "quiet"} isDisabled={isChoosing} onPressed={onChoose} data-add-stream-action="choose_folder">
          {folder === null ? "Choose…" : "Change…"}
        </ActionButton>
      )}
    </FormDialogRow>
  );
}

/**
 * The stream the folder holds, as its `stream.py` marks it `@stream`: its name, checked; a menu of them where it marks
 * several, the one chosen running; or why `stream.py` holds none.
 */
function StreamFoundRow({ report, chosenStreamFunction, onChosen }: { report: StreamProjectFolderReport; chosenStreamFunction: string | null; onChosen: (streamFunction: string) => void }) {
  const checks = presentStreamFunctionChecks(report);
  const chosen = chosenStreamFunction ?? report.stream_functions[0] ?? "";
  return (
    <FormDialogRow label="Stream" data-add-stream-checks="">
      {checks.length > 1 ? (
        <FieldMenu label={`Stream to run: ${chosen}`} words={<span className="font-mono text-xs">{chosen}</span>} data-add-stream-function-menu="">
          <MenuSingleChoiceGroup
            choices={report.stream_functions.map((streamFunction) => ({ choice: streamFunction, label: <span className="font-mono text-xs">{streamFunction}</span> }))}
            chosen={chosen}
            onChosen={onChosen}
            dataAttributeOfEachChoice="data-add-stream-function"
          />
        </FieldMenu>
      ) : (
        checks.map((check) => (
          <span key={check.name} className="flex min-w-0 items-center gap-2" data-add-stream-check={check.name} data-add-stream-check-found={check.isFound ? "true" : "false"}>
            {check.checked === "stream_function" ? (
              <>
                <Check className="size-4 shrink-0 text-brand-text" strokeWidth={2} aria-hidden />
                <span className="truncate font-mono text-sm text-fg">{check.name}</span>
              </>
            ) : (
              <>
                {!check.isFound && <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />}
                <span className={cn("text-right text-xs", check.isFound ? "text-fg-3" : "text-warn-text")}>{check.detail}</span>
              </>
            )}
          </span>
        ))
      )}
    </FormDialogRow>
  );
}

/** The display name the stream shows under. */
function StreamDisplayNameRow({ form, onEdited }: { form: AddStreamForm; onEdited: (displayName: string) => void }) {
  return (
    <FormDialogRow label="Name" labelFor="add-stream-name">
      <TextField
        id="add-stream-name"
        label="Stream name"
        text={form.displayName}
        onTextChanged={onEdited}
        placeholder={displayNamePlaceholderOf(form)}
        className="w-64"
        data-add-stream-name=""
      />
    </FormDialogRow>
  );
}

/** A well of the run's lines in Geist Mono: the request the window sent, then what the runtime answered. */
function CompileOutputWell({ title, isWaiting, children }: { title: string; isWaiting: boolean; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-well" data-add-stream-compile-output="">
      <div className="flex h-8 items-center gap-2 border-b px-3 text-xs text-fg-3">
        <span className="min-w-0 flex-1 truncate font-mono">{title}</span>
        {isWaiting && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />}
      </div>
      <div className="scrollbar-thin max-h-[340px] overflow-y-auto px-3 py-2.5 font-mono text-xs leading-5 select-text">{children}</div>
    </div>
  );
}

function CompileOutputLine({ tone = "plain", children }: { tone?: "plain" | "quiet" | "warning"; children: ReactNode }) {
  return <div className={cn("break-words whitespace-pre-wrap", tone === "quiet" ? "text-fg-3" : tone === "warning" ? "text-warn-text" : "text-fg")}>{children}</div>;
}

function CompilingView({
  request,
  startedAtMs,
  makesThePythonEnvironmentFirst,
  pythonForNewEnvironments,
  defaultDisplayName,
}: {
  request: AddStreamRunRequest;
  startedAtMs: number;
  makesThePythonEnvironmentFirst: boolean;
  pythonForNewEnvironments: PythonForNewEnvironments;
  /** The name the runtime gives the stream when the request names none. */
  defaultDisplayName: string;
}) {
  const nowMs = useMonotonicNowMsWhile(true);
  return (
    <div data-add-stream-step="compiling" data-add-stream-makes-the-python-environment={makesThePythonEnvironmentFirst ? "true" : "false"}>
      <AddStreamSectionHeading
        title={
          <>
            {compilingHeadingVerb(makesThePythonEnvironmentFirst)} {compilingStreamWords(request, defaultDisplayName)}
          </>
        }
        lead={
          makesThePythonEnvironmentFirst ? (
            <>
              Installing its packages with {pythonForNewEnvironmentsWords(pythonForNewEnvironments)}.
            </>
          ) : (
            <>
              The runtime is loading it.
            </>
          )
        }
      />
      <CompileOutputWell title={request.folder} isWaiting>
        {makesThePythonEnvironmentFirst && <CompileOutputLine tone="quiet">{pythonEnvironmentSyncWords(pythonForNewEnvironments)}</CompileOutputLine>}
        <CompileOutputLine tone="quiet">{runRequestWords(request)}</CompileOutputLine>
        <CompileOutputLine tone="quiet">{compileWaitingWords(makesThePythonEnvironmentFirst, startedAtMs, nowMs)}</CompileOutputLine>
      </CompileOutputWell>
    </div>
  );
}

/** The `compile_warnings` a run answered, for the person to read before they move on. */
function CompileWarningsList({ compileWarnings }: { compileWarnings: readonly string[] }) {
  if (compileWarnings.length === 0) return null;
  return (
    <section aria-label="Warnings" data-add-stream-compile-warnings="">
      <h3 className="label-caps mb-1.5">{compileWarningsHeading(compileWarnings.length)}</h3>
      <div className="overflow-hidden rounded-lg border">
        {compileWarnings.map((compileWarning, warningIndex) => (
          <div key={warningIndex} className="flex items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 text-fg-2 select-text">{compileWarning}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The output the new stream's preview shows, as the Overview picks one, once the runtime lists the stream loaded and its graph is read; `null` while there is none to show. */
function usePreviewedOutputOf(streamId: string) {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const isListedLoaded = status.streams?.some((stream) => stream.stream === streamId && stream.node_count !== null) ?? false;
  const [previewedOutput, setPreviewedOutput] = useState<StreamGraphExposedPort | null>(null);
  useEffect(() => {
    if (!isListedLoaded) return;
    let isStillShown = true;
    backend.describeStreamGraph(streamId).then(
      (graph) => {
        if (isStillShown) setPreviewedOutput(choosePreviewedOutput(graph, null));
      },
      // A graph not readable yet leaves the done view without a preview; the stream's Overview reads it again.
      () => {},
    );
    return () => {
      isStillShown = false;
    };
  }, [backend, streamId, isListedLoaded]);
  return previewedOutput;
}

function StreamRunningView({ request, answer }: { request: AddStreamRunRequest; answer: StreamRunAnswer }) {
  const status = useTatolabStatus();
  const previewedOutput = usePreviewedOutputOf(answer.stream);
  const watchPageUrl = previewedOutput?.watch_page_url ?? null;
  const previewedAddress = previewedOutput === null ? "" : exposedOutputAddress(status.machine_name, answer.stream, previewedOutput).fullAddress;
  return (
    <div className="flex flex-col gap-6" data-add-stream-step="running">
      <div className="flex items-start gap-5">
        {watchPageUrl !== null && (
          <div className="w-[300px] shrink-0">
            <ExposedOutputWatchPageFrame watchPageUrl={watchPageUrl} fullAddress={previewedAddress} className="aspect-video w-full rounded-md" />
            <p className="mt-1 truncate font-mono text-xs text-fg-3">{previewedAddress}</p>
          </div>
        )}
        <div className="min-w-0 pt-1">
          <h2 className="title-lg focus-visible:shadow-none" tabIndex={-1} data-add-stream-step-heading="">
            {answer.display_name} is running
          </h2>
          <p className="mt-1 text-fg-3">
            {streamRunningFactsWords(answer)} · <MachineWords>{answer.location.project_directory}</MachineWords>
          </p>
          <p className="mt-3 max-w-md text-fg-2">{streamRunningSummary(answer)}</p>
        </div>
      </div>
      <CompileWarningsList compileWarnings={answer.compile_warnings} />
      <CompileOutputWell title="Output" isWaiting={false}>
        <CompileOutputLine tone="quiet">{runRequestWords(request)}</CompileOutputLine>
        {answer.compile_warnings.map((compileWarning, warningIndex) => (
          <CompileOutputLine key={warningIndex} tone="warning">
            {compileWarning}
          </CompileOutputLine>
        ))}
        {streamRunAnswerLines(answer).map((answerLine) => (
          <CompileOutputLine key={answerLine}>{answerLine}</CompileOutputLine>
        ))}
      </CompileOutputWell>
    </div>
  );
}

function ProjectFolderForm({
  form,
  onChooseFolder,
  dispatch,
}: {
  form: AddStreamForm;
  onChooseFolder: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
}) {
  const status = useTatolabStatus();
  const report = form.projectFolder;
  const streamAlreadyImported = streamAlreadyImportedFrom(form, status.streams);
  return (
    <div data-add-stream-step="project_folder">
      <FormDialogRows>
        <ProjectFolderRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={onChooseFolder} />
        {report !== null && (
          <StreamFoundRow report={report} chosenStreamFunction={form.chosenStreamFunction} onChosen={(streamFunction) => dispatch({ kind: "stream_function_chosen", streamFunction })} />
        )}
        {report !== null && streamAlreadyImported === null && (
          <StreamDisplayNameRow form={form} onEdited={(displayName) => dispatch({ kind: "display_name_edited", displayName })} />
        )}
      </FormDialogRows>
      {streamAlreadyImported !== null && (
        <p className="mt-3 text-fg-2" data-add-stream-already-imported={streamAlreadyImported.stream}>
          {streamAlreadyImportedWords(streamAlreadyImported)}
        </p>
      )}
    </div>
  );
}

function NewProjectForm({
  form,
  onChooseDirectory,
  dispatch,
}: {
  form: AddStreamForm;
  onChooseDirectory: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
}) {
  const report = form.newProjectFolder;
  const hasCreatedIt = form.hasCreatedTheNewProject && report !== null;
  return (
    <div data-add-stream-step={hasCreatedIt ? "new_project_created" : "new_project"}>
      {hasCreatedIt && (
        <AddStreamSectionHeading
          title="Project created"
          lead={
            <>
              <MachineWords>tatolab new</MachineWords> wrote the sample stream. Add runs it.
            </>
          }
        />
      )}
      <FormDialogRows>
        <ProjectFolderRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={hasCreatedIt ? null : onChooseDirectory} />
        {hasCreatedIt && (
          <StreamFoundRow report={report} chosenStreamFunction={form.chosenStreamFunction} onChosen={(streamFunction) => dispatch({ kind: "stream_function_chosen", streamFunction })} />
        )}
        {report !== null && <StreamDisplayNameRow form={form} onEdited={(displayName) => dispatch({ kind: "display_name_edited", displayName })} />}
      </FormDialogRows>
    </div>
  );
}

/** New project or Import project, over the window while the flow's dialog is open: run a project folder, or create one with `tatolab new` and run it, the app setting up its Python first. */
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
      {openDialog !== null && <AddStreamDialogBody source={openDialog.source} />}
    </FormDialog>
  );
}

function AddStreamDialogBody({ source }: { source: AddStreamSource }) {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const flowState = useAddStreamFlowState();
  const dispatch = (event: AddStreamFlowEvent) => addStreamFlow.dispatch(event);
  const form = flowState.form;
  const isTheRuntimeRunning = presentRuntimeStatus(status).displayState === "running";
  const blockerTheFormDoesNotShow = addStreamBlockerTheFormDoesNotShow(form, isTheRuntimeRunning, status.python_for_new_environments);

  // An opening while a run compiles is ignored by the flow; once the run answers, the dialog catches up to its source.
  useEffect(() => {
    if (form.source !== source) addStreamFlow.dispatch({ kind: "source_chosen", source });
  }, [addStreamFlow, form.source, source, flowState.step]);

  const needsANewProjectProposal = form.source === "new_project" && form.newProjectFolder === null && form.workUnderWay === null && form.refusal === null;
  useEffect(() => {
    if (needsANewProjectProposal) addStreamFlow.proposeNewProjectFolder();
  }, [addStreamFlow, needsANewProjectProposal]);

  const dialogContent = useRef<HTMLDivElement>(null);
  const dialogSection = addStreamDialogSection(flowState);
  const dialogSectionShownBefore = useRef({ dialogSection, step: flowState.step });
  useEffect(() => {
    const shownBefore = dialogSectionShownBefore.current;
    if (shownBefore.dialogSection === dialogSection) return;
    dialogSectionShownBefore.current = { dialogSection, step: flowState.step };
    const focusWasLost = document.activeElement === null || document.activeElement === document.body;
    if (shownBefore.step !== flowState.step || focusWasLost) dialogContent.current?.querySelector<HTMLElement>("[data-add-stream-step-heading]")?.focus();
  }, [dialogSection, flowState.step]);

  return (
    <div ref={dialogContent}>
      <p role="status" className="sr-only">
        {addStreamStepAnnouncement(flowState, isTheRuntimeRunning, status.python_for_new_environments, streamAlreadyImportedFrom(flowState.form, status.streams))}
      </p>
      {form.refusal !== null && flowState.step === "form" && (
        <div className="mb-4" data-add-stream-refusal="">
          <RefusalLine lead={form.refusal.lead} words={form.refusal.words} />
        </div>
      )}
      {flowState.step === "compiling" && (
        <CompilingView
          request={flowState.request}
          startedAtMs={flowState.startedAtMs}
          makesThePythonEnvironmentFirst={flowState.makesThePythonEnvironmentFirst}
          pythonForNewEnvironments={status.python_for_new_environments}
          defaultDisplayName={displayNamePlaceholderOf(flowState.form)}
        />
      )}
      {flowState.step === "running" && <StreamRunningView request={flowState.request} answer={flowState.answer} />}
      {flowState.step === "form" && form.source === "project_folder" && (
        <ProjectFolderForm
          form={form}
          onChooseFolder={() => addStreamFlow.chooseFolder()}
          dispatch={dispatch}
        />
      )}
      {flowState.step === "form" && form.source === "new_project" && (
        <NewProjectForm
          form={form}
          onChooseDirectory={() => addStreamFlow.chooseFolder()}
          dispatch={dispatch}
        />
      )}
      {flowState.step === "form" && blockerTheFormDoesNotShow !== null && (
        <p className="mt-3 text-xs text-fg-3" data-add-stream-blocker="">
          {blockerTheFormDoesNotShow}
        </p>
      )}
    </div>
  );
}

/** The dialog's actions for the step it is on: Cancel and Add or Create on the form, the compile's progress, or what to open once it runs. */
function AddStreamDialogFooter() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const navigate = useNavigate();
  const flowState = useAddStreamFlowState();
  const form = flowState.form;
  const isTheRuntimeRunning = presentRuntimeStatus(status).displayState === "running";
  const addStreamAction = addStreamActionOf(form);
  const addStreamActionUnavailableReason = addStreamActionUnavailableBecause(form, isTheRuntimeRunning, status.python_for_new_environments);
  const streamAlreadyImported = streamAlreadyImportedFrom(form, status.streams);
  const openTheStream = (streamId: string, tab?: StreamPageTab) => {
    addStreamFlow.closeDialog();
    void navigate(streamPagePath(streamId, tab));
  };
  return (
    <FormDialogFooter>
      {flowState.step === "form" && (
        <>
          <div className="flex-1" />
          <ActionButton onPressed={() => addStreamFlow.closeDialog()} data-add-stream-action="cancel">
            Cancel
          </ActionButton>
          {streamAlreadyImported === null ? (
            <ActionButton
              appearance="primary"
              isDisabled={addStreamActionUnavailableReason !== null}
              onPressed={() => addStreamFlow.performTheAction()}
              data-add-stream-action={addStreamAction}
            >
              {form.workUnderWay === "creating_the_project" ? "Creating…" : ADD_STREAM_ACTION_LABELS[addStreamAction]}
            </ActionButton>
          ) : (
            <ActionButton appearance="primary" onPressed={() => openTheStream(streamAlreadyImported.stream)} data-add-stream-action="open_stream">
              Open stream
            </ActionButton>
          )}
        </>
      )}
      {flowState.step === "compiling" && (
        <span className="inline-flex items-center gap-2 text-fg-2">
          <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} aria-hidden />
          {compilingHeadingVerb(flowState.makesThePythonEnvironmentFirst)}…
        </span>
      )}
      {flowState.step === "running" && (
        <>
          <ActionButton appearance="quiet" onPressed={() => addStreamFlow.dispatch({ kind: "add_another" })} data-add-stream-action="add_another">
            Add another
          </ActionButton>
          <div className="ml-auto flex gap-2">
            <ActionButton icon={Workflow} onPressed={() => openTheStream(flowState.answer.stream, "graph")} data-add-stream-action="open_graph">
              Open graph
            </ActionButton>
            <ActionButton appearance="primary" onPressed={() => openTheStream(flowState.answer.stream)} data-add-stream-action="open_stream">
              Open stream
            </ActionButton>
          </div>
        </>
      )}
    </FormDialogFooter>
  );
}


