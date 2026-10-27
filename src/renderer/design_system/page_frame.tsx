import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** A view in the window: its `PageHeader` bar along the top, over its body. */
export function PageFrame({ header, children, ...controlDataAttributes }: { header: ReactNode; children: ReactNode } & ControlDataAttributes) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" {...controlDataAttributes}>
      {header}
      {children}
    </div>
  );
}

/** How wide a page body's content runs: the whole body, or a column narrow enough to read. */
export type PageBodyWidth = "full" | "readable";

/** A view's body, inset from the window by the page's padding and scrolling on its own. */
export function PageBody({ width = "full", children }: { width?: PageBodyWidth; children: ReactNode }) {
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <div className={cn("px-(--page-x) pt-(--page-top) pb-(--page-bottom)", width === "readable" && "mx-auto max-w-(--page-readable-width)")}>{children}</div>
    </div>
  );
}
