// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, ChevronDown, Copy, Globe, Laptop, LoaderCircle, Lock, Play, RotateCw, SquareX, TriangleAlert, Video, Workflow } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import type { ListedStream, StreamGraphExposedPort } from "../backend/tatolab_backend_contract";
import {
  choosePreviewedOutput,
  droppingLinksOf,
  exposedOutputAddress,
  presentExposureLevel,
  presentStreamSteps,
  previewableOutputsOf,
  readableExposedPorts,
  streamObservationCommands,
  streamStepsCountLabel,
  type StreamStepRow,
} from "../presentation/stream_overview_presentation";
import { presentStreamGraphCanvas } from "../presentation/stream_graph_canvas_presentation";
import { stepNamesInFlowOrder } from "../presentation/stream_graph_step_layout";
import { abbreviateHomeDirectory, isStreamLoaded, presentStreamPrimaryAction, presentStreamRunMode, streamNotLoadedReason } from "../presentation/stream_presentation";
import type { StreamGraphReading } from "../stream_graph_readings";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./shadcn/dropdown_menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import type { GraphOutputPortAddress } from "./stream_graph_view";
import { useCopiedConfirmation } from "./copied_confirmation";
import { previewedOutputAskedBy, streamPagePath } from "./stream_page_path";
import type { StreamPageActions } from "./stream_page_header_view";
import { useStreamGraphReading, useTatolabStatus } from "./tatolab_window_context";

/** The output's level beside its lock, laptop or globe, its meaning in a tooltip. */
function ExposureLevelWords({ level, className }: { level: string; className?: string }) {
  const exposureLevel = presentExposureLevel(level);
  const LevelIcon = exposureLevel.icon === "public" ? Globe : exposureLevel.icon === "this_machine" ? Laptop : exposureLevel.icon === "internal" ? Lock : null;
  return (
    <span className={joinClassNames("inline-flex items-center gap-1 text-fg-2", className)} title={exposureLevel.meaning ?? undefined}>
      {LevelIcon !== null && <LevelIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />}
      {exposureLevel.label}
    </span>
  );
}

/** The red row a failed stream carries: the runtime's reason in its own words, and Retry. */
function FailedStreamBanner({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  const retry = presentStreamPrimaryAction(stream);
  return (
    <div role="alert" className="flex min-h-10 items-center gap-2 border-b bg-danger-soft px-5 py-1.5" data-failed-stream-banner="">
      <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 text-fg select-text">
        <span className="text-danger-text">Failed</span> — {stream.failed_because ?? "The runtime gave no reason."}
      </span>
      {retry !== null && streamPageActions.actionUnderWay === undefined && (
        <Button variant="outline" className="ml-auto" data-stream-action="retry_from_the_banner" onClick={() => streamPageActions.runPrimaryAction(retry)}>
          <RotateCw aria-hidden /> {retry.label}
        </Button>
      )}
    </div>
  );
}

function DroppingLinkLines({ stream, reading }: { stream: ListedStream; reading: StreamGraphReading }) {
  if (reading.graph === null || reading.graphSource !== "loaded") return null;
  const droppingLinks = droppingLinksOf(reading.graph);
  if (droppingLinks.length === 0) return null;
  return (
    <div className="-mt-1.5 mb-2.5 max-w-[920px]" data-dropping-links="">
      {droppingLinks.map((droppingLink) => (
        <div key={droppingLink.linkId} className="flex h-8 items-center gap-2">
          <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 truncate text-fg-2">
            <code className="text-xs text-fg">{droppingLink.sourceWords}</code> → <code className="text-xs text-fg">{droppingLink.targetWords}</code> has
            dropped <span className="text-warn-text tabular">{droppingLink.droppedCountText}</span> {droppingLink.isOne ? "message" : "messages"} since it was wired
          </span>
          <Link to={streamPagePath(stream.name, "graph")} className="ml-auto shrink-0 cursor-default text-xs text-brand-text hover:underline">
            Show in graph
          </Link>
        </div>
      ))}
    </div>
  );
}

function PreviewedOutputPicker({
  previewableOutputs,
  previewedOutput,
  onOutputChosen,
}: {
  previewableOutputs: readonly StreamGraphExposedPort[];
  previewedOutput: StreamGraphExposedPort;
  onOutputChosen: (output: GraphOutputPortAddress) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Output to preview"
        data-previewed-output-picker=""
        className="flex h-7 max-w-96 min-w-0 items-center gap-1.5 rounded-md border bg-window pr-1.5 pl-2 hover:bg-hover data-popup-open:bg-hover"
      >
        <Video className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
        <span className="truncate text-fg">{previewedOutput.node}</span>
        <span className="truncate font-mono text-xs text-fg-3">{previewedOutput.port}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {previewableOutputs.map((output) => (
          <DropdownMenuItem key={`${output.node}/${output.port}`} onClick={() => onOutputChosen({ node: output.node, port: output.port })}>
            <Video /> <span className="text-fg">{output.node}</span> <span className="font-mono text-xs text-fg-3">{output.port}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A well in place of the preview, saying why there is none. */
function NothingToPreview({ title, explanation, action }: { title: string; explanation: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid aspect-video max-h-[min(360px,52vh)] w-full place-items-center rounded-md bg-well ring-1 ring-line" data-nothing-to-preview="">
      <div className="flex max-w-sm flex-col items-center gap-1 px-6 text-center">
        <div className="text-fg-2">{title}</div>
        <div className="text-xs text-fg-3">{explanation}</div>
        {action !== undefined && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

function StreamOutputPreview({
  stream,
  reading,
  machineName,
  streamPageActions,
}: {
  stream: ListedStream;
  reading: StreamGraphReading;
  machineName: string | null;
  streamPageActions: StreamPageActions;
}) {
  const location = useLocation();
  const [chosenOutput, setChosenOutput] = useState<GraphOutputPortAddress | null>(() => previewedOutputAskedBy(location.state));
  useEffect(() => {
    const askedOutput = previewedOutputAskedBy(location.state);
    if (askedOutput !== null) setChosenOutput(askedOutput);
  }, [location.state]);
  const notLoadedReason = isStreamLoaded(stream) ? null : streamNotLoadedReason(stream);

  if (notLoadedReason === "stopped") {
    const start = presentStreamPrimaryAction(stream);
    return (
      <NothingToPreview
        title="Stopped, so nothing to preview"
        explanation="Previews play the exposed outputs of a loaded stream."
        action={
          start !== null &&
          streamPageActions.actionUnderWay === undefined && (
            <Button data-stream-action="start_from_the_preview" onClick={() => streamPageActions.runPrimaryAction(start)}>
              <Play aria-hidden /> Start stream
            </Button>
          )
        }
      />
    );
  }
  if (notLoadedReason === "loading") {
    return <NothingToPreview title="Starting…" explanation="Its preview plays here as soon as it runs." />;
  }
  if (notLoadedReason !== null) {
    return <NothingToPreview title="Not loaded, so nothing to preview" explanation="Previews play the exposed outputs of a loaded stream." />;
  }
  if (reading.graph === null || reading.graphSource !== "loaded") {
    return (
      <NothingToPreview
        title={reading.readRefusal === null ? "Reading its graph…" : "Its graph could not be read"}
        explanation={reading.readRefusal ?? "The preview plays its first output exposed to this machine or publicly."}
      />
    );
  }
  const previewableOutputs = previewableOutputsOf(reading.graph);
  const previewedOutput = choosePreviewedOutput(reading.graph, chosenOutput);
  if (previewedOutput === null || previewedOutput.watch_page_url === null) {
    return (
      <NothingToPreview
        title="No exposed output to preview"
        explanation={
          readableExposedPorts(reading.graph).length === 0
            ? `Every output of ${stream.name} is internal. Previews play an output exposed to this machine or publicly.`
            : "The runtime's graph names no machine, so its outputs have no preview page."
        }
      />
    );
  }
  const address = exposedOutputAddress(machineName, stream.name, previewedOutput);
  return (
    <div className="w-full max-w-[920px]" data-stream-output-preview="">
      <div className="mb-2.5 flex items-center gap-3">
        <PreviewedOutputPicker previewableOutputs={previewableOutputs} previewedOutput={previewedOutput} onOutputChosen={setChosenOutput} />
        <ExposureLevelWords level={previewedOutput.level} className="text-xs" />
      </div>
      {/* The runtime's preview page, on its loopback origin: the window's content security policy frames that one origin. */}
      <iframe
        key={previewedOutput.watch_page_url}
        src={previewedOutput.watch_page_url}
        title={`Preview of ${address.fullAddress}`}
        sandbox="allow-scripts allow-same-origin"
        allow="autoplay; fullscreen"
        referrerPolicy="no-referrer"
        className="block aspect-video max-h-[52vh] w-full rounded-md bg-black ring-1 ring-line"
      />
      <div className="mt-1.5 flex h-5 items-center text-xs">
        <span className="min-w-0 truncate font-mono text-fg-3 select-text" title={address.fullAddress}>
          {address.fullAddress}
        </span>
      </div>
    </div>
  );
}

function StepStateWords({ step }: { step: StreamStepRow }) {
  return (
    <span
      className={joinClassNames(
        "inline-flex items-center gap-1.5",
        step.stateEmphasis === "failure" ? "text-danger-text" : step.stateEmphasis === "quiet" ? "text-fg-3" : "text-fg-2",
      )}
    >
      {step.stateEmphasis === "failure" && <SquareX className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
      {step.stateEmphasis === "starting" && <LoaderCircle className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />}
      {step.stateWord}
    </span>
  );
}

function StreamStepsSection({ stream, reading }: { stream: ListedStream; reading: StreamGraphReading }) {
  const graph = reading.graph;
  const nodeNamesInPipelineOrder = useMemo(() => (graph === null ? [] : stepNamesInFlowOrder(presentStreamGraphCanvas(graph))), [graph]);
  const isLoaded = isStreamLoaded(stream);
  const steps = graph === null ? [] : presentStreamSteps(graph, nodeNamesInPipelineOrder, reading.graphSource, isLoaded);
  return (
    <section className="mt-7 max-w-[920px]" data-stream-steps="">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-medium">Steps</h2>
        {graph !== null && <span className="text-fg-3 tabular">{steps.length}</span>}
        {graph !== null && <span className="text-xs text-fg-3">{reading.graphSource === "loaded" ? "in pipeline order" : "as of the last load"}</span>}
        {isLoaded && (
          <Link to={streamPagePath(stream.name, "graph")} className="ml-auto inline-flex cursor-default items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
            <Workflow className="size-3.5" strokeWidth={1.75} aria-hidden /> Open graph
          </Link>
        )}
      </div>
      {graph === null ? (
        <p className="border-t py-3 text-fg-3">{isLoaded ? "Its steps show once its graph is read." : "Its steps show here once it is loaded."}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[24%]" />
            <col />
            <col className="w-[76px]" />
            <col className="w-[96px]" />
            <col className="w-[104px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead>
            <tr className="border-b text-xs text-fg-3">
              <th className="h-7 pr-3 font-normal">Step</th>
              <th className="px-3 font-normal">Type</th>
              <th className="px-3 font-normal">Origin</th>
              <th className="px-3 font-normal">State</th>
              <th className="px-3 font-normal">Process</th>
              <th className="pl-3 text-right font-normal">Counters</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.name} className="h-8 border-b" data-stream-step={step.name}>
                <td className="truncate pr-3 font-mono text-xs text-fg select-text" title={step.name}>
                  {step.name}
                </td>
                <td className="truncate px-3 font-mono text-xs text-fg-3 select-text" title={step.type}>
                  {step.type}
                </td>
                <td className="px-3 text-fg-2">{step.origin ?? "—"}</td>
                <td className="px-3">
                  <StepStateWords step={step} />
                </td>
                <td className="truncate px-3 text-xs text-fg-3">{step.process ?? "—"}</td>
                <td className="pl-3 text-right font-mono text-xs text-warn-text tabular">
                  {step.counters.map((counter) => `${counter.countText} ${counter.word}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A labelled group of the details panel. */
function DetailsPanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col p-2">
      <h2 className="flex h-8 shrink-0 items-center px-2 text-xs font-medium text-fg-3">{label}</h2>
      {children}
    </section>
  );
}

function CopyableTerminalCommand({ command }: { command: string }) {
  const { wasCopied, copy } = useCopiedConfirmation(command);
  return (
    <div className="group flex items-start gap-1.5 py-0.5 font-mono text-xs">
      <span className="text-fg-3 select-none" aria-hidden>
        $
      </span>
      <span className="min-w-0 flex-1 break-words text-fg select-text">{command}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Copy ${command}`}
              onClick={copy}
              className="grid size-5 shrink-0 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            />
          }
        >
          {wasCopied ? <Check className="size-3.5" strokeWidth={1.75} aria-hidden /> : <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />}
        </TooltipTrigger>
        <TooltipContent>{wasCopied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function StreamDetailsPanel({ stream, reading }: { stream: ListedStream; reading: StreamGraphReading }) {
  const runMode = presentStreamRunMode(stream);
  const graph = reading.graph;
  const detailRows: [string, ReactNode][] = [
    [
      "Project",
      <span className="block truncate font-mono text-xs select-text" title={stream.project_directory}>
        {abbreviateHomeDirectory(stream.project_directory)}
      </span>,
    ],
    [
      "Run mode",
      runMode === null ? (
        <span className="text-fg-3">—</span>
      ) : (
        <span>
          {runMode.label} <span className="font-mono text-xs text-fg-3">· {runMode.runtimeTerm}</span>
        </span>
      ),
    ],
    ["Instance", reading.streamInstance === null ? <span className="text-fg-3">Not loaded</span> : <span className="font-mono text-xs select-text">{reading.streamInstance}</span>],
  ];
  const readableOutputs = graph === null ? [] : readableExposedPorts(graph);
  const isFromTheLastLoad = graph !== null && reading.graphSource !== "loaded";
  detailRows.push([
    "Steps",
    <span className="tabular">
      {streamStepsCountLabel(graph, stream)}
      {isFromTheLastLoad && <span className="text-fg-3"> · last load</span>}
    </span>,
  ]);
  return (
    <aside
      aria-label={`${stream.name} details`}
      className="grid shrink-0 grid-cols-1 border-t bg-chrome py-1 sm:grid-cols-3 xl:block xl:w-80 xl:border-t-0 xl:border-l"
      data-stream-details=""
    >
      <DetailsPanelGroup label="Details">
        <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-2 pt-0.5 pb-1">
          {detailRows.map(([term, description]) => (
            <div key={term} className="contents">
              <dt className="text-fg-3">{term}</dt>
              <dd className="min-w-0 text-fg">{description}</dd>
            </div>
          ))}
        </dl>
      </DetailsPanelGroup>
      <DetailsPanelGroup label={isFromTheLastLoad ? "Outputs as of the last load" : "Outputs"}>
        {graph === null ? (
          <p className="px-2 text-fg-3">{isStreamLoaded(stream) ? "Its outputs show once its graph is read." : "Its outputs show once it is loaded."}</p>
        ) : readableOutputs.length === 0 ? (
          <p className="px-2 text-fg-3">Every output is internal.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {readableOutputs.map((output) => (
              <li key={`${output.node}/${output.port}`} className="px-2 py-1">
                <div className="truncate font-mono text-xs text-fg select-text">
                  {output.node}/{output.port}
                </div>
                <ExposureLevelWords level={output.level} className="mt-0.5 text-xs" />
              </li>
            ))}
          </ul>
        )}
      </DetailsPanelGroup>
      <DetailsPanelGroup label="From the terminal">
        <div className="mx-2 rounded-md border bg-raised px-2 py-1.5">
          {streamObservationCommands(stream.name).map((command) => (
            <CopyableTerminalCommand key={command} command={command} />
          ))}
        </div>
      </DetailsPanelGroup>
    </aside>
  );
}

/** A stream's Overview: why it failed, the links dropping messages, its exposed output playing, its steps, and its details. */
export function StreamOverviewPageView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  const status = useTatolabStatus();
  const reading = useStreamGraphReading(stream.name);
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto" data-stream-overview="">
      {stream.state === "failed" && <FailedStreamBanner stream={stream} streamPageActions={streamPageActions} />}
      {/* Below 1280 px the details sit under the Overview, so the steps table keeps room for its columns. */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="min-w-0 flex-1 px-5 pt-5 pb-8">
          <DroppingLinkLines stream={stream} reading={reading} />
          <StreamOutputPreview stream={stream} reading={reading} machineName={status.machine_name} streamPageActions={streamPageActions} />
          <StreamStepsSection stream={stream} reading={reading} />
        </div>
        <StreamDetailsPanel stream={stream} reading={reading} />
      </div>
    </div>
  );
}
