import { cn } from "cn";
import { Check, Hourglass, LoaderCircle, SquareX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { GettingStartedStepProgress as ChecklistStepProgress } from "../presentation/getting_started_presentation";
import type { ControlDataAttributes } from "./control_data_attributes";

/** Each progress's icon and its colour: status in a shape only where something needs the person or went wrong. */
const PROGRESS_ICONS: Record<ChecklistStepProgress, { icon: LucideIcon; className: string; label: string }> = {
  waiting: { icon: Hourglass, className: "text-fg-3", label: "Not yet" },
  in_progress: { icon: LoaderCircle, className: "animate-spin text-fg-3", label: "Under way" },
  done: { icon: Check, className: "text-fg-2", label: "Done" },
  needs_you: { icon: TriangleAlert, className: "text-warn", label: "Needs you" },
  failed: { icon: SquareX, className: "text-danger", label: "Stopped" },
};

/** Steps that tick as they complete, in one frame with hairlines between them. */
export function ProgressChecklist({ label, children, ...controlDataAttributes }: { label: string; children: ReactNode } & ControlDataAttributes) {
  return (
    <ol aria-label={label} className="flex flex-col divide-y rounded-lg border bg-window" {...controlDataAttributes}>
      {children}
    </ol>
  );
}

/** One step: its progress as an icon, its name and how it stands, what to do when there is more to say, and the action that moves it on. */
export function ProgressChecklistStep({
  progress,
  title,
  progressWords,
  explanation = null,
  action = null,
  children,
  ...controlDataAttributes
}: {
  progress: ChecklistStepProgress;
  title: string;
  /** How the step stands, under its name. */
  progressWords: string;
  explanation?: string | null;
  /** The control that moves the step on, at its right. */
  action?: ReactNode;
  /** What shows under the step across its width, as a refusal. */
  children?: ReactNode;
} & ControlDataAttributes) {
  const { icon: ProgressIcon, className: progressIconClassName, label: progressLabel } = PROGRESS_ICONS[progress];
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-checklist-step-progress={progress} {...controlDataAttributes}>
      <div className="flex min-h-8 items-start gap-3">
        <ProgressIcon className={cn("mt-0.5 size-4 shrink-0", progressIconClassName)} strokeWidth={progress === "done" ? 2 : 1.75} aria-label={progressLabel} role="img" />
        <div className="min-w-0 flex-1">
          <p className={progress === "waiting" ? "text-fg-3" : "text-fg"}>{title}</p>
          <p
            className={cn(
              "text-xs",
              progress === "needs_you" ? "text-warn-text" : progress === "failed" ? "text-danger-text" : "text-fg-3",
            )}
            role={progress === "in_progress" ? "status" : undefined}
          >
            {progressWords}
          </p>
          {explanation !== null && <p className="mt-1 max-w-[52ch] text-xs text-fg-2 select-text">{explanation}</p>}
        </div>
        {action !== null && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      {children}
    </li>
  );
}
