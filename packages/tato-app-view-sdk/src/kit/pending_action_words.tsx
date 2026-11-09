import { LoaderCircle } from "lucide-react";

/** An action the runtime has been asked for and not yet answered, in the place of its button: a spinner and its words, as Stopping…. */
export function PendingActionWords({ words }: { words: string }) {
  return (
    <span className="inline-flex h-7 items-center justify-end gap-1.5 px-1 text-fg-3" role="status">
      <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
      {words}
    </span>
  );
}
