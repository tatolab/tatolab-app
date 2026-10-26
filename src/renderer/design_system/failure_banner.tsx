import { cn } from "cn";
import { SquareX } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** The red band across the top of a page or panel saying something failed and why, with the action that tries again. */
export function FailureBanner({
  place,
  children,
  action,
  ...controlDataAttributes
}: {
  /** A page's band is set at the page's size; a panel's at the panel's. */
  place: "page" | "panel";
  children: ReactNode;
  action?: ReactNode;
} & ControlDataAttributes) {
  return (
    <div
      role="alert"
      className={cn("flex items-center gap-2 border-b bg-danger-soft", place === "page" ? "min-h-10 px-5 py-1.5" : "px-4 py-2 text-xs")}
      {...controlDataAttributes}
    >
      <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 text-fg select-text">{children}</span>
      {action !== undefined && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
