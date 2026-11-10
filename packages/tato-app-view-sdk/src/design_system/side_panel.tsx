import { cn } from "cn";
import { PanelRightClose } from "lucide-react";
import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { IconButton } from "./icon_button";

/** The side panel's width as it opens, and the narrowest and widest it is dragged to, in CSS pixels. */
const SIDE_PANEL_OPENING_WIDTH = 320;
const SIDE_PANEL_NARROWEST_WIDTH = 280;
const SIDE_PANEL_WIDEST_WIDTH = 560;
/**
 * The narrowest the work area beside it is left, so a dragged panel never crowds it out. With the narrowest panel it
 * fits the stream page of the app's smallest window (860 px, which leaves the page 596 px beside the sidebar).
 */
const WORK_AREA_NARROWEST_WIDTH = 300;

/** A tab's work area with its side panel to the right, the hairline between them dragged (or moved with the arrow keys) to resize the panel; the work area alone while `sidePanel` is `null`. */
export function WorkAreaWithSidePanel({ sidePanel, children }: { sidePanel: ReactNode | null; children: ReactNode }) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel id="work-area" minSize={WORK_AREA_NARROWEST_WIDTH} className="flex min-w-0 flex-col">
        {children}
      </ResizablePanel>
      {sidePanel !== null && (
        <>
          <ResizableHandle aria-label="Resize the side panel" className={FULL_STRENGTH_FOCUS_RING_CLASS_NAMES} />
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

/** Where a side panel sits: docked in a work area's resizable split, or floating as a raised card of a fixed width beside a page's content. */
export type SidePanelPlacement = "docked" | "floating";

/** A floating panel's title row stands taller than a docked one's, which matches the tab toolbar beside it. */
const SIDE_PANEL_TITLE_ROW_CLASS_NAMES: Record<SidePanelPlacement, string> = {
  docked: "h-10 pr-1.5 pl-4",
  floating: "h-15 pr-3 pl-5",
};

const SIDE_PANEL_PLACEMENT_CLASS_NAMES: Record<SidePanelPlacement, string> = {
  docked: "flex-1",
  floating: "my-6 mr-6 w-95 shrink-0 overflow-hidden rounded-xl border border-line bg-raised",
};

/** A side panel: its title, what it is about under it, its own actions and Hide, over its sections, which scroll; Hide is left out where something else on the page opens and closes it. */
export function SidePanel({
  label,
  title,
  subtitle,
  actions,
  hiding,
  placement = "docked",
  className,
  children,
  ...controlDataAttributes
}: {
  /** The panel's accessible name, as "Selected record". */
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The Hide button and its name, as "Hide details"; `null` where a toggle elsewhere on the page closes the panel. */
  hiding: { hideLabel: string; onHidden: () => void } | null;
  placement?: SidePanelPlacement;
  /** A one-off adjustment where the panel is used. */
  className?: string;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <aside aria-label={label} className={cn("flex min-h-0 min-w-0 flex-col", SIDE_PANEL_PLACEMENT_CLASS_NAMES[placement], className)} {...controlDataAttributes}>
      {/* The tab toolbar's height, so the two hairlines meet across the separator. */}
      <div className={cn("flex shrink-0 items-center gap-2 border-b", SIDE_PANEL_TITLE_ROW_CLASS_NAMES[placement])}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-fg">{title}</h2>
          {subtitle !== undefined && <div className="truncate text-xs leading-4 text-fg-3">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {hiding !== null && <IconButton icon={PanelRightClose} label={hiding.hideLabel} onPressed={hiding.onHidden} data-side-panel-hide="" />}
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
