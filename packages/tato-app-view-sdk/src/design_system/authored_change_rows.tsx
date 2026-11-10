import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributeName } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** Who made a change: a person, an agent, or the runtime itself. */
export type ChangeAuthorKind = "person" | "agent" | "runtime";

/** One change a list shows, by its author. */
export interface AuthoredChange {
  change_id: string;
  author_kind: ChangeAuthorKind;
  /** The author's name, whose first letter the avatar shows. */
  author_name: string;
  /** What it changed, with the thing it is about set bold between `lead` and `rest`. */
  sentence: { lead: string; subject: string | null; rest: string };
  /** Who, when and anything more about the change, under the sentence, as "Sam · 2 min ago · undone". */
  byline: string;
  /** Each operation it made, in a line of code type. */
  operation_lines: readonly string[];
  /** Reversed, and shown dimmed until it is redone or can no longer be. */
  is_undone: boolean;
  /** The change the project stands at now, set on a card of its own unless it is an agent's, which keeps the agent's tint. */
  is_the_current_change: boolean;
  /** What choosing it does, read out with the row and shown while the pointer rests on it. */
  choice_words: string;
}

/** The round initial for a change's author, in their kind's colour. */
export function ChangeAuthorAvatar({ authorKind, authorName }: { authorKind: ChangeAuthorKind; authorName: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[26px] shrink-0 items-center justify-center rounded-full text-2xs font-semibold uppercase",
        authorKind === "person" && "bg-studio-person-avatar text-fg",
        authorKind === "agent" && "bg-studio-agent-avatar text-studio-agent-text",
        authorKind === "runtime" && "bg-studio-control text-fg-2",
      )}
    >
      {authorName.trim().charAt(0) || "?"}
    </span>
  );
}

/** A heading over a run of changes, as "Today". */
export function AuthoredChangeSectionHeading({ children }: { children: ReactNode }) {
  return <li className="px-3 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-fg-3 uppercase">{children}</li>;
}

/** One change as a row of a list: its author's avatar, what it changed, who and when, and its operations; chosen to go back or forward to it. */
export function AuthoredChangeRow({
  change,
  isChoosable,
  onChosen,
  dataAttribute,
}: {
  change: AuthoredChange;
  /** False while a choice is being carried out, or for a change nothing can reverse. */
  isChoosable: boolean;
  onChosen: (changeId: string) => void;
  /** Set on the row's button to the change's id, as `data-history-row="5b0e…"`. */
  dataAttribute: ControlDataAttributeName;
}) {
  const { sentence } = change;
  return (
    <li>
      <button
        type="button"
        disabled={!isChoosable}
        title={change.choice_words}
        aria-label={`${[sentence.lead, sentence.subject, sentence.rest].filter((words) => words !== null && words !== "").join(" ")}. ${change.byline}. ${change.choice_words}`}
        onClick={() => onChosen(change.change_id)}
        {...{ [dataAttribute]: change.change_id }}
        data-undone={change.is_undone || undefined}
        className={cn(
          "grid w-full grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-md px-3 py-2.5 text-left outline-none enabled:hover:bg-hover disabled:cursor-default",
          FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
          change.author_kind === "agent" && !change.is_undone ? "bg-studio-agent-row" : change.is_the_current_change && "bg-studio-current-change-row",
        )}
      >
        <span className={cn(change.is_undone && "opacity-50")}>
          <ChangeAuthorAvatar authorKind={change.author_kind} authorName={change.author_name} />
        </span>
        <span className="min-w-0">
          <span className={cn("block text-studio", change.is_undone ? "text-fg-3" : "text-fg")}>
            {sentence.lead}
            {sentence.subject !== null && <b className="font-semibold"> {sentence.subject}</b>}
            {sentence.rest !== "" && ` ${sentence.rest}`}
          </span>
          <span className="mt-0.5 block text-2xs text-fg-3">{change.byline}</span>
          {change.operation_lines.length > 0 && (
            <span className={cn("mt-1 block font-mono text-2xs leading-4", change.is_undone ? "text-fg-3" : "text-fg-2")}>
              {change.operation_lines.map((operationLine, position) => (
                <span key={position} className="block truncate">
                  {operationLine}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** A list of changes, newest first, under `label`. */
export function AuthoredChangeList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-0.5 px-1.5 py-2">
      {children}
    </ol>
  );
}
