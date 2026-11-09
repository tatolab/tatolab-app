import { cn } from "cn";
import type { ReactNode } from "react";
import { Separator } from "./ui/separator";

/** A tab's toolbar under its header: its controls in groups on one line, wrapping onto a second in a narrow window rather than cutting a control short. */
export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="@container relative flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-window px-3 py-1"
    >
      {children}
    </div>
  );
}

/** Controls of a toolbar that belong together; the group at the end sits against the toolbar's right edge. */
export function ToolbarGroup({ isAtTheEnd = false, children }: { isAtTheEnd?: boolean; children: ReactNode }) {
  return <div className={cn("flex shrink-0 items-center gap-0.5", isAtTheEnd && "ml-auto")}>{children}</div>;
}

/** A hairline between two groups of a toolbar's buttons. */
export function ToolbarDivider() {
  return <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />;
}
