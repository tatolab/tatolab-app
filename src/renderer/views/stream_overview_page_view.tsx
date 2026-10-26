import { cn } from "cn";
import { Play, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { ListedStream, StreamGraphExposedPort } from "../../shared/tatolab_backend_contract";
import {
  droppingLinksOf,
  exposedOutputAddress,
  presentStreamSteps,
  readableExposedPorts,
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
import { PageBody } from "../design_system/page_frame";
import { PanelSection } from "../design_system/panel_section";
import { SidePanel, WorkAreaWithSidePanel } from "../design_system/side_panel";
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

/** The output a navigation asked the Overview to show, as Search's "show in Overview" does; `null` for none. */
function useOutputAskedToShow(): GraphOutputPortAddress | null {
  const location = useLocation();
  return previewedOutputAskedBy(location.state);
}

/** One exposed output playing: its preview, and under it its node and port, its exposure and its preview link to copy. */
function ExposedOutputTile({ stream, output, machineName, isAsked }: { stream: ListedStream; output: StreamGraphExposedPort; machineName: string | null; isAsked: boolean }) {
  const tileElement = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isAsked) tileElement.current?.scrollIntoView?.({ block: "nearest" });
  }, [isAsked]);
  const watchPageUrl = output.watch_page_url;
  if (watchPageUrl === null) return null;
  const address = exposedOutputAddress(machineName, stream.name, output);
  return (
    <figure ref={tileElement} className="min-w-0" data-stream-output-preview={`${output.node}/${output.port}`}>
      <ExposedOutputWatchPageFrame watchPageUrl={watchPageUrl} fullAddress={address.fullAddress} className={cn("aspect-video w-full rounded-md", isAsked && "ring-2 ring-brand")} />
      <figcaption className="mt-2 flex h-7 min-w-0 items-center gap-3">
        <span className="min-w-0 truncate font-mono text-xs text-fg" title={address.fullAddress}>
          {output.node}/{output.port}
        </span>
        <span className="shrink-0 text-xs">
          <ExposureLevelWords level={output.level} />
        </span>
        <span className="ml-auto shrink-0">
          <CopyIconButton label="Copy preview link" size="compact" readTextToCopy={() => watchPageUrl} data-stream-output-action="copy_preview_link" />
        </span>
      </figcaption>
    </figure>
  );
}

/** Every output the stream exposes playing side by side, or a well saying why none plays. */
function StreamOutputPreviews({
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
  const askedOutput = useOutputAskedToShow();
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
    return <NothingToPreview title="Starting…" explanation="Its previews play here as soon as it runs." />;
  }
  if (notLoadedReason !== null) {
    return <NothingToPreview title="Not loaded, so nothing to preview" explanation="Previews play the exposed outputs of a loaded stream." />;
  }
  if (reading.graph === null || reading.graphSource !== "loaded") {
    return (
      <NothingToPreview
        title={reading.readRefusal === null ? "Reading its graph…" : "Its graph could not be read"}
        explanation={reading.readRefusal ?? "Its outputs exposed to this machine or publicly play here."}
      />
    );
  }
  const previewableOutputs = readableExposedPorts(reading.graph).filter((output) => output.watch_page_url !== null);
  if (previewableOutputs.length === 0) {
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
  return (
    <div className={cn("grid max-w-[920px] gap-x-5 gap-y-6", previewableOutputs.length > 1 && "max-w-none lg:grid-cols-2")} data-stream-output-previews="">
      {previewableOutputs.map((output) => (
        <ExposedOutputTile
          key={`${output.node}/${output.port}`}
          stream={stream}
          output={output}
          machineName={machineName}
          isAsked={askedOutput !== null && askedOutput.node === output.node && askedOutput.port === output.port}
        />
      ))}
    </div>
  );
}

/** The stream's nodes in pipeline order, one line each: its name, where it runs, its state where nodes differ, and its counters above zero. */
function StreamNodeRows({ stream, reading }: { stream: ListedStream; reading: StreamGraphReading }) {
  const graph = reading.graph;
  const nodeNamesInPipelineOrder = useMemo(() => (graph === null ? [] : stepNamesInFlowOrder(presentStreamGraphCanvas(graph))), [graph]);
  const isLoaded = isStreamLoaded(stream);
  if (graph === null) return <p className="text-fg-3">{isLoaded ? "Its nodes show once its graph is read." : "Its nodes show here once it is loaded."}</p>;
  const nodes = presentStreamSteps(graph, nodeNamesInPipelineOrder, reading.graphSource, isLoaded);
  const isEachNodesStateShown = nodes.some((node) => node.stateWord !== nodes[0]?.stateWord || node.stateEmphasis === "failure");
  return (
    <ul className="flex flex-col" data-stream-steps="">
      {nodes.map((node) => (
        <li key={node.name} className="flex min-w-0 flex-col gap-0.5 border-b py-2 last:border-b-0" data-stream-step={node.name}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-fg select-text" title={node.type}>
              {node.name}
            </span>
            {isEachNodesStateShown && (
              <span className="ml-auto shrink-0 text-xs">
                <StateWords emphasis={node.stateEmphasis} words={node.stateWord} />
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs text-fg-3">
            <span>{[node.origin, node.process].filter((words) => words !== null).join(" · ") || "—"}</span>
            {node.counters.length > 0 && (
              <span className="ml-auto truncate font-mono text-warn-text tabular">{node.counters.map((counter) => `${counter.countText} ${counter.word}`).join(" · ")}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The Overview's slide-out: the stream's project, each exposed output with its preview link, and its nodes. */
function StreamDetailsSidePanel({ stream, reading, onHidden }: { stream: ListedStream; reading: StreamGraphReading; onHidden: () => void }) {
  const graph = reading.graph;
  const readableOutputs = graph === null ? [] : readableExposedPorts(graph);
  const isFromTheLastLoad = graph !== null && reading.graphSource !== "loaded";
  return (
    <SidePanel label={`${stream.name} details`} title="Details" hideLabel="Hide details" onHidden={onHidden} data-stream-details="">
      <PanelSection title="Project">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate font-mono text-xs select-text" title={stream.project_directory}>
            {abbreviateHomeDirectory(stream.project_directory)}
          </span>
          <CopyIconButton label="Copy project folder path" size="compact" readTextToCopy={() => stream.project_directory} />
        </div>
      </PanelSection>
      <PanelSection title={isFromTheLastLoad ? "Outputs as of the last load" : "Outputs"}>
        {graph === null ? (
          <p className="text-fg-3">{isStreamLoaded(stream) ? "Its outputs show once its graph is read." : "Its outputs show once it is loaded."}</p>
        ) : readableOutputs.length === 0 ? (
          <p className="text-fg-3">Every output is internal.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {readableOutputs.map((output) => (
              <li key={`${output.node}/${output.port}`} className="min-w-0" data-stream-output={`${output.node}/${output.port}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-xs text-fg">
                    {output.node}/{output.port}
                  </span>
                  <span className="ml-auto shrink-0 text-xs">
                    <ExposureLevelWords level={output.level} />
                  </span>
                </div>
                {output.watch_page_url !== null && (
                  <span className="block truncate font-mono text-[11px] text-fg-3 select-text" title={output.watch_page_url} data-stream-output-preview-link="">
                    {output.watch_page_url}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title={isFromTheLastLoad ? "Nodes as of the last load" : "Nodes"}>
        <StreamNodeRows stream={stream} reading={reading} />
      </PanelSection>
    </SidePanel>
  );
}

/** A stream's Overview: why it failed, the links dropping messages and its exposed outputs playing; its project, outputs and nodes in the Details slide-out. */
export function StreamOverviewPageView({
  stream,
  streamPageActions,
  isDetailsPanelOpen,
  onDetailsPanelHidden,
}: {
  stream: ListedStream;
  streamPageActions: StreamPageActions;
  isDetailsPanelOpen: boolean;
  onDetailsPanelHidden: () => void;
}) {
  const status = useTatolabStatus();
  const reading = useStreamGraphReading(stream.name);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stream-overview="">
      {stream.state === "failed" && <FailedStreamBanner stream={stream} />}
      <WorkAreaWithSidePanel sidePanel={isDetailsPanelOpen ? <StreamDetailsSidePanel stream={stream} reading={reading} onHidden={onDetailsPanelHidden} /> : null}>
        <PageBody>
          <DroppingLinkLines stream={stream} reading={reading} />
          <StreamOutputPreviews stream={stream} reading={reading} machineName={status.machine_name} streamPageActions={streamPageActions} />
        </PageBody>
      </WorkAreaWithSidePanel>
    </div>
  );
}
