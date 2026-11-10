import { cn } from "cn";
import { Check } from "lucide-react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { PlainCover, type ProjectCoverNumber } from "./project_card";

/** What a module card says beside its name: words such as "Added", and whether they are news that asks for a look, such as a newer version. */
export interface ModuleCardMark {
  words: string;
  isNews: boolean;
}

/** One module or sample in a grid of them: its cover, its name, a mark such as whether the project has added it, and a line on what it does; pressing it picks it, the picked one outlined. */
export function ModuleCard({
  title,
  summary,
  coverNumber,
  coverInitial,
  mark,
  isPicked,
  onPicked,
  ...controlDataAttributes
}: {
  title: string;
  summary: string;
  coverNumber: ProjectCoverNumber;
  coverInitial: string;
  mark: ModuleCardMark | null;
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
        {mark !== null && (
          <span className={cn("flex shrink-0 items-center gap-1 text-2xs", mark.isNews ? "font-medium text-brand-text" : "text-fg-2")} data-module-card-mark="">
            {!mark.isNews && <Check className="size-3" strokeWidth={1.75} aria-hidden />}
            {mark.words}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-xs text-fg-2">{summary}</span>
    </button>
  );
}
