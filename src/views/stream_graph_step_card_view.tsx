// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { AudioLines, Braces, Globe, Laptop, LoaderCircle, SquareX, Video } from "lucide-react";
import type { ReactNode } from "react";
import {
  stepCardCounterWords,
  type StreamGraphPortDataKind,
  type StreamGraphStepCard,
  type StreamGraphStepOutputPort,
} from "../presentation/stream_graph_canvas_presentation";
import { STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT, STREAM_GRAPH_STEP_CARD_WIDTH } from "../presentation/stream_graph_step_layout";
import { exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { joinClassNames } from "./shadcn/class_names";

/** The key a pinned preview of `output` goes by. */
export function outputPinKey(output: Pick<StreamGraphStepOutputPort, "stepName" | "name">): string {
  return JSON.stringify([output.stepName, output.name]);
}

/** A port's data kind as its icon: a camera for video, a waveform for audio, braces for anything else. */
export function PortDataKindIcon({ dataKind, className }: { dataKind: StreamGraphPortDataKind; className?: string }) {
  const KindIcon = dataKind === "video" ? Video : dataKind === "audio" ? AudioLines : Braces;
  return <KindIcon className={joinClassNames("size-3.5 shrink-0 text-fg-3", className)} strokeWidth={1.75} aria-label={dataKind} />;
}

/** What a step card asks of the canvas around it. */
export interface StreamGraphStepCardSurroundings {
  streamName: string;
  machineName: string | null;
  isSelected: boolean;
  arePreviewsShown: boolean;
  areCountersShown: boolean;
  pinnedOutputKeys: ReadonlySet<string>;
  /** The canvas's handle at a port row's edge, where a link line meets it. */
  renderPortHandle: (portSide: "input" | "output", portName: string) => ReactNode;
  onOutputHoverStarted: (output: StreamGraphStepOutputPort, anchorRectangle: DOMRect) => void;
  onOutputHoverEnded: () => void;
  onOutputPinToggled: (output: StreamGraphStepOutputPort) => void;
}

function StepStateMark({ step }: { step: StreamGraphStepCard }) {
  if (step.stateEmphasis === "failure") return <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />;
  if (step.stateEmphasis === "starting") return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-fg-3" strokeWidth={1.75} aria-hidden />;
  return null;
}

function OutputPortRow({ output, surroundings }: { output: StreamGraphStepOutputPort; surroundings: StreamGraphStepCardSurroundings }) {
  const isPinned = surroundings.pinnedOutputKeys.has(outputPinKey(output));
  const isPreviewable = output.preview.kind === "watch_page";
  const ExposureIcon = output.exposureLevel === "public" ? Globe : output.exposureLevel === "private" ? Laptop : null;
  return (
    <div className="relative">
      <button
        type="button"
        className={joinClassNames(
          "nodrag group/port flex h-6 w-full cursor-default flex-row-reverse items-center gap-1.5 rounded-sm px-2.5 text-right outline-none focus-visible:ring-3 focus-visible:ring-ring",
          isPreviewable && "hover:bg-hover",
        )}
        aria-pressed={isPreviewable ? isPinned : undefined}
        aria-label={`${output.name}${isPreviewable ? (isPinned ? ", preview pinned" : ", hover to preview, click to pin") : ""}`}
        data-step-output-port={output.name}
        onMouseEnter={(mouseEvent) => surroundings.onOutputHoverStarted(output, mouseEvent.currentTarget.getBoundingClientRect())}
        onFocus={(focusEvent) => surroundings.onOutputHoverStarted(output, focusEvent.currentTarget.getBoundingClientRect())}
        onMouseLeave={surroundings.onOutputHoverEnded}
        onBlur={surroundings.onOutputHoverEnded}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          if (isPreviewable) surroundings.onOutputPinToggled(output);
        }}
      >
        <PortDataKindIcon dataKind={output.dataKind} className="group-hover/port:text-fg-2" />
        <span
          className={joinClassNames(
            "min-w-0 truncate font-mono text-xs",
            isPinned ? "text-brand-text" : output.exposureLevel === null ? "text-fg-3" : "text-fg-2 group-hover/port:text-fg",
          )}
        >
          {output.name}
        </span>
        {ExposureIcon !== null && <ExposureIcon className="size-3 shrink-0 text-fg-3" strokeWidth={1.75} aria-label={output.exposureLevel ?? undefined} />}
      </button>
      {surroundings.renderPortHandle("output", output.name)}
    </div>
  );
}

/** One step's card: its name and origin, the exposed output it plays, its port rows, and its state and counters in its foot. */
export function StreamGraphStepCardView({ step, surroundings }: { step: StreamGraphStepCard; surroundings: StreamGraphStepCardSurroundings }) {
  const counterWords = surroundings.areCountersShown ? stepCardCounterWords(step) : [];
  const cardPreview = surroundings.arePreviewsShown ? step.cardPreview : null;
  return (
    <div
      style={{ width: STREAM_GRAPH_STEP_CARD_WIDTH }}
      className={joinClassNames(
        "stream-graph-step-card rounded-lg border transition-[border-color,box-shadow] duration-100",
        step.isInAnotherStream ? "border-dashed bg-chrome" : "bg-raised",
        step.stateEmphasis === "failure" ? "border-danger" : surroundings.isSelected ? "border-brand" : "border-line-strong",
        surroundings.isSelected && "ring-3 ring-brand-soft",
      )}
      data-stream-graph-step={step.name}
      data-selected={surroundings.isSelected}
      data-in-another-stream={step.isInAnotherStream}
    >
      <div className="flex h-8 items-center gap-2 px-2.5">
        <span className={joinClassNames("min-w-0 truncate font-mono text-xs font-medium", step.isInAnotherStream ? "text-fg-2" : "text-fg")} title={step.type || step.name}>
          {step.name}
        </span>
        <StepStateMark step={step} />
        <span className="ml-auto shrink-0 text-xs text-fg-3">{step.isInAnotherStream ? "Another stream" : (step.origin ?? "")}</span>
      </div>
      {cardPreview !== null && (
        <div className="px-2 pb-2">
          <div style={{ height: STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT }}>
            {/* The frame takes no pointer, so a press on it selects and drags the card like the rest of it. */}
            <ExposedOutputWatchPageFrame
              watchPageUrl={cardPreview.watchPageUrl}
              fullAddress={exposedOutputAddress(surroundings.machineName, surroundings.streamName, { node: step.name, port: cardPreview.output.name }).fullAddress}
              className="pointer-events-none h-full w-full rounded-md"
            />
          </div>
        </div>
      )}
      <div className="pb-1">
        {step.inputPorts.map((input) => (
          <div key={input.name} className="relative flex h-6 items-center gap-1.5 px-2.5" data-step-input-port={input.name}>
            {surroundings.renderPortHandle("input", input.name)}
            <PortDataKindIcon dataKind={input.dataKind} />
            <span className="min-w-0 truncate font-mono text-xs text-fg-2">{input.name}</span>
          </div>
        ))}
        {step.outputPorts.map((output) => (
          <OutputPortRow key={output.name} output={output} surroundings={surroundings} />
        ))}
      </div>
      <div className="flex h-6 items-center gap-2 border-t px-2.5 font-mono text-[11px]">
        <span className={step.stateEmphasis === "failure" ? "text-danger-text" : "text-fg-3"}>{step.stateWord}</span>
        {counterWords.length > 0 && <span className="ml-auto truncate text-warn-text tabular-nums">{counterWords.join(" · ")}</span>}
      </div>
    </div>
  );
}
