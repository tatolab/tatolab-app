import { cn } from "cn";
import type { ReactNode } from "react";
import { Progress, ProgressIndicator, ProgressTrack } from "./ui/progress";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** How a progress meter ended, or that it has not: under way, done, or failed. */
export type ProgressMeterOutcome = "in_progress" | "done" | "failed";

/**
 * One piece of work with its name, a line of detail and a bar: filled to `percent` when its share is known, a sweep when
 * `percent` is `null`, and no bar once it has ended, its detail then saying how. A failure's detail is the refusal's own words.
 */
export function ProgressMeter({
  label,
  detail,
  percent,
  outcome,
  ...controlDataAttributes
}: { label: string; detail: ReactNode; percent: number | null; outcome: ProgressMeterOutcome } & ControlDataAttributes) {
  return (
    <div className="flex flex-col gap-1 py-1.5" data-progress-meter-outcome={outcome} {...controlDataAttributes}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg">{label}</span>
        {outcome === "in_progress" && percent !== null && <span className="text-2xs text-fg-3 tabular-nums">{Math.round(percent)}%</span>}
      </div>
      {outcome === "in_progress" && (
        <Progress value={percent} aria-label={label} className="block">
          <ProgressTrack className="bg-line-strong">
            <ProgressIndicator className={cn(percent === null && "w-1/3 animate-[progress-meter-sweep_1.4s_ease-in-out_infinite]")} />
          </ProgressTrack>
        </Progress>
      )}
      <span className={cn("text-2xs break-words whitespace-pre-wrap", outcome === "failed" ? "text-danger-text" : "text-fg-3")}>{detail}</span>
    </div>
  );
}
