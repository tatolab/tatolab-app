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

/**
 * A view's body, inset from the window by the page's padding and scrolling on its own, with what is fixed under it
 * (a footer of actions) below the scroll. A side panel runs full height beside it with its own scroll; under 1280 px it
 * sits under the body in one scroll, so the body keeps its room.
 */
export function PageBody({
  width = "full",
  sidePanel,
  footer,
  children,
}: {
  width?: PageBodyWidth;
  sidePanel?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insetContent = <div className={cn("px-(--page-x) pt-(--page-top) pb-(--page-bottom)", width === "readable" && "mx-auto max-w-(--page-readable-width)")}>{children}</div>;
  return (
    <>
      {sidePanel === undefined ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{insetContent}</div>
      ) : (
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
          <div className="scrollbar-thin min-w-0 flex-1 xl:overflow-y-auto">{insetContent}</div>
          {sidePanel}
        </div>
      )}
      {footer}
    </>
  );
}
