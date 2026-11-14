import { cn } from "cn";
import type { ReactNode } from "react";
import { ModuleCover } from "./module_card";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

const MODULE_LIST_COLUMNS_CLASS_NAMES = "grid grid-cols-[80px_minmax(0,2fr)_110px_minmax(0,1.2fr)_190px] items-center gap-4 px-4";

/** The modules a project holds, one `ModuleListRow` each, under the headings of the list's columns. */
export function ModuleList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-raised">
      <div className={cn(MODULE_LIST_COLUMNS_CLASS_NAMES, "h-9 border-b text-2xs text-fg-3")} aria-hidden>
        <span />
        <span>Module</span>
        <span>Adds</span>
        <span>Its copy</span>
        <span />
      </div>
      <ul aria-label={label}>{children}</ul>
    </div>
  );
}

/**
 * One module in a `ModuleList`: its cover, its name and a line on what it does, what it adds, how its copy stands, and what can be done with it.
 * Pressing its name opens it; the actions sit beside the name, never inside it.
 */
export function ModuleListRow({
  title,
  summary,
  titleBadge,
  contentsWords,
  copyWords,
  actions,
  belowTheRow,
  onOpened,
  ...controlDataAttributes
}: {
  title: string;
  /** Empty for a module nothing describes. */
  summary: string;
  /** A chip beside the name, such as how many of its files were edited; `null` for none. */
  titleBadge: ReactNode | null;
  /** What it adds, as "2 nodes · 1 view". */
  contentsWords: string;
  copyWords: ReactNode;
  actions: ReactNode;
  /** What the row says under itself, such as a refusal; `null` for nothing. */
  belowTheRow: ReactNode | null;
  onOpened: () => void;
} & ControlDataAttributes) {
  return (
    <li className="border-b last:border-b-0" {...controlDataAttributes}>
      <div className={cn(MODULE_LIST_COLUMNS_CLASS_NAMES, "min-h-16 py-2")}>
        <ModuleCover title={title} size="thumbnail" />
        <span className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onOpened} className={cn("flex min-w-0 flex-col gap-0.5 rounded-md text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)} data-module-list-row-open="">
            <span className="truncate text-base font-semibold text-fg">{title}</span>
            {summary !== "" && <span className="truncate text-xs text-fg-2">{summary}</span>}
          </button>
          {titleBadge}
        </span>
        <span className="truncate text-xs text-fg-2">{contentsWords}</span>
        {copyWords}
        <span className="flex items-center justify-end gap-1.5">{actions}</span>
      </div>
      {belowTheRow !== null && <div className="px-4 pb-2.5">{belowTheRow}</div>}
    </li>
  );
}
