import { cn } from "cn";
import { FileCode2, Folder, FolderOpen, LoaderCircle, type LucideIcon, Package, TriangleAlert, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { PythonForNewEnvironments, StreamGraphExposedPort, StreamProjectFolderReport, StreamRunAnswer } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { FormDialog } from "../design_system/form_dialog";
import { RefusalLine } from "../design_system/refusal_line";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { TextField } from "../design_system/text_field";
import {
  addStreamPageSection,
  addStreamStepAnnouncement,
  ADD_STREAM_ACTION_LABELS,
  addStreamActionOf,
  addStreamActionUnavailableBecause,
  compileWarningsHeading,
  compileWaitingWords,
  compilingHeadingVerb,
  compilingStreamWords,
  functionsOwnNameOf,
  newProjectCommand,
  pythonEnvironmentSyncWords,
  pythonForNewEnvironmentsWords,
  runRequestWords,
  presentStreamFunctionChecks,
  streamRunAnswerLines,
  streamRunningFactsWords,
  streamRunningSummary,
  terminalCommandForTheRun,
  terminalRunRequestOf,
  type AddStreamFlowEvent,
  type AddStreamForm,
  type AddStreamRunRequest,
  type AddStreamSource,
  type StreamFunctionCheck,
} from "../presentation/add_stream_flow";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { choosePreviewedOutput, exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { STREAM_RUN_MODE_LABELS } from "../presentation/stream_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { CommandWithCopyButton } from "./stream_action_controls";
import { streamPagePath, type StreamPageTab } from "./stream_page_path";
import { useAddStreamFlowState, useOpenAddStreamDialog, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The dialog's title and what it does, for each source it opens on. */
const ADD_STREAM_DIALOG_WORDS: Record<AddStreamSource, { title: string; description: ReactNode }> = {
  project_folder: {
    title: "Import project",
    description: "A folder with a stream.py. Tatolab installs what it needs, then the runtime compiles it, loads and starts it.",
  },
  new_project: {
    title: "New project",
    description: (
      <>
        <span className="font-mono text-xs">tatolab new</span> writes the sample stream into a new folder, and the app runs it {STREAM_RUN_MODE_LABELS.always_on}.
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

/** One labelled row of the add-stream form: what it sets, the control, and a hint under it; a field's label is its `<label>`. */
function AddStreamFormRow({ label, fieldId, hint, hintId, children }: { label: string; fieldId?: string; hint?: ReactNode; hintId?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4 py-3">
      {fieldId === undefined ? (
        <div className="pt-1 text-fg-2">{label}</div>
      ) : (
        <label htmlFor={fieldId} className="pt-1 text-fg-2">
          {label}
        </label>
      )}
      <div className="min-w-0">
        {children}
        {hint !== undefined && (
          <div id={hintId} className="mt-1.5 text-xs text-fg-3">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
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

/** The folder a run compiles, and Choose… to pick another in the app's dialog. */
function ProjectFolderChooserRow({ folder, isChoosing, onChoose }: { folder: string | null; isChoosing: boolean; onChoose: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2" data-add-stream-folder={folder ?? ""}>
      <FolderOpen className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      {folder === null ? (
        <span className="min-w-0 flex-1 text-fg-3">No folder chosen yet</span>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg select-text">{folder}</span>
      )}
      <ActionButton isDisabled={isChoosing} onPressed={onChoose} data-add-stream-action="choose_folder">
        Choose…
      </ActionButton>
    </div>
  );
}

/** One branch of the folder's tree: a stream found in it by its name alone, or `stream.py` with why it stands in. */
function ProjectFolderTreeRow({ check }: { check: StreamFunctionCheck }) {
  const RowIcon = check.checked === "stream_function" ? Workflow : check.isFound ? FileCode2 : TriangleAlert;
  return (
    <li className="flex min-h-8 items-center gap-2 py-1 pl-4" data-add-stream-check={check.name} data-add-stream-check-found={check.isFound ? "true" : "false"}>
      <RowIcon className={cn("size-4 shrink-0", check.isFound ? "text-fg-3" : "text-warn")} strokeWidth={1.75} aria-hidden />
      <span className="shrink-0 font-mono text-sm text-fg">{check.name}</span>
      {check.detail !== null && <span className={cn("min-w-0 text-xs", check.isFound ? "text-fg-3" : "text-warn-text")}>{check.detail}</span>}
    </li>
  );
}

/** What the folder holds that `run_stream` needs, under a heading: the `@stream` functions of its `stream.py`. The app sets up its Python itself. */
function ProjectFolderChecks({ report }: { report: StreamProjectFolderReport }) {
  return (
    <section aria-labelledby="add-stream-streams-found" className="mt-5" data-add-stream-checks="">
      <h3 id="add-stream-streams-found" className="label-caps flex h-7 items-center">
        Streams found
      </h3>
      <ul className="ml-2 border-l">
        {presentStreamFunctionChecks(report).map((check) => (
          <ProjectFolderTreeRow key={check.name} check={check} />
        ))}
      </ul>
    </section>
  );
}

/** The name the stream loads under, and the runtime's refusal when a listed stream holds it, with the name to use instead. */
function StreamNameRow({ form, hint, onEdited, onUseFreeName }: { form: AddStreamForm; hint: ReactNode; onEdited: (streamName: string) => void; onUseFreeName: (freeName: string) => void }) {
  const nameTaken = form.nameTaken;
  return (
    <AddStreamFormRow label="Name" fieldId="add-stream-name" hint={nameTaken === null ? hint : undefined} hintId="add-stream-name-hint">
      <TextField
        id="add-stream-name"
        label="Stream name"
        text={form.streamName}
        onTextChanged={onEdited}
        isMachineWord
        isRefused={nameTaken !== null}
        describedBy="add-stream-name-hint"
        className="max-w-sm"
        data-add-stream-name=""
      />
      {nameTaken !== null && (
        <div id="add-stream-name-hint" data-add-stream-name-taken="">
          <RefusalLine words={nameTaken.refusal} />
          <div className="mt-2 pl-5">
            <ActionButton onPressed={() => onUseFreeName(nameTaken.freeName)} data-add-stream-action="use_free_name">
              Run as <span className="font-mono">{nameTaken.freeName}</span>
            </ActionButton>
          </div>
        </div>
      )}
    </AddStreamFormRow>
  );
}

/** Always on, the one run mode the app can start; a dev session belongs to a terminal. */
function RunModeRow({ hint }: { hint: ReactNode }) {
  return (
    <AddStreamFormRow label="Run mode" hint={hint}>
      <SegmentedChoiceControl
        label="Run mode"
        choices={[
          { choice: "kept", label: STREAM_RUN_MODE_LABELS.always_on },
          {
            choice: "attached",
            label: STREAM_RUN_MODE_LABELS.dev_session,
            unavailableBecause: "A dev session lives as long as the terminal that runs it. Start one with tatolab dev in the project folder.",
          },
        ]}
        chosen="kept"
        dataAttributeOfEachSegment="data-add-stream-run-mode"
      />
    </AddStreamFormRow>
  );
}

function StreamFunctionRow({ report, chosenStreamFunction, onChosen }: { report: StreamProjectFolderReport; chosenStreamFunction: string | null; onChosen: (streamFunction: string) => void }) {
  if (report.stream_functions.length <= 1) return null;
  return (
    <AddStreamFormRow label="Stream function" hint="stream.py marks several functions @stream; the stream runs the one chosen.">
      <SegmentedChoiceControl
        label="Stream function"
        choices={report.stream_functions.map((streamFunction) => ({ choice: streamFunction, label: <span className="font-mono">{streamFunction}()</span> }))}
        chosen={chosenStreamFunction ?? report.stream_functions[0] ?? ""}
        onChosen={onChosen}
        dataAttributeOfEachSegment="data-add-stream-function"
      />
    </AddStreamFormRow>
  );
}

const SAMPLE_PROJECT_FILES: readonly { icon: LucideIcon; name: string; description: string }[] = [
  { icon: FileCode2, name: "stream.py", description: "The stream function, main: Tatolab's sample animation through a halftone lens, encoded and shared." },
  { icon: Folder, name: "nodes/", description: "Your Python nodes, one file each: the halftone lens and a brightness meter. Each runs in its own process." },
  { icon: Package, name: "pyproject.toml", description: "Its dependencies, tatolab-stream and numpy, which Tatolab installs before it first runs." },
];

function SampleProjectContents() {
  return (
    <div className="overflow-hidden rounded-lg border" data-add-stream-sample-contents="">
      {SAMPLE_PROJECT_FILES.map((sampleFile) => (
        <div key={sampleFile.name} className="flex gap-2.5 border-b px-3 py-2.5 last:border-b-0">
          <sampleFile.icon className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <div className="font-mono text-sm text-fg">{sampleFile.name}</div>
            <div className="text-xs text-fg-3">{sampleFile.description}</div>
          </div>
        </div>
      ))}
    </div>
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
}: {
  request: AddStreamRunRequest;
  startedAtMs: number;
  makesThePythonEnvironmentFirst: boolean;
  pythonForNewEnvironments: PythonForNewEnvironments;
}) {
  const nowMs = useMonotonicNowMsWhile(true);
  return (
    <div data-add-stream-step="compiling" data-add-stream-makes-the-python-environment={makesThePythonEnvironmentFirst ? "true" : "false"}>
      <AddStreamSectionHeading
        title={
          <>
            {compilingHeadingVerb(makesThePythonEnvironmentFirst)} <span className="font-mono">{compilingStreamWords(request)}</span>
          </>
        }
        lead={
          makesThePythonEnvironmentFirst ? (
            <>
              Tatolab installs what pyproject.toml names with {pythonForNewEnvironmentsWords(pythonForNewEnvironments)}. Then the runtime compiles stream.py, loads and starts it.
            </>
          ) : (
            <>
              The runtime compiles stream.py, then loads and starts it.
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
    <section aria-label="Compile warnings" data-add-stream-compile-warnings="">
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
function usePreviewedOutputOf(streamName: string) {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const isListedLoaded = status.streams?.some((stream) => stream.name === streamName && stream.node_count !== null) ?? false;
  const [previewedOutput, setPreviewedOutput] = useState<StreamGraphExposedPort | null>(null);
  useEffect(() => {
    if (!isListedLoaded) return;
    let isStillShown = true;
    backend.describeStreamGraph(streamName).then(
      (graph) => {
        if (isStillShown) setPreviewedOutput(choosePreviewedOutput(graph, null));
      },
      // A graph not readable yet leaves the done view without a preview; the stream's Overview reads it again.
      () => {},
    );
    return () => {
      isStillShown = false;
    };
  }, [backend, streamName, isListedLoaded]);
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
            <span className="font-mono">{answer.stream}</span> is running
          </h2>
          <p className="mt-1 text-fg-3">
            {streamRunningFactsWords(answer)} · <MachineWords>{answer.project_directory}</MachineWords>
          </p>
          <p className="mt-3 max-w-md text-fg-2">{streamRunningSummary(answer)}</p>
        </div>
      </div>
      <CompileWarningsList compileWarnings={answer.compile_warnings} />
      <CompileOutputWell title="Compile output" isWaiting={false}>
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
  onUseFreeName,
}: {
  form: AddStreamForm;
  onChooseFolder: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
  onUseFreeName: (freeName: string) => void;
}) {
  const report = form.projectFolder;
  return (
    <div data-add-stream-step="project_folder">
      <div className="flex flex-col">
        <ProjectFolderChooserRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={onChooseFolder} />
        {report !== null && <ProjectFolderChecks report={report} />}
      </div>
      {report !== null && (
        <section className="mt-8" aria-label="Configuration">
          <h3 className="label-caps mb-1">Configuration</h3>
          <div className="divide-y border-y">
            <StreamFunctionRow report={report} chosenStreamFunction={form.chosenStreamFunction} onChosen={(streamFunction) => dispatch({ kind: "stream_function_chosen", streamFunction })} />
            <StreamNameRow
              form={form}
              hint="From the stream function. One name per stream on this machine."
              onEdited={(streamName) => dispatch({ kind: "stream_name_edited", streamName })}
              onUseFreeName={onUseFreeName}
            />
            <RunModeRow
              hint={
                <>
                  Kept by the runtime: it loads again whenever the runtime starts. A dev session that reloads on save runs from a terminal: <MachineWords>tatolab dev</MachineWords> in the
                  project folder.
                </>
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

function NewProjectForm({
  form,
  onChooseDirectory,
  dispatch,
  onUseFreeName,
}: {
  form: AddStreamForm;
  onChooseDirectory: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
  onUseFreeName: (freeName: string) => void;
}) {
  const report = form.newProjectFolder;
  if (form.hasCreatedTheNewProject && report !== null) {
    return (
      <div data-add-stream-step="new_project_created">
        <AddStreamSectionHeading
          title="Project created"
          lead={
            <>
              <MachineWords>tatolab new</MachineWords> wrote the sample stream into <MachineWords>{report.folder}</MachineWords>. Add runs it{" "}
              {STREAM_RUN_MODE_LABELS.always_on}.
            </>
          }
        />
        <ProjectFolderChecks report={report} />
        <section className="mt-8" aria-label="Configuration">
          <h3 className="label-caps mb-1">Configuration</h3>
          <div className="divide-y border-y">
            <StreamNameRow
              form={form}
              hint="From the project's folder. One name per stream on this machine."
              onEdited={(streamName) => dispatch({ kind: "stream_name_edited", streamName })}
              onUseFreeName={onUseFreeName}
            />
            <RunModeRow hint="Kept by the runtime: it loads again whenever the runtime starts." />
          </div>
        </section>
      </div>
    );
  }
  return (
    <div data-add-stream-step="new_project">
      <div className="divide-y border-y">
        <AddStreamFormRow
          label="Directory"
          hint={report === null ? undefined : "The folder must not exist yet."}
        >
          <ProjectFolderChooserRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={onChooseDirectory} />
        </AddStreamFormRow>
        {report !== null && (
          <AddStreamFormRow label="Runs" hint="The app runs this for you, then sets up the project's Python and adds it.">
            <CommandWithCopyButton command={newProjectCommand(report.folder)} />
          </AddStreamFormRow>
        )}
        {report !== null && (
          <StreamNameRow
            form={form}
            hint="From the project's folder. One name per stream on this machine."
            onEdited={(streamName) => dispatch({ kind: "stream_name_edited", streamName })}
            onUseFreeName={onUseFreeName}
          />
        )}
        <RunModeRow hint="Kept by the runtime: it loads again whenever the runtime starts." />
      </div>
      <section className="mt-8" aria-label="What you get">
        <h3 className="label-caps mb-1.5">What you get</h3>
        <SampleProjectContents />
      </section>
    </div>
  );
}

/** The bar under the page: the terminal command or what pressing does, and the page's actions for its step. */
function AddStreamFooter({ children }: { children: ReactNode }) {
  return <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t bg-chrome px-(--page-x) py-2.5">{children}</footer>;
}

/** New project or Import project, over the window while the flow's dialog is open: run a project folder kept, or create one with `tatolab new` and run it, the app setting up its Python first. */
export function AddStreamDialogView() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const openDialog = useOpenAddStreamDialog();
  return (
    <FormDialog
      isOpen={openDialog !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) addStreamFlow.closeDialog();
      }}
      title={ADD_STREAM_DIALOG_WORDS[openDialog?.source ?? "project_folder"].title}
      description={ADD_STREAM_DIALOG_WORDS[openDialog?.source ?? "project_folder"].description}
      footer={openDialog !== null && <AddStreamDialogFooter />}
      data-add-stream-page={openDialog?.source}
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

  // An opening while a run compiles is ignored by the flow; once the run answers, the dialog catches up to its source.
  useEffect(() => {
    if (form.source !== source) addStreamFlow.dispatch({ kind: "source_chosen", source });
  }, [addStreamFlow, form.source, source, flowState.step]);

  const needsANewProjectProposal = form.source === "new_project" && form.newProjectFolder === null && form.workUnderWay === null && form.refusal === null;
  useEffect(() => {
    if (needsANewProjectProposal) addStreamFlow.proposeNewProjectFolder();
  }, [addStreamFlow, needsANewProjectProposal]);

  const pageContent = useRef<HTMLDivElement>(null);
  const pageSection = addStreamPageSection(flowState);
  const pageSectionShownBefore = useRef({ pageSection, step: flowState.step });
  useEffect(() => {
    const shownBefore = pageSectionShownBefore.current;
    if (shownBefore.pageSection === pageSection) return;
    pageSectionShownBefore.current = { pageSection, step: flowState.step };
    const focusWasLost = document.activeElement === null || document.activeElement === document.body;
    if (shownBefore.step !== flowState.step || focusWasLost) pageContent.current?.querySelector<HTMLElement>("[data-add-stream-step-heading]")?.focus();
  }, [pageSection, flowState.step]);

  return (
    <div ref={pageContent}>
      <p role="status" className="sr-only">
        {addStreamStepAnnouncement(flowState, isTheRuntimeRunning, status.python_for_new_environments)}
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
        />
      )}
      {flowState.step === "running" && <StreamRunningView request={flowState.request} answer={flowState.answer} />}
      {flowState.step === "form" && form.source === "project_folder" && (
        <ProjectFolderForm
          form={form}
          onChooseFolder={() => addStreamFlow.chooseFolder()}
          dispatch={dispatch}
          onUseFreeName={(freeName) => addStreamFlow.runUnderTheFreeName(freeName)}
        />
      )}
      {flowState.step === "form" && form.source === "new_project" && (
        <NewProjectForm
          form={form}
          onChooseDirectory={() => addStreamFlow.chooseFolder()}
          dispatch={dispatch}
          onUseFreeName={(freeName) => addStreamFlow.runUnderTheFreeName(freeName)}
        />
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
  const terminalRunRequest = terminalRunRequestOf(form);
  const openTheStream = (streamName: string, tab?: StreamPageTab) => {
    addStreamFlow.closeDialog();
    void navigate(streamPagePath(streamName, tab));
  };
  return (
    <AddStreamFooter>
      {flowState.step === "form" && (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-3" data-add-stream-footer-words="">
            {addStreamActionUnavailableReason !== null && form.nameTaken === null ? (
              <span className="truncate text-fg-3">{addStreamActionUnavailableReason}</span>
            ) : addStreamAction === "create" && form.newProjectFolder !== null ? (
              <span className="truncate text-fg-3">
                Creates <MachineWords>{form.newProjectFolder.folder}</MachineWords> with <MachineWords>tatolab new</MachineWords>, then adds it.
              </span>
            ) : terminalRunRequest !== null ? (
              <>
                <div className="max-w-[620px] min-w-0 flex-1">
                  <CommandWithCopyButton command={terminalCommandForTheRun(terminalRunRequest, functionsOwnNameOf(form))} />
                </div>
                <span className="shrink-0 text-xs text-fg-3">the same, from a terminal</span>
              </>
            ) : null}
          </div>
          <ActionButton onPressed={() => addStreamFlow.closeDialog()} data-add-stream-action="cancel">
            Cancel
          </ActionButton>
          <ActionButton
            appearance="primary"
            isDisabled={addStreamActionUnavailableReason !== null}
            onPressed={() => addStreamFlow.performTheAction()}
            data-add-stream-action={addStreamAction}
          >
            {form.workUnderWay === "creating_the_project" ? "Creating…" : ADD_STREAM_ACTION_LABELS[addStreamAction]}
          </ActionButton>
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
    </AddStreamFooter>
  );
}


