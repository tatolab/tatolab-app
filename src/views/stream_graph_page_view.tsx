// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { presentStreamGraphCanvas, type StreamGraphCanvas, type StreamGraphStepOutputPort } from "../presentation/stream_graph_canvas_presentation";
import { readTheGraphDocument } from "../presentation/stream_graph_document_presentation";
import { presentStreamGraphInspection } from "../presentation/stream_graph_inspector_presentation";
import { layOutStreamGraphSteps, streamGraphLayoutKey, type StreamGraphStepPosition } from "../presentation/stream_graph_step_layout";
import { streamGraphDocumentCommand } from "../presentation/stream_overview_presentation";
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
import { pinnedOutputAskedBy, streamPagePath } from "./stream_page_path";
import { useStreamGraphReading, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

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
    <div className="grid flex-1 place-items-center bg-window px-6" data-stream-graph-message="">
      <div className="flex max-w-md flex-col items-center gap-1 text-center">
        <div className="text-fg-2">{title}</div>
        {detail !== undefined && <div className="text-xs text-fg-3 select-text">{detail}</div>}
      </div>
    </div>
  );
}

function StreamGraphTab({ stream, canvas }: { stream: ListedStream; canvas: StreamGraphCanvas }) {
  const { hostedPages } = useTatolabWindowEnvironment();
  const machineName = useTatolabStatus().machine_name;
  const reading = useStreamGraphReading(stream.name);
  const viewport = useStreamGraphViewportCommands();
  const location = useLocation();
  const navigate = useNavigate();
  const canvasArea = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<number | undefined>(undefined);

  const [selectedStepName, setSelectedStepName] = useState<string | null>(null);
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

  const togglePinnedPreview = useCallback((output: Pick<StreamGraphStepOutputPort, "stepName" | "name" | "watchPageUrl">) => {
    if (output.watchPageUrl === null) return;
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
    setHoveredOutput(output.previewAbsence === "in_another_stream" ? null : { output, anchorRectangle });
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
    if (askedOutput === undefined || askedOutput.watchPageUrl === null) return;
    if (!pinnedOutputKeys.has(outputPinKey(askedOutput))) togglePinnedPreview(askedOutput);
    void navigate(location.pathname, { replace: true, state: null });
  }, [askedPinnedOutput, canvas, pinnedOutputKeys, togglePinnedPreview, navigate, location.pathname]);

  useEffect(() => {
    if (fitRequestCount === 0) return;
    const fitFrame = window.requestAnimationFrame(() => viewport.fitToView());
    return () => window.cancelAnimationFrame(fitFrame);
  }, [fitRequestCount, viewport]);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey || isTypingInto(keyboardEvent.target)) return;
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

  const hoveredOutputNow = hoveredOutput === null ? undefined : findOutput(canvas, hoveredOutput.output.stepName, hoveredOutput.output.name);
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-graph-page={stream.name}>
      <div className="flex min-w-0 flex-1 flex-col">
        <StreamGraphToolbarView
          streamName={stream.name}
          selectedStepName={inspection.kind === "step" ? inspection.step.name : null}
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
          <div role="alert" className="flex min-h-8 items-center gap-2 border-b px-3 py-1 text-xs" data-stream-graph-read-refusal="">
            <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
            <span className="text-fg-2">Showing the graph last read. The runtime refused the latest read:</span>
            <span className="min-w-0 truncate text-fg select-text" title={reading.readRefusal}>
              {reading.readRefusal}
            </span>
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
            onStepSelected={setSelectedStepName}
            onStepMoved={(stepName, position) => setMovedStepPositions((movedPositions) => new Map([...movedPositions, [stepName, position]]))}
            onViewportMoveStarted={closeHoverPreview}
            onOutputHoverStarted={startHoverPreview}
            onOutputHoverEnded={endHoverPreviewSoon}
            onOutputPinToggled={togglePinnedPreview}
          />
          {pinnedPreviews.map((pinnedPreview, pinnedIndex) => {
            const pinnedOutput = findOutput(canvas, pinnedPreview.stepName, pinnedPreview.portName);
            if (pinnedOutput === undefined) return null;
            return (
              <PinnedStreamGraphOutputPreview
                key={pinnedPreview.pinKey}
                output={pinnedOutput}
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
      </div>
      {isInspectorOpen && (
        <StreamGraphInspectorView
          inspection={inspection}
          outputPlace={outputPlace}
          streamInstance={reading.streamInstance}
          pinnedOutputKeys={pinnedOutputKeys}
          actions={{
            onClosed: () => setIsInspectorOpen(false),
            onStepSelected: setSelectedStepName,
            onOutputPinToggled: togglePinnedPreview,
            onErrorsInLogsShown: () => {
              void Promise.resolve(navigate(streamPagePath(stream.name, "logs"))).then(() => hostedPages.streamsPage.showLogErrorLinesOnly());
            },
          }}
        />
      )}
      {hoveredOutput !== null && hoveredOutputNow !== undefined && (
        <StreamGraphOutputHoverPreview
          hoveredOutput={{ output: hoveredOutputNow, anchorRectangle: hoveredOutput.anchorRectangle }}
          outputPlace={outputPlace}
          isPinned={pinnedOutputKeys.has(outputPinKey(hoveredOutputNow))}
          onPinToggled={() => togglePinnedPreview(hoveredOutputNow)}
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
  const canvas = useMemo(() => (reading.graph === null ? null : presentStreamGraphCanvas(reading.graph)), [reading.graph]);
  if (canvas === null) {
    return reading.readRefusal === null ? (
      <GraphTabMessage title="Reading its graph…" />
    ) : (
      <GraphTabMessage title="Its graph could not be read" detail={reading.readRefusal} />
    );
  }
  if (canvas.steps.length === 0) {
    return <GraphTabMessage title={`${stream.name} has no steps yet`} detail={`${streamGraphDocumentCommand(stream.name)} prints the graph the runtime holds.`} />;
  }
  return (
    <StreamGraphCanvasProvider key={stream.name}>
      <StreamGraphTab stream={stream} canvas={canvas} />
    </StreamGraphCanvasProvider>
  );
}
