import { Play, TriangleAlert, Video, Workflow } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { ListedStream, StreamGraphExposedPort } from "../../shared/tatolab_backend_contract";
import {
  choosePreviewedOutput,
  droppingLinksOf,
  exposedOutputAddress,
  presentStreamSteps,
  previewableOutputsOf,
  readableExposedPorts,
  streamObservationCommands,
  streamStepsCountLabel,
} from "../presentation/stream_overview_presentation";
import { presentStreamGraphCanvas } from "../presentation/stream_graph_canvas_presentation";
import { stepNamesInFlowOrder } from "../presentation/stream_graph_step_layout";
import { abbreviateHomeDirectory, isStreamLoaded, presentStreamPrimaryAction, streamNotLoadedReason } from "../presentation/stream_presentation";
import type { StreamGraphReading } from "../stream_graph_readings";
import { ActionButton } from "../design_system/action_button";
import { CopyIconButton } from "../design_system/copy_icon_button";
import { EmptyState } from "../design_system/empty_state";
import { ExposureLevelWords } from "../design_system/exposure_level_words";
import { FailureBanner } from "../design_system/failure_banner";
import { InlineLink } from "../design_system/inline_link";
import { KeyValueRows, type KeyValueRow } from "../design_system/key_value_rows";
import { FieldMenu, MenuItem } from "../design_system/menus";
import { PageBody } from "../design_system/page_frame";
import { PanelSection } from "../design_system/panel_section";
import { StateWords } from "../design_system/stream_state_words";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { previewedOutputAskedBy, streamPagePath, type GraphOutputPortAddress } from "./stream_page_path";
import type { StreamPageActions } from "./stream_page_header_view";
import { useStreamGraphReading, useTatolabStatus } from "./tatolab_window_context";

/** The red row a failed stream carries: the runtime's reason in its own words; Retry is the bar's. */
function FailedStreamBanner({ stream }: { stream: ListedStream }) {
  return (
    <FailureBanner place="page" data-failed-stream-banner="">
      <span className="text-danger-text">Failed</span> — {stream.failed_because ?? "The runtime gave no reason."}
    </FailureBanner>
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
          <span className="ml-auto text-xs">
            <InlineLink destination={{ to: streamPagePath(stream.name, "graph") }}>Show in graph</InlineLink>
          </span>
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
    <FieldMenu
      label="Output to preview"
      leading={<Video className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />}
      words={
        <>
          <span className="truncate text-fg">{previewedOutput.node}</span>
          <span className="truncate font-mono text-xs text-fg-3">{previewedOutput.port}</span>
        </>
      }
      data-previewed-output-picker=""
    >
      {previewableOutputs.map((output) => (
        <MenuItem key={`${output.node}/${output.port}`} icon={Video} onChosen={() => onOutputChosen({ node: output.node, port: output.port })}>
          <span className="text-fg">{output.node}</span> <span className="font-mono text-xs text-fg-3">{output.port}</span>
        </MenuItem>
      ))}
    </FieldMenu>
  );
}

/** A well in place of the preview, saying why there is none. */
function NothingToPreview({ title, explanation, action }: { title: string; explanation: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid aspect-video max-h-[min(360px,52vh)] w-full place-items-center rounded-md bg-well ring-1 ring-line" data-nothing-to-preview="">
      <EmptyState title={title} explanation={explanation}>
        {action}
      </EmptyState>
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
            <ActionButton appearance="primary" icon={Play} onPressed={() => streamPageActions.runPrimaryAction(start)} data-stream-action="start_from_the_preview">
              Start stream
            </ActionButton>
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
        <ExposureLevelWords level={previewedOutput.level} />
      </div>
      <ExposedOutputWatchPageFrame
        watchPageUrl={previewedOutput.watch_page_url}
        fullAddress={address.fullAddress}
        className="aspect-video max-h-[52vh] w-full rounded-md"
      />
      <div className="mt-1.5 flex h-5 items-center text-xs">
        <span className="min-w-0 truncate font-mono text-fg-3 select-text" title={address.fullAddress}>
          {address.fullAddress}
        </span>
      </div>
    </div>
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
        <h2 className="font-medium">Nodes</h2>
        {graph !== null && <span className="text-fg-3 tabular">{steps.length}</span>}
        {graph !== null && <span className="text-xs text-fg-3">{reading.graphSource === "loaded" ? "in pipeline order" : "as of the last load"}</span>}
        {isLoaded && (
          <span className="ml-auto text-xs">
            <InlineLink destination={{ to: streamPagePath(stream.name, "graph") }} tone="quiet" icon={Workflow}>
              Open graph
            </InlineLink>
          </span>
        )}
      </div>
      {graph === null ? (
        <p className="border-t py-3 text-fg-3">{isLoaded ? "Its nodes show once its graph is read." : "Its nodes show here once it is loaded."}</p>
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
              <th className="h-7 pr-3 font-normal">Node</th>
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
                  <StateWords emphasis={step.stateEmphasis} words={step.stateWord} />
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

function CopyableTerminalCommand({ command }: { command: string }) {
  return (
    <div className="flex items-start gap-1.5 py-0.5 font-mono text-xs">
      <span className="text-fg-3 select-none" aria-hidden>
        $
      </span>
      <span className="min-w-0 flex-1 break-words text-fg select-text">{command}</span>
      <CopyIconButton label={`Copy ${command}`} readTextToCopy={() => command} size="compact" />
    </div>
  );
}

function StreamDetailsPanel({ stream, reading }: { stream: ListedStream; reading: StreamGraphReading }) {
  const graph = reading.graph;
  const detailRows: KeyValueRow[] = [
    [
      "Project",
      <span className="block truncate font-mono text-xs select-text" title={stream.project_directory}>
        {abbreviateHomeDirectory(stream.project_directory)}
      </span>,
    ],
    ["Instance", reading.streamInstance === null ? <span className="text-fg-3">Not loaded</span> : <span className="font-mono text-xs select-text">{reading.streamInstance}</span>],
  ];
  const readableOutputs = graph === null ? [] : readableExposedPorts(graph);
  const isFromTheLastLoad = graph !== null && reading.graphSource !== "loaded";
  detailRows.push([
    "Nodes",
    <span className="tabular">
      {streamStepsCountLabel(graph, stream)}
      {isFromTheLastLoad && <span className="text-fg-3"> · last load</span>}
    </span>,
  ]);
  return (
    <aside
      aria-label={`${stream.name} details`}
      className="scrollbar-thin grid shrink-0 grid-cols-1 border-t bg-chrome py-1 sm:grid-cols-3 xl:block xl:w-80 xl:overflow-y-auto xl:border-t-0 xl:border-l"
      data-stream-details=""
    >
      <PanelSection title="Details" isTheTopHeading>
        <KeyValueRows rows={detailRows} />
      </PanelSection>
      <PanelSection title={isFromTheLastLoad ? "Outputs as of the last load" : "Outputs"} isTheTopHeading>
        {graph === null ? (
          <p className="text-fg-3">{isStreamLoaded(stream) ? "Its outputs show once its graph is read." : "Its outputs show once it is loaded."}</p>
        ) : readableOutputs.length === 0 ? (
          <p className="text-fg-3">Every output is internal.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {readableOutputs.map((output) => (
              <li key={`${output.node}/${output.port}`} className="flex items-start gap-2 py-1" data-stream-output={`${output.node}/${output.port}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-fg select-text">
                    {output.node}/{output.port}
                  </div>
                  <div className="mt-0.5">
                    <ExposureLevelWords level={output.level} />
                  </div>
                </div>
                {output.watch_page_url !== null && (
                  <CopyIconButton
                    label="Copy preview link"
                    size="compact"
                    readTextToCopy={() => output.watch_page_url ?? ""}
                    data-stream-output-action="copy_preview_link"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title="From the terminal" isTheTopHeading>
        <div className="rounded-md border bg-raised px-2 py-1.5">
          {streamObservationCommands(stream.name).map((command) => (
            <CopyableTerminalCommand key={command} command={command} />
          ))}
        </div>
      </PanelSection>
    </aside>
  );
}

/** A stream's Overview: why it failed, the links dropping messages, its exposed output playing, its steps, and its details. */
export function StreamOverviewPageView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  const status = useTatolabStatus();
  const reading = useStreamGraphReading(stream.name);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stream-overview="">
      {stream.state === "failed" && <FailedStreamBanner stream={stream} />}
      <PageBody sidePanel={<StreamDetailsPanel stream={stream} reading={reading} />}>
        <DroppingLinkLines stream={stream} reading={reading} />
        <StreamOutputPreview stream={stream} reading={reading} machineName={status.machine_name} streamPageActions={streamPageActions} />
        <StreamStepsSection stream={stream} reading={reading} />
      </PageBody>
    </div>
  );
}
