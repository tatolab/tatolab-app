import { cn } from "cn";
import { Check } from "lucide-react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { PlainCover, type ProjectCoverNumber } from "./project_card";

/** One module or sample in a grid of them: its cover, its name, whether the project has added it, and a line on what it does; pressing it picks it, the picked one outlined. */
export function ModuleCard({
  title,
  summary,
  coverNumber,
  coverInitial,
  isAddedToTheProject,
  isPicked,
  onPicked,
  ...controlDataAttributes
}: {
  title: string;
  summary: string;
  coverNumber: ProjectCoverNumber;
  coverInitial: string;
  isAddedToTheProject: boolean;
  isPicked: boolean;
  onPicked: () => void;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      aria-pressed={isPicked}
      onClick={onPicked}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-xl border bg-raised p-3.5 text-left outline-none hover:border-line-strong",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        isPicked ? "border-brand" : "border-line",
      )}
      {...controlDataAttributes}
    >
      <PlainCover coverNumber={coverNumber} coverInitial={coverInitial} size="band" />
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-semibold text-fg">{title}</span>
        {isAddedToTheProject && (
          <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-2">
            <Check className="size-3" strokeWidth={1.75} aria-hidden />
            Added
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-xs text-fg-2">{summary}</span>
    </button>
  );
}
