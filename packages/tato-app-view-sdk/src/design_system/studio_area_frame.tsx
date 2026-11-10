import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ViewHeaderRow } from "../studio_readings";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { studioIconNamed, type StudioIconName } from "./support/studio_icons";

/** One area of the studio: a rounded pane on the window's frame, its header over the view it shows. */
export function StudioAreaFrame({ label, header, children, ...controlDataAttributes }: { label: string; header: ReactNode; children: ReactNode } & ControlDataAttributes) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-studio-area" {...controlDataAttributes}>
      <div className="flex h-(--studio-area-header-height) shrink-0 items-center gap-1.5 border-b border-studio-area-header-line bg-studio-area-header px-1.5">
        {header}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}


/** An area whose view draws its own header row in its frame: the view across the whole area, the view-type menu laid over the row's start, its width told to `onHeaderRowMeasured`. */
export function StudioAreaOverAViewsOwnFrame({
  label,
  viewTypeMenu,
  onHeaderRowMeasured,
  children,
  ...controlDataAttributes
}: {
  label: string;
  viewTypeMenu: ReactNode;
  onHeaderRowMeasured: (headerRow: ViewHeaderRow) => void;
  children: ReactNode;
} & ControlDataAttributes) {
  const viewTypeMenuRowRef = useRef<HTMLDivElement>(null);
  const onHeaderRowMeasuredRef = useRef(onHeaderRowMeasured);
  onHeaderRowMeasuredRef.current = onHeaderRowMeasured;
  useLayoutEffect(() => {
    const viewTypeMenuRow = viewTypeMenuRowRef.current;
    if (viewTypeMenuRow === null) return;
    const tellTheHeaderRow = () => {
      const { width, height } = viewTypeMenuRow.getBoundingClientRect();
      if (height > 0) onHeaderRowMeasuredRef.current({ leading_inset_px: Math.ceil(width), height_px: height });
    };
    tellTheHeaderRow();
    if (typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(tellTheHeaderRow);
    resizeObserver.observe(viewTypeMenuRow);
    return () => resizeObserver.disconnect();
  }, []);
  return (
    <section aria-label={label} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-studio-area" {...controlDataAttributes}>
      <div ref={viewTypeMenuRowRef} className="absolute top-0 left-0 z-10 flex h-(--studio-area-header-height) items-center px-1.5">
        {viewTypeMenu}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A view's own header row, drawn in its frame: an area header's look, its tools laid out after `headerRow`'s inset, where Studio's view-type menu lies over the row; an area header's height until Studio has said where the row lies. */
export function StudioAreaHeaderRowInAFrame({ headerRow, children }: { headerRow: ViewHeaderRow | null; children?: ReactNode }) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1.5 border-b border-studio-area-header-line bg-studio-area-header pr-1.5", headerRow === null && "h-(--studio-area-header-height)")}
      style={headerRow === null ? undefined : { height: headerRow.height_px, paddingLeft: headerRow.leading_inset_px }}
    >
      {children}
    </div>
  );
}

/** The header row a view's frame would draw, drawn by Studio while the area waits for the view, so the view-type menu sits on an area header as ever. */
export function StudioAreaHeaderRowOfAWaitingView() {
  return <div className="h-(--studio-area-header-height) shrink-0 border-b border-studio-area-header-line bg-studio-area-header" />;
}

/** The menu at an area header's start that says what the area shows and changes it. */
export function StudioAreaHeaderMenu({
  icon,
  words,
  label,
  children,
  ...controlDataAttributes
}: {
  icon: StudioIconName;
  words: string;
  /** The button's accessible name, saying what choosing does. */
  label: string;
  children: ReactNode;
} & ControlDataAttributes) {
  const HeaderIcon = studioIconNamed(icon);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-[22px] gap-1.5 rounded-sm bg-studio-control px-1.5 text-studio font-normal text-fg hover:bg-studio-control-open data-popup-open:bg-studio-control-open",
              FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
            )}
          />
        }
        aria-label={label}
        {...controlDataAttributes}
      >
        <HeaderIcon className="size-3.5 text-fg-2" strokeWidth={1.5} aria-hidden />
        {words}
        <ChevronDown className="size-3 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
