// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { PanelRightClose } from "lucide-react";
import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { ControlDataAttributes } from "./control_data_attributes";
import { IconButton } from "./icon_button";

/** The side panel's width as it opens, and the narrowest and widest it is dragged to, in CSS pixels. */
const SIDE_PANEL_OPENING_WIDTH = 320;
const SIDE_PANEL_NARROWEST_WIDTH = 280;
const SIDE_PANEL_WIDEST_WIDTH = 560;
/** The narrowest the work area beside it is left, so a dragged panel never crowds it out. */
const WORK_AREA_NARROWEST_WIDTH = 420;

/** A tab's work area with its side panel to the right, the hairline between them dragged (or moved with the arrow keys) to resize the panel; the work area alone while `sidePanel` is `null`. */
export function WorkAreaWithSidePanel({ sidePanel, children }: { sidePanel: ReactNode | null; children: ReactNode }) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel id="work-area" minSize={WORK_AREA_NARROWEST_WIDTH} className="flex min-w-0 flex-col">
        {children}
      </ResizablePanel>
      {sidePanel !== null && (
        <>
          <ResizableHandle aria-label="Resize the side panel" />
          <ResizablePanel
            id="side-panel"
            defaultSize={SIDE_PANEL_OPENING_WIDTH}
            minSize={SIDE_PANEL_NARROWEST_WIDTH}
            maxSize={SIDE_PANEL_WIDEST_WIDTH}
            className="flex min-w-0 flex-col bg-chrome"
          >
            {sidePanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

/** A side panel: its title, what it is about under it, its own actions and Hide, over its sections, which scroll. */
export function SidePanel({
  label,
  title,
  subtitle,
  actions,
  hideLabel,
  onHidden,
  children,
  ...controlDataAttributes
}: {
  /** The panel's accessible name, as "Selected record". */
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The Hide button's name, as "Hide details". */
  hideLabel: string;
  onHidden: () => void;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <aside aria-label={label} className="flex min-h-0 min-w-0 flex-1 flex-col" {...controlDataAttributes}>
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b py-1.5 pr-1.5 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-fg">{title}</h2>
          {subtitle !== undefined && <div className="truncate text-xs text-fg-3">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          <IconButton icon={PanelRightClose} label={hideLabel} onPressed={onHidden} data-side-panel-hide="" />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
