import { cn } from "cn";
import { ArrowUp, Check, TriangleAlert } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { IndeterminateProgressBar } from "./progress_meter";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { isTheKeyboardsFocusOnNothing } from "./support/keyboards_focus";

/** How big a module's cover is drawn: on a card of the storefront, across a module's own page, or as a list row's thumbnail. */
export type ModuleCoverSize = "card" | "page" | "thumbnail";

const MODULE_COVER_SIZE_CLASS_NAMES: Record<ModuleCoverSize, string> = {
  card: "h-36 w-full gap-3 rounded-t-xl p-4 text-3xl leading-8 bg-[size:24px_24px]",
  page: "aspect-[11/5] w-full gap-5 rounded-xl border border-line p-10 text-[64px] leading-16 bg-[size:32px_32px]",
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

/** What a module card or list row says in its corner, as "In project", and how loudly: news that asks for a look, a quiet fact, or something refused. */
export interface ModuleCardMark {
  words: string;
  tone: "news" | "quiet" | "refused";
}

const MODULE_MARK_TONES = {
  news: { icon: ArrowUp, classNames: "font-medium text-brand-text" },
  quiet: { icon: Check, classNames: "text-fg-2" },
  refused: { icon: TriangleAlert, classNames: "font-medium text-danger-text" },
} as const;

/** A module's mark as a card and a list row draw it: news in the brand's colour behind an arrow, a refusal in the danger colour behind a warning sign, anything else quiet behind a check. */
export function ModuleMark({ mark }: { mark: ModuleCardMark }) {
  const { icon: MarkIcon, classNames } = MODULE_MARK_TONES[mark.tone];
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-2xs", classNames)} data-module-card-mark={mark.tone}>
      <MarkIcon className="size-3" strokeWidth={1.75} aria-hidden />
      {mark.words}
    </span>
  );
}

/** The hover action's place over the cover's corner: out of sight until the card is under the pointer or holds the keyboard's focus. */
const MODULE_CARD_HOVER_ACTION_CLASS_NAMES = "absolute top-2.5 right-2.5 opacity-0 transition-opacity duration-150 group-hover/module:opacity-100 group-focus-within/module:opacity-100";

/**
 * One module or sample in the storefront's grid: its cover, its name, a line on what it does, what it holds and a mark such as whether the project
 * has it. Pressing it opens it. `hoverAction`, such as Add, shows over the cover's corner while the pointer is over the card or the keyboard's focus
 * is in it, and takes no room, so the card never changes size; `pendingWords` takes its place while work on the module runs, and the
 * keyboard's focus moves from the action to the card.
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
  const openButtonElement = useRef<HTMLButtonElement>(null);
  const hasTheHoverActionHeldTheFocus = useRef(false);
  const isPending = pendingWords !== null;
  useLayoutEffect(() => {
    if (isPending && hasTheHoverActionHeldTheFocus.current && isTheKeyboardsFocusOnNothing()) openButtonElement.current?.focus();
    hasTheHoverActionHeldTheFocus.current = false;
  }, [isPending]);
  return (
    <div
      className="group/module relative flex min-w-0 flex-col rounded-xl border border-line bg-raised hover:border-line-strong"
      aria-busy={pendingWords !== null}
      {...controlDataAttributes}
    >
      <button ref={openButtonElement} type="button" onClick={onOpened} className={cn("flex min-w-0 flex-1 flex-col rounded-xl text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)} data-module-card-open="">
        <span className="relative block">
          <ModuleCover title={title} size="card" />
          {pendingWords !== null && <IndeterminateProgressBar className="absolute right-0 bottom-0 left-0" />}
        </span>
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
        <span className="absolute top-2.5 right-2.5 rounded-md bg-window/85 px-2 py-1 text-xs text-fg" data-module-card-pending="">
          {pendingWords}
        </span>
      ) : (
        hoverAction !== null && (
          <span
            className={MODULE_CARD_HOVER_ACTION_CLASS_NAMES}
            onFocus={() => {
              hasTheHoverActionHeldTheFocus.current = true;
            }}
            onBlur={(blurEvent) => {
              if (blurEvent.relatedTarget !== null) hasTheHoverActionHeldTheFocus.current = false;
            }}
          >
            {hoverAction}
          </span>
        )
      )}
    </div>
  );
}
