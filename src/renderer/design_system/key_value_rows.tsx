import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";

/** One row: what it names, its value, and what the name means, shown while the pointer rests on it. */
export type KeyValueRow = readonly [key: string, value: ReactNode, keyMeaning?: string | null];

/**
 * Named values, a name per row in a quiet column: facts in the window's words (a step's type, a stream's project), or
 * fields as the runtime wrote them (a record's fields, a step's config), in mono, each value whole.
 */
export function KeyValueRows({
  rows,
  look = "facts",
  ...controlDataAttributes
}: { rows: readonly KeyValueRow[]; look?: "facts" | "fields" } & ControlDataAttributes) {
  return (
    <dl
      className={cn(
        "grid gap-x-3",
        look === "facts" ? "grid-cols-[76px_minmax(0,1fr)] gap-y-1.5" : "grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs",
      )}
      {...controlDataAttributes}
    >
      {rows.map(([key, value, keyMeaning]) => (
        <div key={key} className="contents">
          <WithControlTooltip tooltip={keyMeaning ?? undefined} isWide control={<dt className="truncate text-fg-3">{key}</dt>} />
          <dd className={cn("min-w-0 text-fg", look === "facts" ? "truncate" : "break-all select-text")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
