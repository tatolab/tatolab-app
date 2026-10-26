import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { InlineLink } from "./inline_link";

/** The page a header's breadcrumb leads back to, and the words for the page shown. */
export interface PageBreadcrumb {
  parentLabel: string;
  parentPath: string;
  currentLabel: string;
}

/**
 * A page's header: where it sits, its title with the facts beside it and its actions to the right (the actions wrap
 * under the title when a narrow window has no room for both), a line under the title, notices, and the page's tabs.
 */
export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  facts,
  actions,
  notices,
  tabs,
  ...controlDataAttributes
}: {
  breadcrumb?: PageBreadcrumb;
  title: string;
  subtitle?: ReactNode;
  /** Short facts beside the title, as a stream's state and run mode. */
  facts?: ReactNode;
  actions?: ReactNode;
  /** What was said about the page's last action, under the title. */
  notices?: ReactNode;
  tabs?: ReactNode;
} & ControlDataAttributes) {
  return (
    <header
      className={cn("shrink-0 px-5", tabs === undefined ? "pt-5 pb-4" : "border-b pt-3", breadcrumb === undefined && tabs !== undefined && "pt-5")}
      {...controlDataAttributes}
    >
      {breadcrumb !== undefined && (
        <div className="mb-1.5 flex items-center gap-1 text-xs text-fg-3">
          <InlineLink destination={{ to: breadcrumb.parentPath }} tone="quiet">
            {breadcrumb.parentLabel}
          </InlineLink>
          <ChevronRight className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate text-fg-2">{breadcrumb.currentLabel}</span>
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-full">
          <h1 className="title-lg truncate select-text">{title}</h1>
          {subtitle !== undefined && <p className="text-fg-3">{subtitle}</p>}
        </div>
        {facts !== undefined && <div className="flex min-w-0 items-center gap-4 whitespace-nowrap">{facts}</div>}
        {actions !== undefined && <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {notices}
      {tabs}
    </header>
  );
}
