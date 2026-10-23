// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Activity, Image, Minus, Network, PanelRight, Plus, Scan, type LucideIcon } from "lucide-react";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import { useStreamGraphViewportCommands, useStreamGraphZoomPercent } from "./stream_graph_react_flow_canvas";

function ToolbarIconButton({
  icon: ButtonIcon,
  label,
  tooltip = label,
  isPressed,
  onClick,
  toolbarControl,
}: {
  icon: LucideIcon;
  label: string;
  /** What the tooltip says, when it says more than the button's name. */
  tooltip?: string;
  isPressed?: boolean;
  onClick: () => void;
  toolbarControl: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={isPressed}
            className={joinClassNames(isPressed === true && "bg-selected text-fg")}
            onClick={onClick}
            data-stream-graph-toolbar={toolbarControl}
          />
        }
      >
        <ButtonIcon className="size-4" strokeWidth={1.75} aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px bg-line" aria-hidden />;
}

/** The Graph tab's toolbar: zoom, fit, auto-layout, the previews and counters toggles, and the inspector once it is closed. */
export function StreamGraphToolbarView({
  streamName,
  selectedStepName,
  arePreviewsShown,
  areCountersShown,
  isInspectorOpen,
  onAutoLayout,
  onPreviewsToggled,
  onCountersToggled,
  onInspectorOpened,
}: {
  streamName: string;
  selectedStepName: string | null;
  arePreviewsShown: boolean;
  areCountersShown: boolean;
  isInspectorOpen: boolean;
  onAutoLayout: () => void;
  onPreviewsToggled: () => void;
  onCountersToggled: () => void;
  onInspectorOpened: () => void;
}) {
  const viewport = useStreamGraphViewportCommands();
  const zoomPercent = useStreamGraphZoomPercent();
  return (
    <div className="@container relative flex h-9 shrink-0 items-center gap-0.5 border-b bg-window px-1.5" role="toolbar" aria-label="Graph">
      <ToolbarIconButton icon={Minus} label="Zoom out" onClick={viewport.zoomOut} toolbarControl="zoom_out" />
      <Button
        variant="ghost"
        className="w-12 px-0 font-mono text-xs tabular-nums"
        aria-label={`Zoom ${zoomPercent}%, reset to 100%`}
        onClick={viewport.zoomToActualSize}
        data-stream-graph-toolbar="zoom_to_actual_size"
      >
        {zoomPercent}%
      </Button>
      <ToolbarIconButton icon={Plus} label="Zoom in" onClick={viewport.zoomIn} toolbarControl="zoom_in" />
      <ToolbarIconButton icon={Scan} label="Fit to view (F)" onClick={viewport.fitToView} toolbarControl="fit_to_view" />
      <ToolbarIconButton icon={Network} label="Auto-layout" onClick={onAutoLayout} toolbarControl="auto_layout" />
      <ToolbarDivider />
      <ToolbarIconButton
        icon={Image}
        label="Previews"
        tooltip={arePreviewsShown ? "Hide previews" : "Show previews"}
        isPressed={arePreviewsShown}
        onClick={onPreviewsToggled}
        toolbarControl="previews"
      />
      <ToolbarIconButton
        icon={Activity}
        label="Counters"
        tooltip={areCountersShown ? "Hide counters" : "Show counters"}
        isPressed={areCountersShown}
        onClick={onCountersToggled}
        toolbarControl="counters"
      />
      <div className="pointer-events-none absolute inset-x-0 hidden justify-center @[720px]:flex">
        <div className="flex items-center gap-1 font-mono text-xs text-fg-3">
          <span>{streamName}</span>
          {selectedStepName !== null && (
            <>
              <span aria-hidden>/</span>
              <span className="text-fg-2">{selectedStepName}</span>
            </>
          )}
        </div>
      </div>
      {!isInspectorOpen && (
        <div className="ml-auto flex items-center">
          <ToolbarIconButton icon={PanelRight} label="Show inspector" onClick={onInspectorOpened} toolbarControl="show_inspector" />
        </div>
      )}
    </div>
  );
}
