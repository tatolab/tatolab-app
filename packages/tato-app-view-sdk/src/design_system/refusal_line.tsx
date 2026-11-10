import { cn } from "cn";
import { SquareX, TriangleAlert } from "lucide-react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** How bad what was said is: a failure (a refusal, red, announced at once) or a warning (amber, announced politely). */
export type RefusalTone = "failure" | "warning";

/**
 * What the runtime or the system said when it refused something, shown in its own words after an optional lead naming
 * what was refused: a line under what it is about, a smaller line under one field of a property panel, or a bar across
 * the top of a tab.
 */
export function RefusalLine({
  lead,
  words,
  tone = "failure",
  layout = "line",
  ...controlDataAttributes
}: {
  /** The window's own words before the refusal's, as "Stop was refused:". */
  lead?: string;
  /** The refusal, exactly as it was given. */
  words: string;
  tone?: RefusalTone;
  layout?: "line" | "under_field" | "bar";
} & ControlDataAttributes) {
  const ToneIcon = tone === "failure" ? SquareX : TriangleAlert;
  return (
    <p
      role={tone === "failure" ? "alert" : "status"}
      className={cn(
        "flex gap-1.5 text-fg-2",
        layout === "line" && "mt-1 max-w-[640px] text-xs",
        layout === "under_field" && "mt-0.5 text-2xs leading-4",
        layout === "bar" && "min-h-8 items-start border-b px-3 py-1.5 text-xs",
      )}
      {...controlDataAttributes}
    >
      <ToneIcon className={cn("mt-px shrink-0", layout === "under_field" ? "size-3" : "size-3.5", tone === "failure" ? "text-danger" : "text-warn")} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 break-words select-text">
        {lead !== undefined && <span className={tone === "failure" ? "text-danger-text" : "text-warn-text"}>{lead} </span>}
        <span className={layout === "bar" ? "text-fg" : undefined}>{words}</span>
      </span>
    </p>
  );
}
