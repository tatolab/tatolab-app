import { Activity, Image, Minus, Network, PanelRight, Plus, Scan } from "lucide-react";
import { ActionButton } from "../design_system/action_button";
import { IconButton } from "../design_system/icon_button";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import { Toolbar, ToolbarDivider, ToolbarGroup } from "../design_system/toolbar";
import { useStreamGraphViewportCommands, useStreamGraphZoomPercent } from "./stream_graph_react_flow_canvas";

/** The Graph tab's toolbar: zoom, fit, auto-layout, the previews and counters toggles, and the inspector once it is closed. */
export function StreamGraphToolbarView({
  arePreviewsShown,
  areCountersShown,
  isInspectorOpen,
  onAutoLayout,
  onPreviewsToggled,
  onCountersToggled,
  onInspectorOpened,
}: {
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
    <Toolbar label="Graph">
      <ToolbarGroup>
        <IconButton icon={Minus} label="Zoom out" onPressed={viewport.zoomOut} data-stream-graph-toolbar="zoom_out" />
        <ActionButton
          appearance="quiet"
          onPressed={viewport.zoomToActualSize}
          className="w-12 px-0 font-mono text-xs tabular-nums"
          label={`Zoom ${zoomPercent}%, reset to 100%`}
          data-stream-graph-toolbar="zoom_to_actual_size"
        >
          {zoomPercent}%
        </ActionButton>
        <IconButton icon={Plus} label="Zoom in" onPressed={viewport.zoomIn} data-stream-graph-toolbar="zoom_in" />
        <IconButton icon={Scan} label="Fit to view (F)" onPressed={viewport.fitToView} data-stream-graph-toolbar="fit_to_view" />
        <IconButton icon={Network} label="Auto-layout" onPressed={onAutoLayout} data-stream-graph-toolbar="auto_layout" />
        <ToolbarDivider />
        <ToggleIconButton
          icon={Image}
          label="Previews"
          tooltipWhileOn="Hide previews"
          tooltipWhileOff="Show previews"
          isOn={arePreviewsShown}
          onToggled={onPreviewsToggled}
          data-stream-graph-toolbar="previews"
        />
        <ToggleIconButton
          icon={Activity}
          label="Counters"
          tooltipWhileOn="Hide counters"
          tooltipWhileOff="Show counters"
          isOn={areCountersShown}
          onToggled={onCountersToggled}
          data-stream-graph-toolbar="counters"
        />
      </ToolbarGroup>
      {!isInspectorOpen && (
        <ToolbarGroup isAtTheEnd>
          <IconButton icon={PanelRight} label="Show inspector" onPressed={onInspectorOpened} data-stream-graph-toolbar="show_inspector" />
        </ToolbarGroup>
      )}
    </Toolbar>
  );
}
