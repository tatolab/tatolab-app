// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { GripVertical, Pin, PinOff, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { outputPreviewAbsenceWords, type StreamGraphPreviewedOutput, type StreamGraphStepOutputPort } from "../presentation/stream_graph_canvas_presentation";
import { exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { ExposureLevelWords } from "../design_system/exposure_level_words";
import { IconButton } from "../design_system/icon_button";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { PortDataKindIcon, STREAM_GRAPH_HOVER_PREVIEW_DESCRIPTION_ELEMENT_ID } from "./stream_graph_step_card_view";

const HOVER_PREVIEW_WIDTH = 360;
const HOVER_PREVIEW_GAP = 14;
const WINDOW_EDGE_MARGIN = 8;
/** A pinned preview's width; its header keeps it on the canvas while it is dragged. */
export const PINNED_OUTPUT_PREVIEW_WIDTH = 320;
const PINNED_OUTPUT_PREVIEW_HEADER_HEIGHT = 28;

/** Where the stream an output belongs to runs, for its address. */
export interface StreamGraphOutputPlace {
  streamName: string;
  machineName: string | null;
}

/** The output whose hover preview is open, and the port row it opened from. */
export interface StreamGraphHoveredOutput {
  output: StreamGraphStepOutputPort;
  anchorRectangle: DOMRect;
}

/**
 * The preview that opens beside a hovered output: its watch page, address and level, and Pin; or, for an output with no
 * preview page, why it has none.
 */
export function StreamGraphOutputHoverPreview({
  hoveredOutput,
  outputPlace,
  isPinned,
  onPinToggled,
  onPointerEntered,
  onPointerLeft,
}: {
  hoveredOutput: StreamGraphHoveredOutput;
  outputPlace: StreamGraphOutputPlace;
  isPinned: boolean;
  onPinToggled: () => void;
  onPointerEntered: () => void;
  onPointerLeft: () => void;
}) {
  const popoverElement = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const { output, anchorRectangle } = hoveredOutput;
  const address = exposedOutputAddress(outputPlace.machineName, outputPlace.streamName, { node: output.stepName, port: output.name });

  useLayoutEffect(() => {
    const popoverHeight = popoverElement.current?.offsetHeight ?? 0;
    const fitsOnTheRight = anchorRectangle.right + HOVER_PREVIEW_GAP + HOVER_PREVIEW_WIDTH <= window.innerWidth - WINDOW_EDGE_MARGIN;
    setPopoverPosition({
      left: fitsOnTheRight ? anchorRectangle.right + HOVER_PREVIEW_GAP : Math.max(WINDOW_EDGE_MARGIN, anchorRectangle.left - HOVER_PREVIEW_GAP - HOVER_PREVIEW_WIDTH),
      top: Math.min(Math.max(WINDOW_EDGE_MARGIN, anchorRectangle.top + anchorRectangle.height / 2 - popoverHeight / 2), window.innerHeight - popoverHeight - WINDOW_EDGE_MARGIN),
    });
  }, [anchorRectangle]);

  return createPortal(
    <div
      ref={popoverElement}
      onMouseEnter={onPointerEntered}
      onMouseLeave={onPointerLeft}
      style={{ width: output.preview.kind === "absent" ? 280 : HOVER_PREVIEW_WIDTH, ...(popoverPosition ?? { left: -9999, top: -9999 }) }}
      className="fixed z-50 rounded-lg border border-line-strong bg-popover shadow-[var(--shadow-pop)]"
      data-stream-graph-hover-preview={address.fullAddress}
    >
      <div className="flex h-9 items-center gap-2 pr-1.5 pl-3">
        <PortDataKindIcon dataKind={output.dataKind} />
        <span className="min-w-0 truncate font-mono text-xs text-fg">{output.name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-fg-3">{output.stepName}</span>
        {output.preview.kind === "watch_page" && (
          // The port pins from the keyboard; this button is the pointer's way, so it takes no Tab stop.
          <span className="ml-auto">
            <ToggleIconButton icon={Pin} iconWhileOn={PinOff} label="Pin preview" tooltipWhileOn="Unpin preview" isOn={isPinned} onToggled={onPinToggled} isOutOfTheTabOrder />
          </span>
        )}
      </div>
      {output.preview.kind === "absent" ? (
        <p id={STREAM_GRAPH_HOVER_PREVIEW_DESCRIPTION_ELEMENT_ID} className="px-3 pb-3 text-xs text-fg-3">
          {outputPreviewAbsenceWords(output.preview.absence)}
        </p>
      ) : (
        <>
          <div className="px-3">
            <ExposedOutputWatchPageFrame watchPageUrl={output.preview.watchPageUrl} fullAddress={address.fullAddress} className="aspect-video w-full rounded-md" />
          </div>
          <div className="px-3 pt-2.5 pb-3">
            <div id={STREAM_GRAPH_HOVER_PREVIEW_DESCRIPTION_ELEMENT_ID}>
              <div className="truncate font-mono text-xs text-fg-2 select-text" title={address.fullAddress}>
                {address.fullAddress}
              </div>
              {output.exposureLevel !== null && (
                <span className="sr-only">
                  <ExposureLevelWords level={output.exposureLevel} />
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-fg-3" aria-hidden>
              {output.exposureLevel !== null && <ExposureLevelWords level={output.exposureLevel} />}
              <span className="ml-auto">{isPinned ? "Pinned" : "Click the port to pin"}</span>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** A pinned preview floating over the canvas, dragged by its header within `canvasSize`, until it is closed. */
export function PinnedStreamGraphOutputPreview({
  previewedOutput,
  outputPlace,
  position,
  canvasSize,
  onMoved,
  onClosed,
  onBroughtToFront,
}: {
  previewedOutput: StreamGraphPreviewedOutput;
  outputPlace: StreamGraphOutputPlace;
  position: { x: number; y: number };
  canvasSize: () => { width: number; height: number } | null;
  onMoved: (position: { x: number; y: number }) => void;
  onClosed: () => void;
  onBroughtToFront: () => void;
}) {
  const dragOffset = useRef<{ fromLeft: number; fromTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { output, watchPageUrl } = previewedOutput;
  const address = exposedOutputAddress(outputPlace.machineName, outputPlace.streamName, { node: output.stepName, port: output.name });
  const endDrag = () => {
    dragOffset.current = null;
    setIsDragging(false);
  };
  return (
    <div
      onPointerDown={onBroughtToFront}
      style={{ left: position.x, top: position.y, width: PINNED_OUTPUT_PREVIEW_WIDTH }}
      className={cn("absolute z-10 overflow-hidden rounded-lg border border-line-strong bg-popover shadow-[var(--shadow-pop)]", isDragging && "select-none")}
      data-pinned-output-preview={address.fullAddress}
    >
      <div
        style={{ height: PINNED_OUTPUT_PREVIEW_HEADER_HEIGHT }}
        className="flex cursor-grab items-center gap-1 border-b bg-chrome pr-1 pl-1 active:cursor-grabbing"
        onPointerDown={(pointerEvent) => {
          if (pointerEvent.target instanceof Element && pointerEvent.target.closest("button")) return;
          pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
          dragOffset.current = { fromLeft: pointerEvent.clientX - position.x, fromTop: pointerEvent.clientY - position.y };
          setIsDragging(true);
        }}
        onPointerMove={(pointerEvent) => {
          if (dragOffset.current === null) return;
          const size = canvasSize();
          const wantedX = pointerEvent.clientX - dragOffset.current.fromLeft;
          const wantedY = pointerEvent.clientY - dragOffset.current.fromTop;
          onMoved(
            size === null
              ? { x: wantedX, y: wantedY }
              : {
                  x: Math.min(Math.max(0, wantedX), size.width - PINNED_OUTPUT_PREVIEW_WIDTH),
                  y: Math.min(Math.max(0, wantedY), size.height - PINNED_OUTPUT_PREVIEW_HEADER_HEIGHT),
                },
          );
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <GripVertical className="size-3.5 shrink-0 text-fg-4" strokeWidth={1.75} aria-hidden />
        <PortDataKindIcon dataKind={output.dataKind} className="size-3" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2" title={address.fullAddress}>
          <span className="text-fg-3">{output.stepName}/</span>
          {output.name}
        </span>
        <IconButton icon={X} label={`Close the preview of ${address.fullAddress}`} tooltip="Close" size="compact" onPressed={onClosed} />
      </div>
      <ExposedOutputWatchPageFrame watchPageUrl={watchPageUrl} fullAddress={address.fullAddress} className="aspect-video w-full ring-0" />
    </div>
  );
}
