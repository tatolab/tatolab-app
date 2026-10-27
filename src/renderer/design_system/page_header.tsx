import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** What a header's title sits under, in quiet words before it; the view's own navigation moves between its parts. */
export interface PageBreadcrumb {
  parentLabel: string;
}

/**
 * A view's bar along the top of the content: where it sits and its title, its tabs, and its actions to the right, in
 * one row; what was said about its last action shows under the bar.
 */
export function PageHeader({
  breadcrumb,
  title,
  isTitleShown = true,
  tabs,
  actions,
  notices,
  windowDragRegion,
  ...controlDataAttributes
}: {
  breadcrumb?: PageBreadcrumb;
  title: string;
  /** False where the sidebar already shows what the view is of: the title is then said to a screen reader only. */
  isTitleShown?: boolean;
  tabs?: ReactNode;
  actions?: ReactNode;
  /** What was said about the view's last action. */
  notices?: ReactNode;
  /** The bar's `data-window-drag-region`, from `windowDragRegionAttribute`: under macOS's overlay title bar the bar drags the window. */
  windowDragRegion: string | null;
} & ControlDataAttributes) {
  return (
    <header className="shrink-0" {...controlDataAttributes}>
      <div className="flex h-(--page-bar-height) min-w-0 items-center gap-5 border-b pr-3 pl-(--page-x)" data-window-drag-region={windowDragRegion ?? undefined}>
        <div className={isTitleShown ? "flex min-w-0 shrink items-center gap-1.5" : "sr-only"}>
          {breadcrumb !== undefined && (
            <>
              <span className="shrink-0 text-fg-3">{breadcrumb.parentLabel}</span>
              <ChevronRight className="size-3.5 shrink-0 text-fg-4" strokeWidth={1.75} aria-hidden />
            </>
          )}
          <h1 className="truncate font-normal text-fg-2 select-text">{title}</h1>
        </div>
        {tabs !== undefined && <div className="flex h-full min-w-0 shrink-0 items-stretch">{tabs}</div>}
        {actions !== undefined && <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {notices !== undefined && <div className="px-(--page-x)">{notices}</div>}
    </header>
  );
}
