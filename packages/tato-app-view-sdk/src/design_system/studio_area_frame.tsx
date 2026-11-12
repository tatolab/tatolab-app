import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ViewHeaderRow } from "../studio_readings";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { Toolbar } from "./toolbar";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { studioIconNamed, type StudioIconName } from "./support/studio_icons";

/** What an area header's menu shows its view by: an icon Studio holds, by name, or the image a view's manifest names, drawn in the menu's text colour. */
export type StudioAreaHeaderMenuIcon = StudioIconName | { image_url: string };

/** A view's icon as an area header's menu and its choices draw it. */
export function StudioViewIconMark({ icon }: { icon: StudioAreaHeaderMenuIcon }) {
  if (typeof icon !== "string") {
    const maskOfTheImage = `url(${JSON.stringify(icon.image_url)}) center / contain no-repeat`;
    return <span aria-hidden className="size-3.5 shrink-0 bg-fg-2" style={{ mask: maskOfTheImage, WebkitMask: maskOfTheImage }} data-area-header-menu-icon-image={icon.image_url} />;
  }
  const HeaderIcon = studioIconNamed(icon);
  return <HeaderIcon className="size-3.5 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden />;
}

/** One area of the studio: a rounded pane on the window's frame, its header over the view it shows. */
export function StudioAreaFrame({ label, header, children, ...controlDataAttributes }: { label: string; header: ReactNode; children: ReactNode } & ControlDataAttributes) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-studio-area-outline bg-studio-area" {...controlDataAttributes}>
      <div className="flex h-(--studio-area-header-height) shrink-0 items-center gap-1.5 border-b border-studio-area-header-line bg-studio-area-header px-1.5">
        {header}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}


/** An area whose view draws its own header row in its frame: the view across the whole area, the view-type menu laid over the row's start, its width told to `onHeaderRowMeasured`; expanded, it covers the layout it sits in, staying in place in the tree so its view keeps running. */
export function StudioAreaOverAViewsOwnFrame({
  label,
  viewTypeMenu,
  onHeaderRowMeasured,
  isExpanded = false,
  children,
  ...controlDataAttributes
}: {
  label: string;
  viewTypeMenu: ReactNode;
  onHeaderRowMeasured: (headerRow: ViewHeaderRow) => void;
  isExpanded?: boolean;
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
    <section
      aria-label={label}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-studio-area-outline bg-studio-area",
        isExpanded ? "absolute inset-(--studio-area-gap) z-20" : "relative h-full",
      )}
      {...controlDataAttributes}
    >
      <div ref={viewTypeMenuRowRef} className="absolute top-0 left-0 z-10 flex h-(--studio-area-header-height) items-center gap-2 px-1.5">
        {viewTypeMenu}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A view's own header row, drawn in its frame: an area header's look, its tools laid out after `headerRow`'s inset, where Studio's view-type menu lies over the row; an area header's height until Studio has said where the row lies, and none where Studio says the row is `0` tall. */
export function StudioAreaHeaderRowInAFrame({ headerRow, children }: { headerRow: ViewHeaderRow | null; children?: ReactNode }) {
  if (headerRow?.height_px === 0) return null;
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1.5 border-b border-studio-area-header-line bg-studio-area-header pr-1.5", headerRow === null && "h-(--studio-area-header-height)")}
      style={headerRow === null ? undefined : { height: headerRow.height_px, paddingLeft: headerRow.leading_inset_px }}
    >
      {children}
    </div>
  );
}

/** The toolbar row of the view frame a component is drawn in, `null` until it is drawn; the context itself is `null` outside a view frame. */
const StudioViewToolbarRowContext = createContext<{ toolbarRowElement: HTMLElement | null } | null>(null);

/** A view's whole frame: its header row, holding only Studio's view-type menu, then its toolbar row named `toolbarLabel`, holding `toolbarTools` and whatever the view puts there through `StudioViewToolbarTools`, then the view. */
export function StudioViewFrame({ headerRow, toolbarLabel, toolbarTools, children }: { headerRow: ViewHeaderRow | null; toolbarLabel: string; toolbarTools?: ReactNode; children: ReactNode }) {
  const [toolbarRowElement, setToolbarRowElement] = useState<HTMLDivElement | null>(null);
  return (
    <div className="flex h-screen min-h-0 flex-col bg-studio-area text-fg">
      <StudioAreaHeaderRowInAFrame headerRow={headerRow} />
      <Toolbar label={toolbarLabel} look="view_ribbon" ref={setToolbarRowElement}>
        {toolbarTools}
      </Toolbar>
      <StudioViewToolbarRowContext value={{ toolbarRowElement }}>
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </StudioViewToolbarRowContext>
    </div>
  );
}

/** `children` placed in the toolbar row of the view frame around them, from however deep in the view; outside a view frame, a toolbar row of their own named `label`. */
export function StudioViewToolbarTools({ label, children }: { label: string; children: ReactNode }) {
  const viewFrame = useContext(StudioViewToolbarRowContext);
  if (viewFrame === null) {
    return (
      <Toolbar label={label} look="view_ribbon">
        {children}
      </Toolbar>
    );
  }
  return viewFrame.toolbarRowElement === null ? null : createPortal(children, viewFrame.toolbarRowElement);
}

/** Quiet words in an area header, such as where the view's node is or the stream a view reads. */
export function StudioAreaHeaderWords({ children, ...controlDataAttributes }: { children: ReactNode } & ControlDataAttributes) {
  return (
    <span className="truncate text-2xs text-fg-3" {...controlDataAttributes}>
      {children}
    </span>
  );
}

/** The header row a view's frame would draw, drawn by Studio while the area waits for the view, so the view-type menu sits on an area header as ever. */
export function StudioAreaHeaderRowOfAWaitingView() {
  return <div className="h-(--studio-area-header-height) shrink-0 border-b border-studio-area-header-line bg-studio-area-header" />;
}

const STUDIO_AREA_HEADER_MENU_BUTTON_CLASS_NAMES = cn(
  "h-[22px] gap-1.5 rounded-sm bg-studio-control px-1.5 text-studio font-normal text-fg hover:bg-studio-control-open data-popup-open:bg-studio-control-open",
  FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
);

/** The menu at an area header's start that says what the area shows and changes it. */
export function StudioAreaHeaderMenu({
  icon,
  words,
  label,
  children,
  ...controlDataAttributes
}: {
  icon: StudioAreaHeaderMenuIcon;
  words: string;
  /** The button's accessible name, saying what choosing does. */
  label: string;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={STUDIO_AREA_HEADER_MENU_BUTTON_CLASS_NAMES}
          />
        }
        aria-label={label}
        {...controlDataAttributes}
      >
        <StudioViewIconMark icon={icon} />
        {words}
        <ChevronDown className="size-3 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A choice in a view's own header row, or atop its body where the row has no room, as "Show [Assets ▾]": a quiet word naming what it chooses, then a header menu of the choices. */
export function StudioAreaHeaderChoiceMenu({
  leadingWord,
  words,
  label,
  children,
  ...controlDataAttributes
}: {
  leadingWord: string;
  words: string;
  /** The button's accessible name, saying what is chosen now, as "Show: Assets". */
  label: string;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-2xs text-fg-3">{leadingWord}</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className={STUDIO_AREA_HEADER_MENU_BUTTON_CLASS_NAMES} />} aria-label={label} {...controlDataAttributes}>
          {words}
          <ChevronDown className="size-3 text-fg-3" strokeWidth={1.75} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-44">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
