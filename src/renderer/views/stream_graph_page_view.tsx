import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { presentStreamGraphCanvas, previewedOutputOf, type StreamGraphCanvas, type StreamGraphStepOutputPort } from "../presentation/stream_graph_canvas_presentation";
import { readTheGraphDocument } from "../presentation/stream_graph_document_presentation";
import { presentStreamGraphInspection } from "../presentation/stream_graph_inspector_presentation";
import { layOutStreamGraphSteps, streamGraphLayoutKey, type StreamGraphStepPosition } from "../presentation/stream_graph_step_layout";
import { EmptyState } from "../design_system/empty_state";
import { RefusalLine } from "../design_system/refusal_line";
import { WorkAreaWithSidePanel } from "../design_system/side_panel";
import { StreamGraphInspectorView } from "./stream_graph_inspector_view";
import {
  PINNED_OUTPUT_PREVIEW_WIDTH,
  PinnedStreamGraphOutputPreview,
  StreamGraphOutputHoverPreview,
  type StreamGraphHoveredOutput,
  type StreamGraphOutputPlace,
} from "./stream_graph_output_previews_view";
import { StreamGraphCanvasProvider, StreamGraphReactFlowCanvas, useStreamGraphViewportCommands } from "./stream_graph_react_flow_canvas";
import { outputPinKey } from "./stream_graph_step_card_view";
import { StreamGraphToolbarView } from "./stream_graph_toolbar_view";
import { pinnedOutputAskedBy, selectedStepAskedBy, streamPagePath } from "./stream_page_path";
import { useStreamGraphReading, useTatolabStatus } from "./tatolab_window_context";

/** How long a hover preview stays after the pointer leaves its port, so the pointer can reach it. */
const HOVER_PREVIEW_CLOSE_DELAY_MILLISECONDS = 160;
const PINNED_PREVIEW_INSET = 14;
const PINNED_PREVIEW_CASCADE_X = 24;
const PINNED_PREVIEW_CASCADE_Y = 28;

/** A preview pinned over the canvas: which output, and where it floats. */
interface PinnedOutputPreviewPlace {
  pinKey: string;
  stepName: string;
  portName: string;
  x: number;
  y: number;
}

/** A layout of the canvas, and the shape of graph it was made for. */
interface StreamGraphLaidOut {
  layoutKey: string;
  stepPositions: ReadonlyMap<string, StreamGraphStepPosition>;
}

function isTypingInto(eventTarget: EventTarget | null): boolean {
  return eventTarget instanceof HTMLElement && (eventTarget.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(eventTarget.tagName));
}

function findOutput(canvas: StreamGraphCanvas, stepName: string, portName: string): StreamGraphStepOutputPort | undefined {
  return canvas.steps.find((step) => step.name === stepName)?.outputPorts.find((output) => output.name === portName);
}

function GraphTabMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-1 bg-window">
      <EmptyState title={title} explanation={detail} data-stream-graph-message="" />
    </div>
  );
}

function StreamGraphTab({ stream, canvas }: { stream: ListedStream; canvas: StreamGraphCanvas }) {
  const machineName = useTatolabStatus().machine_name;
  const reading = useStreamGraphReading(stream.name);
  const viewport = useStreamGraphViewportCommands();
  const location = useLocation();
  const navigate = useNavigate();
  const canvasArea = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<number | undefined>(undefined);

  const [selectedStepName, setSelectedStepName] = useState<string | null>(() => selectedStepAskedBy(location.state));
  const [arePreviewsShown, setArePreviewsShown] = useState(true);
  const [areCountersShown, setAreCountersShown] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [movedStepPositions, setMovedStepPositions] = useState<ReadonlyMap<string, StreamGraphStepPosition>>(new Map());
  const [hoveredOutput, setHoveredOutput] = useState<StreamGraphHoveredOutput | null>(null);
  const [pinnedPreviews, setPinnedPreviews] = useState<PinnedOutputPreviewPlace[]>([]);
  const [fitRequestCount, setFitRequestCount] = useState(0);

  const layoutKey = streamGraphLayoutKey(canvas, arePreviewsShown);
  const [laidOut, setLaidOut] = useState<StreamGraphLaidOut>(() => ({ layoutKey, stepPositions: layOutStreamGraphSteps(canvas, arePreviewsShown) }));
  // A graph of another shape, or previews turned on or off, lays the canvas out again; a poll that changes only states and counters keeps it.
  if (laidOut.layoutKey !== layoutKey) setLaidOut({ layoutKey, stepPositions: layOutStreamGraphSteps(canvas, arePreviewsShown) });
  const stepPositions = useMemo(() => new Map([...laidOut.stepPositions, ...movedStepPositions]), [laidOut, movedStepPositions]);

  const graphDocument = useMemo(() => (reading.graph === null ? null : readTheGraphDocument(reading.graph.graph_document_text)), [reading.graph]);
  const inspection = presentStreamGraphInspection(canvas, graphDocument, selectedStepName);
  const outputPlace: StreamGraphOutputPlace = { streamName: stream.name, machineName };
  const pinnedOutputKeys = useMemo(() => new Set(pinnedPreviews.map((pinnedPreview) => pinnedPreview.pinKey)), [pinnedPreviews]);

  const togglePinnedPreview = useCallback((output: StreamGraphStepOutputPort) => {
    if (output.preview.kind !== "watch_page") return;
    const pinKey = outputPinKey(output);
    setPinnedPreviews((shownPreviews) => {
      if (shownPreviews.some((pinnedPreview) => pinnedPreview.pinKey === pinKey)) return shownPreviews.filter((pinnedPreview) => pinnedPreview.pinKey !== pinKey);
      const canvasWidth = canvasArea.current?.clientWidth ?? 900;
      const cascadeIndex = shownPreviews.length;
      return [
        ...shownPreviews,
        {
          pinKey,
          stepName: output.stepName,
          portName: output.name,
          x: Math.max(PINNED_PREVIEW_INSET, canvasWidth - PINNED_OUTPUT_PREVIEW_WIDTH - PINNED_PREVIEW_INSET - cascadeIndex * PINNED_PREVIEW_CASCADE_X),
          y: PINNED_PREVIEW_INSET + cascadeIndex * PINNED_PREVIEW_CASCADE_Y,
        },
      ];
    });
  }, []);

  const startHoverPreview = useCallback((output: StreamGraphStepOutputPort, anchorRectangle: DOMRect) => {
    window.clearTimeout(hoverCloseTimer.current);
    setHoveredOutput(output.preview.kind === "absent" && output.preview.absence === "in_another_stream" ? null : { output, anchorRectangle });
  }, []);
  const endHoverPreviewSoon = useCallback(() => {
    window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => setHoveredOutput(null), HOVER_PREVIEW_CLOSE_DELAY_MILLISECONDS);
  }, []);
  const closeHoverPreview = useCallback(() => {
    window.clearTimeout(hoverCloseTimer.current);
    setHoveredOutput(null);
  }, []);
  useEffect(() => () => window.clearTimeout(hoverCloseTimer.current), []);

  const askedPinnedOutput = pinnedOutputAskedBy(location.state);
  useEffect(() => {
    if (askedPinnedOutput === null) return;
    const askedOutput = findOutput(canvas, askedPinnedOutput.node, askedPinnedOutput.port);
    if (askedOutput === undefined || askedOutput.preview.kind !== "watch_page") return;
    if (!pinnedOutputKeys.has(outputPinKey(askedOutput))) togglePinnedPreview(askedOutput);
    void navigate(location.pathname, { replace: true, state: null });
  }, [askedPinnedOutput, canvas, pinnedOutputKeys, togglePinnedPreview, navigate, location.pathname]);

  const askedSelectedStep = selectedStepAskedBy(location.state);
  useEffect(() => {
    if (askedSelectedStep === null) return;
    if (canvas.steps.some((step) => step.name === askedSelectedStep)) setSelectedStepName(askedSelectedStep);
    void navigate(location.pathname, { replace: true, state: null });
  }, [askedSelectedStep, canvas, navigate, location.pathname]);

  useEffect(() => {
    if (fitRequestCount === 0) return;
    const fitFrame = window.requestAnimationFrame(() => viewport.fitToView());
    return () => window.cancelAnimationFrame(fitFrame);
  }, [fitRequestCount, viewport]);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.defaultPrevented || keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey || isTypingInto(keyboardEvent.target)) return;
      if (keyboardEvent.key === "Escape") {
        closeHoverPreview();
        setSelectedStepName(null);
      } else if (keyboardEvent.key.toLowerCase() === "f") {
        keyboardEvent.preventDefault();
        viewport.fitToView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeHoverPreview, viewport]);

  const inspectorPanel = isInspectorOpen ? (
    <StreamGraphInspectorView
      inspection={inspection}
      outputPlace={outputPlace}
      pinnedOutputKeys={pinnedOutputKeys}
      actions={{
        onClosed: () => setIsInspectorOpen(false),
        onStepSelected: setSelectedStepName,
        onOutputPinToggled: togglePinnedPreview,
        onErrorsInLogsShown: () => void navigate(streamPagePath(stream.name, "logs"), { state: { askedLogView: "errors_only" } }),
      }}
    />
  ) : null;
  // The hovered output as this reading of the graph has it; undefined when no preview is open or its output is gone.
  const openHoverPreviewOutput = hoveredOutput === null ? undefined : findOutput(canvas, hoveredOutput.output.stepName, hoveredOutput.output.name);
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-graph-page={stream.name}>
      <WorkAreaWithSidePanel sidePanel={inspectorPanel}>
        <StreamGraphToolbarView
          arePreviewsShown={arePreviewsShown}
          areCountersShown={areCountersShown}
          isInspectorOpen={isInspectorOpen}
          onAutoLayout={() => {
            setMovedStepPositions(new Map());
            setLaidOut({ layoutKey, stepPositions: layOutStreamGraphSteps(canvas, arePreviewsShown) });
            setFitRequestCount((requestCount) => requestCount + 1);
          }}
          onPreviewsToggled={() => setArePreviewsShown((areShown) => !areShown)}
          onCountersToggled={() => setAreCountersShown((areShown) => !areShown)}
          onInspectorOpened={() => setIsInspectorOpen(true)}
        />
        {reading.readRefusal !== null && (
          <div data-stream-graph-read-refusal="">
            <RefusalLine tone="warning" layout="bar" lead="Showing the graph last read. The runtime refused the latest read:" words={reading.readRefusal} />
          </div>
        )}
        <div ref={canvasArea} className="relative min-h-0 flex-1">
          <StreamGraphReactFlowCanvas
            canvas={canvas}
            stepPositions={stepPositions}
            streamName={stream.name}
            machineName={machineName}
            selectedStepName={inspection.kind === "step" ? inspection.step.name : null}
            arePreviewsShown={arePreviewsShown}
            areCountersShown={areCountersShown}
            pinnedOutputKeys={pinnedOutputKeys}
            hoverPreviewedOutputKey={openHoverPreviewOutput === undefined ? null : outputPinKey(openHoverPreviewOutput)}
            onStepSelected={setSelectedStepName}
            onStepMoved={(stepName, position) => setMovedStepPositions((movedPositions) => new Map([...movedPositions, [stepName, position]]))}
            onViewportMoveStarted={closeHoverPreview}
            onOutputHoverStarted={startHoverPreview}
            onOutputHoverEnded={endHoverPreviewSoon}
            onOutputPinToggled={togglePinnedPreview}
          />
          {pinnedPreviews.map((pinnedPreview, pinnedIndex) => {
            const pinnedOutput = findOutput(canvas, pinnedPreview.stepName, pinnedPreview.portName);
            const previewedOutput = pinnedOutput === undefined ? null : previewedOutputOf(pinnedOutput);
            if (pinnedOutput === undefined || previewedOutput === null) return null;
            return (
              <PinnedStreamGraphOutputPreview
                key={pinnedPreview.pinKey}
                previewedOutput={previewedOutput}
                outputPlace={outputPlace}
                position={pinnedPreview}
                canvasSize={() => (canvasArea.current === null ? null : { width: canvasArea.current.clientWidth, height: canvasArea.current.clientHeight })}
                onMoved={(position) =>
                  setPinnedPreviews((shownPreviews) => shownPreviews.map((shownPreview) => (shownPreview.pinKey === pinnedPreview.pinKey ? { ...shownPreview, ...position } : shownPreview)))
                }
                onClosed={() => togglePinnedPreview(pinnedOutput)}
                onBroughtToFront={() => {
                  if (pinnedIndex !== pinnedPreviews.length - 1) {
                    setPinnedPreviews((shownPreviews) => [...shownPreviews.filter((shownPreview) => shownPreview.pinKey !== pinnedPreview.pinKey), pinnedPreview]);
                  }
                }}
              />
            );
          })}
        </div>
      </WorkAreaWithSidePanel>
      {hoveredOutput !== null && openHoverPreviewOutput !== undefined && (
        <StreamGraphOutputHoverPreview
          hoveredOutput={{ output: openHoverPreviewOutput, anchorRectangle: hoveredOutput.anchorRectangle }}
          outputPlace={outputPlace}
          isPinned={pinnedOutputKeys.has(outputPinKey(openHoverPreviewOutput))}
          onPinToggled={() => togglePinnedPreview(openHoverPreviewOutput)}
          onPointerEntered={() => window.clearTimeout(hoverCloseTimer.current)}
          onPointerLeft={endHoverPreviewSoon}
        />
      )}
    </div>
  );
}

/** A loaded stream's Graph tab: its steps and links on a canvas, previews of its exposed outputs, and an inspector. Viewing only. */
export function StreamGraphPageView({ stream }: { stream: ListedStream }) {
  const reading = useStreamGraphReading(stream.name);
  // A graph kept from the stream's last load is not this load's, so the canvas waits for this load's first read.
  const loadedGraph = reading.graphSource === "loaded" ? reading.graph : null;
  const canvas = useMemo(() => (loadedGraph === null ? null : presentStreamGraphCanvas(loadedGraph)), [loadedGraph]);
  if (canvas === null) {
    return reading.readRefusal === null ? (
      <GraphTabMessage title="Reading its graph…" />
    ) : (
      <GraphTabMessage title="Its graph could not be read" detail={reading.readRefusal} />
    );
  }
  if (canvas.steps.length === 0) {
    return <GraphTabMessage title={`${stream.name} has no nodes yet`} detail="Its nodes show here once its stream function adds them." />;
  }
  return (
    <StreamGraphCanvasProvider key={stream.name}>
      <StreamGraphTab stream={stream} canvas={canvas} />
    </StreamGraphCanvasProvider>
  );
}
