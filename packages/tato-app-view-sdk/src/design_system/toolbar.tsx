import { cn } from "cn";
import type { ReactNode } from "react";
import { Separator } from "./ui/separator";

/** How a toolbar sits: a page's, roomy under a tab's header; or a view's ribbon, a slim strip of icon tools under a studio area's header. */
export type ToolbarLook = "page" | "view_ribbon";

const TOOLBAR_LOOK_CLASS_NAMES: Record<ToolbarLook, string> = {
  page: "min-h-10 gap-x-2 gap-y-1.5 border-b bg-window px-3 py-1",
  view_ribbon: "min-h-8.5 gap-x-1 gap-y-0.5 border-b border-studio-area-header-line bg-studio-area px-1.5 py-0.5",
};

/** A toolbar under its header: its controls in groups on one line, wrapping onto a second in a narrow window rather than cutting a control short. */
export function Toolbar({ label, look = "page", children }: { label: string; look?: ToolbarLook; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className={cn("@container relative flex shrink-0 flex-wrap items-center", TOOLBAR_LOOK_CLASS_NAMES[look])} data-toolbar-look={look}>
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
