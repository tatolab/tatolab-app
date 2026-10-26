import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { InlineLink } from "./inline_link";

/** The page a header's breadcrumb leads back to. */
export interface PageBreadcrumb {
  parentLabel: string;
  parentPath: string;
}

/**
 * A view's bar along the top of the content: where it sits and its title, the facts beside it, its tabs, and its
 * actions to the right, in one row at the title bar's height; what was said about its last action shows under the bar.
 */
export function PageHeader({
  breadcrumb,
  title,
  facts,
  tabs,
  actions,
  notices,
  windowDragRegion,
  ...controlDataAttributes
}: {
  breadcrumb?: PageBreadcrumb;
  title: string;
  /** Short facts beside the title, as a stream's state. */
  facts?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  /** What was said about the view's last action. */
  notices?: ReactNode;
  /** The bar's `data-window-drag-region`, from `windowDragRegionAttribute`: under macOS's overlay title bar the bar drags the window. */
  windowDragRegion: string | null;
} & ControlDataAttributes) {
  return (
    <header className="shrink-0" {...controlDataAttributes}>
      <div className="flex h-(--title-bar-height) min-w-0 items-center gap-5 border-b pr-3 pl-(--page-x)" data-window-drag-region={windowDragRegion ?? undefined}>
        <div className="flex min-w-0 shrink items-center gap-1.5">
          {breadcrumb !== undefined && (
            <>
              <InlineLink destination={{ to: breadcrumb.parentPath }} tone="quiet">
                {breadcrumb.parentLabel}
              </InlineLink>
              <ChevronRight className="size-3.5 shrink-0 text-fg-4" strokeWidth={1.75} aria-hidden />
            </>
          )}
          <h1 className="truncate font-normal text-fg-2 select-text">{title}</h1>
          {facts !== undefined && <div className="ml-1.5 flex min-w-0 items-center gap-3 whitespace-nowrap">{facts}</div>}
        </div>
        {tabs !== undefined && <div className="flex h-full min-w-0 shrink-0 items-stretch">{tabs}</div>}
        {actions !== undefined && <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {notices !== undefined && <div className="px-(--page-x)">{notices}</div>}
    </header>
  );
}
