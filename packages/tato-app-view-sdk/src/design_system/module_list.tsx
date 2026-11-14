import { cn } from "cn";
import type { ReactNode } from "react";
import { ModuleCover } from "./module_card";
import type { ProjectCoverNumber } from "./project_card";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

const MODULE_LIST_COLUMNS_CLASS_NAMES = "grid grid-cols-[80px_minmax(0,2fr)_110px_minmax(0,1.2fr)_28px] items-center gap-4 px-4";

/** The modules a project holds, one `ModuleListRow` each, under the headings of the list's columns. */
export function ModuleList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-raised">
      <div className={cn(MODULE_LIST_COLUMNS_CLASS_NAMES, "h-9 border-b text-2xs text-fg-3")} aria-hidden>
        <span />
        <span>Module</span>
        <span>Adds</span>
        <span>Status</span>
        <span />
      </div>
      <ul aria-label={label}>{children}</ul>
    </div>
  );
}

/**
 * One module in a `ModuleList`: its cover, its name and a line on what it does, what it adds, how it stands, and what can be done with it.
 * Pressing its name opens it; the actions sit at the row's end, never inside its name.
 */
export function ModuleListRow({
  title,
  coverNumber,
  summary,
  contentsWords,
  statusWords,
  actions,
  belowTheRow,
  onOpened,
  ...controlDataAttributes
}: {
  title: string;
  coverNumber: ProjectCoverNumber;
  /** Empty for a module nothing describes. */
  summary: string;
  /** What it adds, as "2 nodes · 1 view". */
  contentsWords: string;
  /** How the module stands, as "Update available" over where it was copied from. */
  statusWords: ReactNode;
  /** What can be done with it, as one ⋯ menu. */
  actions: ReactNode;
  /** What the row says under itself, such as a refusal; `null` for nothing. */
  belowTheRow: ReactNode | null;
  onOpened: () => void;
} & ControlDataAttributes) {
  return (
    <li className="border-b last:border-b-0" {...controlDataAttributes}>
      <div className={cn(MODULE_LIST_COLUMNS_CLASS_NAMES, "min-h-16 py-2")}>
        <ModuleCover title={title} coverNumber={coverNumber} size="thumbnail" />
        <button type="button" onClick={onOpened} className={cn("flex min-w-0 flex-col gap-0.5 justify-self-start rounded-md text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)} data-module-list-row-open="">
          <span className="max-w-full truncate text-base font-semibold text-fg">{title}</span>
          {summary !== "" && <span className="max-w-full truncate text-xs text-fg-2">{summary}</span>}
        </button>
        <span className="truncate text-xs text-fg-2">{contentsWords}</span>
        {statusWords}
        <span className="flex items-center justify-end">{actions}</span>
      </div>
      {belowTheRow !== null && <div className="px-4 pb-2.5">{belowTheRow}</div>}
    </li>
  );
}
