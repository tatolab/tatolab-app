// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { Check, FileCode2, Folder, FolderOpen, FolderPlus, LoaderCircle, type LucideIcon, Package, RotateCw, SquareTerminal, TriangleAlert, Workflow } from "lucide-react";
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { StreamGraphExposedPort, StreamProjectFolderReport, StreamRunAnswer } from "../backend/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { ListRowButton } from "../design_system/list_row_button";
import { RefusalLine } from "../design_system/refusal_line";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { TextField } from "../design_system/text_field";
import {
  advanceAddStreamFlow,
  compileAndRunUnavailableBecause,
  compilingForWords,
  folderToRun,
  initialAddStreamFlowState,
  newProjectCommand,
  pythonEnvironmentSyncCommand,
  runRequestOf,
  stepCountWords,
  streamRunningSummary,
  terminalCommandForTheRun,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
  type AddStreamForm,
  type AddStreamRunRequest,
  type AddStreamSource,
} from "../presentation/add_stream_flow";
import { presentPlatform } from "../presentation/platform_presentation";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { readableExposedPorts } from "../presentation/stream_overview_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { CommandWithCopyButton } from "./stream_action_controls";
import { streamPagePath } from "./stream_page_path";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The path of the Add stream page starting from `source`. */
export function addStreamPagePath(source: AddStreamSource): string {
  return source === "new_project" ? "/add-stream/new-project" : "/add-stream";
}

const ADD_STREAM_SOURCES: readonly { source: AddStreamSource; label: string; icon: LucideIcon }[] = [
  { source: "project_folder", label: "Run a project folder", icon: FolderOpen },
  { source: "new_project", label: "Create a new project", icon: FolderPlus },
];

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

/** One labelled row of the add-stream form: what it sets, the control, and a hint under it. */
function AddStreamFormRow({ label, hint, hintId, children }: { label: string; hint?: ReactNode; hintId?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4 py-3">
      <div className="pt-1 text-fg-2">{label}</div>
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

function AddStreamSectionHeading({ title, lead }: { title: ReactNode; lead: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
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

function ProjectFolderCheckRow({ icon: CheckIcon, name, isFound, detail, children }: { icon: LucideIcon; name: string; isFound: boolean; detail: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b px-3 py-2.5 last:border-b-0" data-add-stream-check={name} data-add-stream-check-found={isFound ? "true" : "false"}>
      <div className="flex items-center gap-3">
        <CheckIcon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
        <span className="w-24 shrink-0 font-mono text-sm text-fg">{name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{detail}</span>
        {isFound ? (
          <span className="inline-flex items-center gap-1.5 text-fg-2">
            <Check className="size-3.5" strokeWidth={2} aria-hidden />
            Found
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-warn-text">
            <TriangleAlert className="size-3.5 text-warn" strokeWidth={1.75} aria-hidden />
            Missing
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function streamFileDetail(report: StreamProjectFolderReport): string {
  if (!report.stream_file_present) return "The stream function the runtime compiles lives in stream.py.";
  if (report.stream_functions.length === 0) return "No @stream function found by reading it; the runtime decides when it compiles.";
  if (report.stream_functions.length === 1) return `Stream function ${report.stream_functions[0]}()`;
  return `Stream functions ${report.stream_functions.map((streamFunction) => `${streamFunction}()`).join(", ")}`;
}

function pythonEnvironmentDetail(report: StreamProjectFolderReport): string {
  const pythonEnvironment = report.python_environment;
  if (pythonEnvironment.kind === "missing") return "The stream compiles in the project's own .venv/bin/python.";
  const versions = [
    pythonEnvironment.python_version === null ? "Python" : `Python ${pythonEnvironment.python_version}`,
    pythonEnvironment.tatolab_stream_version === null ? null : `tatolab-stream ${pythonEnvironment.tatolab_stream_version}`,
  ].filter((version) => version !== null);
  return versions.join(" · ");
}

/** What the folder holds that `run_stream` needs, and how to fix a missing `.venv`. */
function ProjectFolderChecks({
  report,
  workUnderWay,
  onCheckAgain,
  onOpenTerminal,
}: {
  report: StreamProjectFolderReport;
  workUnderWay: AddStreamForm["workUnderWay"];
  onCheckAgain: () => void;
  onOpenTerminal: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border" data-add-stream-checks="">
      <ProjectFolderCheckRow icon={FileCode2} name="stream.py" isFound={report.stream_file_present} detail={streamFileDetail(report)} />
      <ProjectFolderCheckRow icon={Package} name=".venv" isFound={report.python_environment.kind === "present"} detail={pythonEnvironmentDetail(report)}>
        {report.python_environment.kind === "missing" && (
          <div className="mt-2.5 flex flex-col gap-2 pl-7">
            <p className="text-xs text-fg-3">Run this in a terminal to create it, then check again.</p>
            <CommandWithCopyButton command={pythonEnvironmentSyncCommand(report.folder)} />
            <div className="flex items-center justify-end gap-2">
              <ActionButton icon={SquareTerminal} isDisabled={workUnderWay !== null} onPressed={onOpenTerminal} data-add-stream-action="open_terminal">
                Open in Terminal
              </ActionButton>
              <ActionButton icon={RotateCw} isDisabled={workUnderWay !== null} onPressed={onCheckAgain} data-add-stream-action="check_again">
                {workUnderWay === "checking_the_folder" ? "Checking…" : "Check again"}
              </ActionButton>
            </div>
          </div>
        )}
      </ProjectFolderCheckRow>
    </div>
  );
}

/** The name the stream loads under, and the runtime's refusal when a listed stream holds it, with the name to use instead. */
function StreamNameRow({ form, hint, onEdited, onUseFreeName }: { form: AddStreamForm; hint: ReactNode; onEdited: (streamName: string) => void; onUseFreeName: (freeName: string) => void }) {
  const nameTaken = form.nameTaken;
  return (
    <AddStreamFormRow label="Name" hint={nameTaken === null ? hint : undefined} hintId="add-stream-name-hint">
      <TextField
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
              Use <span className="font-mono">{nameTaken.freeName}</span>
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
          { choice: "kept", label: "Always on" },
          { choice: "attached", label: "Dev session", unavailableBecause: "A dev session lives as long as the terminal that runs it. Start one with tatolab dev in the project folder." },
        ]}
        chosen="kept"
        onChosen={() => {}}
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
  { icon: Package, name: "pyproject.toml", description: "Its dependencies, tatolab-stream and numpy, which uv sync installs into the project's .venv." },
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

function runRequestWords(request: AddStreamRunRequest): string {
  const requestWords = ["run_stream", request.folder];
  if (request.streamFunction !== null) requestWords.push(`stream_function=${request.streamFunction}`);
  if (request.streamName !== null) requestWords.push(`name=${request.streamName}`);
  requestWords.push("keep=true");
  return requestWords.join("  ");
}

function CompilingView({ request, startedAtMs }: { request: AddStreamRunRequest; startedAtMs: number }) {
  const nowMs = useMonotonicNowMsWhile(true);
  return (
    <div data-add-stream-step="compiling">
      <AddStreamSectionHeading
        title={
          <>
            Compiling <span className="font-mono">{request.streamName ?? "the stream"}</span>
          </>
        }
        lead={
          <>
            The runtime compiles stream.py in <MachineWords>{request.folder}/.venv/bin/python</MachineWords>, then loads and starts it.
          </>
        }
      />
      <CompileOutputWell title={request.folder} isWaiting>
        <CompileOutputLine tone="quiet">{runRequestWords(request)}</CompileOutputLine>
        <CompileOutputLine tone="quiet">
          waiting for the runtime's answer · {compilingForWords(startedAtMs, nowMs)}
        </CompileOutputLine>
      </CompileOutputWell>
    </div>
  );
}

/** The `compile_warnings` a run answered, for the person to read before they move on. */
function CompileWarningsList({ compileWarnings }: { compileWarnings: readonly string[] }) {
  if (compileWarnings.length === 0) return null;
  return (
    <section aria-label="Compile warnings" data-add-stream-compile-warnings="">
      <h3 className="label-caps mb-1.5">
        {compileWarnings.length} compile {compileWarnings.length === 1 ? "warning" : "warnings"}
      </h3>
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

/** The first output the new stream exposes beyond itself with a preview page, once its graph is read. */
function usePreviewedOutputOf(streamName: string): StreamGraphExposedPort | null {
  const { backend } = useTatolabWindowEnvironment();
  const [previewedOutput, setPreviewedOutput] = useState<StreamGraphExposedPort | null>(null);
  useEffect(() => {
    let isStillShown = true;
    backend.describeStreamGraph(streamName).then(
      (graph) => {
        if (isStillShown) setPreviewedOutput(readableExposedPorts(graph).find((exposedPort) => exposedPort.watch_page_url !== null) ?? null);
      },
      () => {},
    );
    return () => {
      isStillShown = false;
    };
  }, [backend, streamName]);
  return previewedOutput;
}

function StreamRunningView({ request, answer }: { request: AddStreamRunRequest; answer: StreamRunAnswer }) {
  const previewedOutput = usePreviewedOutputOf(answer.stream);
  const watchPageUrl = previewedOutput?.watch_page_url ?? null;
  const previewedAddress = previewedOutput === null ? "" : `${answer.stream}/${previewedOutput.node}/${previewedOutput.port}`;
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
          <h2 className="title-lg">
            <span className="font-mono">{answer.stream}</span> is running
          </h2>
          <p className="mt-1 text-fg-3">
            Always on · {stepCountWords(answer.node_count)} · <MachineWords>{answer.project_directory}</MachineWords>
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
        <CompileOutputLine>
          loaded {answer.stream} as instance {answer.stream_instance}: {stepCountWords(answer.node_count)}
          {answer.replaced_the_kept_record ? ", in place of the stream this project kept" : ""}
        </CompileOutputLine>
        <CompileOutputLine>{answer.stream} is running; kept, so it loads again whenever the runtime starts</CompileOutputLine>
      </CompileOutputWell>
    </div>
  );
}

function ProjectFolderForm({
  form,
  onChooseFolder,
  onCheckAgain,
  onOpenTerminal,
  dispatch,
  onUseFreeName,
}: {
  form: AddStreamForm;
  onChooseFolder: () => void;
  onCheckAgain: () => void;
  onOpenTerminal: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
  onUseFreeName: (freeName: string) => void;
}) {
  const report = form.projectFolder;
  return (
    <div data-add-stream-step="project_folder">
      <AddStreamSectionHeading title="Run a project folder" lead="A folder with a stream.py and its own .venv. The runtime compiles it there, then loads and starts it." />
      <div className="flex flex-col gap-3">
        <ProjectFolderChooserRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={onChooseFolder} />
        {report !== null && <ProjectFolderChecks report={report} workUnderWay={form.workUnderWay} onCheckAgain={onCheckAgain} onOpenTerminal={onOpenTerminal} />}
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
  onCheckAgain,
  onOpenTerminal,
  dispatch,
  onUseFreeName,
}: {
  form: AddStreamForm;
  onChooseDirectory: () => void;
  onCheckAgain: () => void;
  onOpenTerminal: () => void;
  dispatch: (event: AddStreamFlowEvent) => void;
  onUseFreeName: (freeName: string) => void;
}) {
  const report = form.newProjectFolder;
  if (form.hasCreatedTheNewProject && report !== null) {
    return (
      <div data-add-stream-step="new_project_created">
        <AddStreamSectionHeading
          title="Create a new project"
          lead={
            <>
              <MachineWords>tatolab new</MachineWords> wrote the sample stream into <MachineWords>{report.folder}</MachineWords>. Sync its .venv, then compile and run it.
            </>
          }
        />
        <ProjectFolderChecks report={report} workUnderWay={form.workUnderWay} onCheckAgain={onCheckAgain} onOpenTerminal={onOpenTerminal} />
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
      <AddStreamSectionHeading
        title="Create a new project"
        lead={
          <>
            <MachineWords>tatolab new</MachineWords> writes the sample stream into a new folder. Once its .venv is synced, the app runs it Always on.
          </>
        }
      />
      <div className="divide-y border-y">
        <AddStreamFormRow
          label="Directory"
          hint={
            report === null ? undefined : (
              <>
                Loads as <MachineWords>{form.streamName}</MachineWords>. The folder must not exist yet.
              </>
            )
          }
        >
          <ProjectFolderChooserRow folder={report?.folder ?? null} isChoosing={form.workUnderWay === "choosing_a_folder"} onChoose={onChooseDirectory} />
        </AddStreamFormRow>
        {report !== null && (
          <AddStreamFormRow label="Runs" hint="The app runs this for you. Then sync the project's .venv with uv, and compile and run it.">
            <CommandWithCopyButton command={newProjectCommand(report.folder)} />
          </AddStreamFormRow>
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
  return <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t bg-chrome px-5 py-2.5">{children}</footer>;
}

/** The Add stream page: run a project folder kept, or create one with `tatolab new` and run it once its `.venv` is synced. */
export function AddStreamPageView({ source }: { source: AddStreamSource }) {
  const { backend, platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const navigate = useNavigate();
  const [flowState, dispatch] = useReducer(
    (state: AddStreamFlowState, event: AddStreamFlowEvent) => advanceAddStreamFlow(state, event),
    source,
    initialAddStreamFlowState,
  );
  const form = flowState.form;
  const isTheRuntimeRunning = presentRuntimeStatus(status).displayState === "running";
  const machineWords = status.machine_name ?? presentPlatform(platform).thisMachineMidSentence;

  useEffect(() => {
    if (form.source !== source) dispatch({ kind: "source_chosen", source });
  }, [form.source, source]);

  const needsANewProjectProposal = form.source === "new_project" && form.newProjectFolder === null && form.workUnderWay === null && form.refusal === null;
  useEffect(() => {
    if (!needsANewProjectProposal) return;
    dispatch({ kind: "work_started", work: "choosing_a_folder" });
    backend.proposeNewStreamProjectFolder().then(
      (report) => dispatch({ kind: "new_project_folder_answered", report }),
      (rejection: unknown) => dispatch({ kind: "work_refused", lead: "No directory was proposed:", words: describeBackendRejection(rejection) }),
    );
  }, [backend, needsANewProjectProposal]);

  const folderAnsweredEvent = (report: StreamProjectFolderReport): AddStreamFlowEvent =>
    form.source === "project_folder" ? { kind: "project_folder_answered", report } : { kind: "new_project_folder_answered", report };

  const chooseFolder = () => {
    dispatch({ kind: "work_started", work: "choosing_a_folder" });
    backend.chooseStreamProjectFolder(form.source === "project_folder" ? "project_to_run" : "new_project_directory").then(
      (report) => dispatch(report === null ? { kind: "folder_dialog_cancelled" } : folderAnsweredEvent(report)),
      (rejection: unknown) => dispatch({ kind: "work_refused", lead: "The folder dialog was refused:", words: describeBackendRejection(rejection) }),
    );
  };
  const checkAgain = () => {
    const folder = folderToRun(form);
    if (folder === null) return;
    dispatch({ kind: "work_started", work: "checking_the_folder" });
    backend.checkStreamProjectFolder(folder.folder).then(
      (report) => dispatch(folderAnsweredEvent(report)),
      (rejection: unknown) => dispatch({ kind: "work_refused", lead: "Check again was refused:", words: describeBackendRejection(rejection) }),
    );
  };
  const openTerminal = () => {
    const folder = folderToRun(form);
    if (folder === null) return;
    dispatch({ kind: "work_started", work: "opening_a_terminal" });
    backend.openTerminalAtChosenProjectFolder(folder.folder).then(
      () => dispatch({ kind: "terminal_opened" }),
      (rejection: unknown) => dispatch({ kind: "work_refused", lead: "No terminal opened:", words: describeBackendRejection(rejection) }),
    );
  };
  const createProject = () => {
    const newProjectFolder = form.newProjectFolder;
    if (newProjectFolder === null) return;
    dispatch({ kind: "work_started", work: "creating_the_project" });
    backend.createStreamProject(newProjectFolder.folder).then(
      (report) => dispatch({ kind: "new_project_created", report }),
      (rejection: unknown) => dispatch({ kind: "work_refused", lead: "Create was refused:", words: describeBackendRejection(rejection) }),
    );
  };
  const run = (request: AddStreamRunRequest) => {
    dispatch({ kind: "run_started", request, nowMs: performance.now() });
    backend.runStreamProject(request.folder, request.streamFunction, request.streamName).then(
      (outcome) => dispatch({ kind: "run_answered", outcome }),
      (rejection: unknown) => dispatch({ kind: "run_refused", words: describeBackendRejection(rejection) }),
    );
  };
  const runRequest = runRequestOf(form);
  const compileAndRun = () => {
    if (runRequest !== null) run(runRequest);
  };
  const useFreeName = (freeName: string) => {
    if (runRequest !== null) run({ ...runRequest, streamName: freeName });
  };
  const chooseSource = (chosenSource: AddStreamSource) => navigate(addStreamPagePath(chosenSource), { replace: true });

  const compileAndRunUnavailableReason = compileAndRunUnavailableBecause(form, isTheRuntimeRunning);
  const folderOfTheRun = folderToRun(form);
  const functionsOwnName = folderOfTheRun === null ? null : (form.chosenStreamFunction ?? folderOfTheRun.stream_functions[0] ?? null);

  return (
    <div className="flex min-h-full flex-1 flex-col" data-add-stream-page={form.source}>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r bg-chrome" aria-label="Start from">
          <div className="px-4 pt-5 pb-2">
            <h1 className="title-lg">Add stream</h1>
          </div>
          <h2 className="label-caps px-4 pt-1 pb-1">Start from</h2>
          <div className="flex flex-col gap-px px-2">
            {ADD_STREAM_SOURCES.map((addStreamSource) => (
              <ListRowButton
                key={addStreamSource.source}
                icon={addStreamSource.icon}
                isSelected={addStreamSource.source === form.source}
                isDisabled={flowState.step === "compiling"}
                aria-pressed={addStreamSource.source === form.source}
                onPressed={() => chooseSource(addStreamSource.source)}
                data-add-stream-source={addStreamSource.source}
              >
                {addStreamSource.label}
              </ListRowButton>
            ))}
          </div>
          <p className="mt-auto px-4 pt-6 pb-4 text-xs text-fg-3">
            Streams run on {status.machine_name === null ? machineWords : <MachineWords>{machineWords}</MachineWords>}.
          </p>
        </aside>

        <div className="min-w-0 flex-1">
          {form.refusal !== null && flowState.step === "form" && (
            <div className="border-b px-8 py-2" data-add-stream-refusal="">
              <RefusalLine lead={form.refusal.lead} words={form.refusal.words} />
            </div>
          )}
          <div className="mx-auto max-w-[760px] px-8 pt-5 pb-10">
            {flowState.step === "compiling" && <CompilingView request={flowState.request} startedAtMs={flowState.startedAtMs} />}
            {flowState.step === "running" && <StreamRunningView request={flowState.request} answer={flowState.answer} />}
            {flowState.step === "form" && form.source === "project_folder" && (
              <ProjectFolderForm form={form} onChooseFolder={chooseFolder} onCheckAgain={checkAgain} onOpenTerminal={openTerminal} dispatch={dispatch} onUseFreeName={useFreeName} />
            )}
            {flowState.step === "form" && form.source === "new_project" && (
              <NewProjectForm form={form} onChooseDirectory={chooseFolder} onCheckAgain={checkAgain} onOpenTerminal={openTerminal} dispatch={dispatch} onUseFreeName={useFreeName} />
            )}
          </div>
        </div>
      </div>

      <AddStreamFooter>
        {flowState.step === "form" && (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {form.source === "new_project" && !form.hasCreatedTheNewProject ? (
                <span className="truncate text-fg-3">
                  {form.newProjectFolder === null ? (
                    "Choose a directory for the new project."
                  ) : (
                    <>
                      Creates <MachineWords>{form.newProjectFolder.folder}</MachineWords> with <MachineWords>tatolab new</MachineWords>.
                    </>
                  )}
                </span>
              ) : runRequest !== null ? (
                <>
                  <div className="max-w-[620px] min-w-0 flex-1">
                    <CommandWithCopyButton command={terminalCommandForTheRun(runRequest, functionsOwnName)} />
                  </div>
                  <span className="shrink-0 text-xs text-fg-3">the same, from a terminal</span>
                </>
              ) : (
                <span className="truncate text-fg-3">{compileAndRunUnavailableReason}</span>
              )}
            </div>
            <ActionButton onPressed={() => navigate(-1)} data-add-stream-action="cancel">
              Cancel
            </ActionButton>
            {form.source === "new_project" && !form.hasCreatedTheNewProject ? (
              <ActionButton
                appearance="primary"
                isDisabled={form.newProjectFolder === null || form.workUnderWay !== null}
                onPressed={createProject}
                data-add-stream-action="create"
              >
                {form.workUnderWay === "creating_the_project" ? "Creating…" : "Create"}
              </ActionButton>
            ) : (
              <ActionButton
                appearance="primary"
                isDisabled={compileAndRunUnavailableReason !== null}
                tooltip={compileAndRunUnavailableReason ?? undefined}
                onPressed={compileAndRun}
                data-add-stream-action="compile_and_run"
              >
                Compile and run
              </ActionButton>
            )}
          </>
        )}
        {flowState.step === "compiling" && (
          <span className="inline-flex items-center gap-2 text-fg-2" role="status">
            <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} aria-hidden />
            Compiling…
          </span>
        )}
        {flowState.step === "running" && (
          <>
            <ActionButton appearance="quiet" onPressed={() => dispatch({ kind: "add_another" })} data-add-stream-action="add_another">
              Add another
            </ActionButton>
            <div className="ml-auto flex gap-2">
              <ActionButton icon={Workflow} onPressed={() => navigate(streamPagePath(flowState.answer.stream, "graph"))} data-add-stream-action="open_graph">
                Open graph
              </ActionButton>
              <ActionButton appearance="primary" onPressed={() => navigate(streamPagePath(flowState.answer.stream))} data-add-stream-action="open_stream">
                Open stream
              </ActionButton>
            </div>
          </>
        )}
      </AddStreamFooter>
    </div>
  );
}
