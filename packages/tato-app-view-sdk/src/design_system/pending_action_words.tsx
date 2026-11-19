import { LoaderCircle } from "lucide-react";

/**
 * An action asked for and not yet answered, as Stopping…: a spinner and its words. `in_place_of_a_button` (the default) stands
 * where the action's button stood, announced as a status; `at_the_end_of_a_row` closes a list row in the row's own colour and
 * size, the row announcing it, as a row's children are not announced on their own.
 */
export function PendingActionWords({ words, place = "in_place_of_a_button" }: { words: string; place?: "in_place_of_a_button" | "at_the_end_of_a_row" }) {
  return place === "in_place_of_a_button" ? (
    <span className="inline-flex h-7 items-center justify-end gap-1.5 px-1 text-fg-3" role="status">
      <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
      {words}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
      {words}
    </span>
  );
}
