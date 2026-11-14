import { cn } from "cn";
import type { ReactNode } from "react";
import { Progress, ProgressIndicator, ProgressTrack } from "./ui/progress";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** One part of a meter's work, such as a package of an install, with a line on how far it has got. */
export interface ProgressMeterPart {
  name: string;
  detail: string;
}

/** How a progress meter ended, or that it has not: under way, done, or failed. */
export type ProgressMeterOutcome = "in_progress" | "done" | "failed";

const INDETERMINATE_SWEEP_CLASS_NAMES = "w-1/3 animate-[progress-meter-sweep_1.4s_ease-in-out_infinite]";

/** A thin bar that sweeps while work of unknown length runs, for a place that says the work in words of its own beside it; a screen reader hears nothing of it. */
export function IndeterminateProgressBar({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block h-0.5 overflow-hidden bg-line-strong", className)}>
      <span className={cn("block h-full bg-brand", INDETERMINATE_SWEEP_CLASS_NAMES)} />
    </span>
  );
}

/**
 * One piece of work with its name, a line of detail and a bar: filled to `percent` when its share is known, a sweep when
 * `percent` is `null`, and no bar once it has ended, its detail then saying how. A failure's detail is the refusal's own words.
 * Its `parts`, when it names any, are listed under it, one line each.
 */
export function ProgressMeter({
  label,
  detail,
  percent,
  outcome,
  parts = [],
  ...controlDataAttributes
}: { label: string; detail: ReactNode; percent: number | null; outcome: ProgressMeterOutcome; parts?: readonly ProgressMeterPart[] } & ControlDataAttributes) {
  return (
    <div className="flex flex-col gap-1 py-1.5" data-progress-meter-outcome={outcome} {...controlDataAttributes}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg">{label}</span>
        {outcome === "in_progress" && percent !== null && <span className="text-2xs text-fg-3 tabular-nums">{Math.round(percent)}%</span>}
      </div>
      {outcome === "in_progress" && (
        <Progress value={percent} aria-label={label} className="block">
          <ProgressTrack className="bg-line-strong">
            <ProgressIndicator className={cn(percent === null && INDETERMINATE_SWEEP_CLASS_NAMES)} />
          </ProgressTrack>
        </Progress>
      )}
      <span className={cn("text-2xs break-words whitespace-pre-wrap", outcome === "failed" ? "text-danger-text" : "text-fg-3")}>{detail}</span>
      {parts.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-2xs" aria-label={`${label}, each part`}>
          {parts.map((part) => (
            <li key={part.name} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate text-fg-2">{part.name}</span>
              <span className="text-fg-3 tabular-nums">{part.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
