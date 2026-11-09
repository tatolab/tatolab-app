import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** The picture at the top of a project card: a graph drawn as two nodes joined over the canvas's dot grid. */
function ProjectGraphThumbnail() {
  return (
    <span
      aria-hidden
      className="relative block aspect-16/10 overflow-hidden rounded-lg border border-line-strong bg-raised bg-[radial-gradient(var(--line)_1px,transparent_1px)] bg-size-[12px_12px] transition-colors group-hover:border-fg-4"
    >
      <span className="absolute top-[30%] left-[14%] h-[18%] w-[26%] rounded-sm border border-line-strong bg-studio-area" />
      <span className="absolute top-[52%] left-[56%] h-[18%] w-[28%] rounded-sm border border-line-strong bg-studio-area" />
      <span className="absolute top-[39%] left-[40%] h-0.5 w-[19%] origin-left rotate-28 bg-fg-4" />
    </span>
  );
}

/** One project in the Projects window: its graph's picture, its name, where it is and when it was last opened, marked when it doesn't read; pressing it opens it. */
export function ProjectCard({
  name,
  detail,
  isUnreadable,
  onOpened,
  ...controlDataAttributes
}: {
  name: string;
  /** The card's second line, as "~/streams/pattern · 2 hours ago". */
  detail: string;
  isUnreadable: boolean;
  onOpened: () => void;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onOpened}
      className={cn("group flex w-full min-w-0 flex-col gap-2.5 rounded-lg text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      {...controlDataAttributes}
    >
      <ProjectGraphThumbnail />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
          {isUnreadable && <TriangleAlert className="size-3.5 shrink-0 text-warn-text" strokeWidth={1.75} aria-label="Doesn't read now" />}
          <span className="truncate">{name}</span>
        </span>
        <span className="truncate text-xs text-fg-3">{detail}</span>
      </span>
    </button>
  );
}
