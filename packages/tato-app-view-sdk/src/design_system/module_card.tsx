import { cn } from "cn";
import { ArrowUp, Check } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** How big a module's cover is drawn: on a card of the storefront, across a module's own page, or as a list row's thumbnail. */
export type ModuleCoverSize = "card" | "page" | "thumbnail";

const MODULE_COVER_SIZE_CLASS_NAMES: Record<ModuleCoverSize, string> = {
  card: "h-36 w-full gap-3 p-4 text-[30px] leading-8 bg-[size:24px_24px]",
  page: "aspect-[11/5] w-full gap-5 rounded-xl border border-line p-10 text-[64px] leading-[64px] bg-[size:32px_32px]",
  thumbnail: "h-11 w-20 shrink-0 gap-1 rounded-md border border-line p-1.5 text-2xs leading-3 bg-[size:10px_10px]",
};

/** A module's cover: its name set large over fine linework, with a rule drawn under it. */
export function ModuleCover({ title, size }: { title: string; size: ModuleCoverSize }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-col justify-end overflow-hidden bg-well bg-[image:linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] font-semibold tracking-tight text-fg-2 select-none",
        MODULE_COVER_SIZE_CLASS_NAMES[size],
      )}
      data-module-cover={size}
    >
      <span className={size === "thumbnail" ? "truncate" : "line-clamp-2 break-words"}>{title}</span>
      <span className="h-px w-full shrink-0 bg-line-strong" />
    </span>
  );
}

/** What a module card says in its corner: words such as "In project", and whether they are news that asks for a look, such as an update. */
export interface ModuleCardMark {
  words: string;
  isNews: boolean;
}

/** A module's mark as a card and a list row draw it: news in the brand's colour behind an arrow, anything else quiet behind a check. */
export function ModuleMark({ mark }: { mark: ModuleCardMark }) {
  const MarkIcon = mark.isNews ? ArrowUp : Check;
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-2xs", mark.isNews ? "font-medium text-brand-text" : "text-fg-2")} data-module-card-mark="">
      <MarkIcon className="size-3" strokeWidth={1.75} aria-hidden />
      {mark.words}
    </span>
  );
}

/**
 * One module or sample in the storefront's grid: its cover, its name, a line on what it does, what it holds and a mark such as whether the project
 * has it. Pressing it opens it. `hoverAction`, such as Add, shows over the cover's corner while the pointer is over the card or the keyboard's focus
 * is in it, and takes no room, so the card never changes size; `pendingWords` takes its place while work on the module runs.
 */
export function ModuleCard({
  title,
  summary,
  contentsWords,
  mark,
  pendingWords,
  hoverAction,
  onOpened,
  ...controlDataAttributes
}: {
  title: string;
  summary: string;
  /** What it holds, as "2 nodes · 1 stream". */
  contentsWords: string;
  mark: ModuleCardMark | null;
  /** What is being done with the module, as "Adding…"; `null` when nothing is. */
  pendingWords: string | null;
  /** `null` for a module with nothing to offer from its card. */
  hoverAction: ReactNode | null;
  onOpened: () => void;
} & ControlDataAttributes) {
  return (
    <div
      className="group/module relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-raised hover:border-line-strong has-[[data-module-card-open]:focus-visible]:border-line-strong"
      aria-busy={pendingWords !== null}
      {...controlDataAttributes}
    >
      <button type="button" onClick={onOpened} className={cn("flex min-w-0 flex-1 flex-col text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)} data-module-card-open="">
        <ModuleCover title={title} size="card" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
          <span className="truncate text-base font-semibold text-fg">{title}</span>
          <span className="line-clamp-2 min-h-8 text-xs text-fg-2">{summary}</span>
          <span className="flex min-h-4 min-w-0 items-center justify-between gap-2 pt-1">
            <span className="truncate text-2xs text-fg-3">{contentsWords}</span>
            {mark !== null && <ModuleMark mark={mark} />}
          </span>
        </span>
      </button>
      {pendingWords !== null ? (
        <span className="absolute top-2.5 right-2.5 rounded-md bg-window/85 px-2 py-1 text-xs text-fg" role="status" data-module-card-pending="">
          {pendingWords}
        </span>
      ) : (
        hoverAction !== null && (
          <span className="absolute top-2.5 right-2.5 opacity-0 transition-opacity duration-150 group-hover/module:opacity-100 focus-within:opacity-100">{hoverAction}</span>
        )
      )}
      {pendingWords !== null && (
        <span aria-hidden className="absolute top-36 right-0 left-0 h-0.5 -translate-y-full overflow-hidden bg-line-strong">
          <span className="block h-full w-1/3 animate-[progress-meter-sweep_1.4s_ease-in-out_infinite] bg-brand" />
        </span>
      )}
    </div>
  );
}
