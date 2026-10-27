import { cn } from "cn";
import { LoaderCircle, SquareX, TriangleAlert, Workflow } from "lucide-react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { presentStreamState, type StreamStateIconTone } from "../presentation/stream_presentation";

/** How a state word reads: quiet for stopped, plain for running, a spinner while starting, amber with its icon for a problem that may pass, red with its icon for a failure. */
export type StateWordsEmphasis = "plain" | "quiet" | "starting" | "warning" | "failure";

const EMPHASIS_CLASS_NAMES: Record<StateWordsEmphasis, string> = {
  failure: "text-danger-text",
  warning: "text-warn-text",
  quiet: "text-fg-3",
  starting: "text-fg-2",
  plain: "text-fg-2",
};

/** A state as a word: no icon while healthy, a spinner while starting, an amber triangle for a problem that may pass, a red square for a failure; `meaning` in its tooltip. */
export function StateWords({ emphasis, words, meaning }: { emphasis: StateWordsEmphasis; words: string; meaning?: string }) {
  return (
    <span title={meaning} className={cn("inline-flex min-w-0 items-center gap-1.5", EMPHASIS_CLASS_NAMES[emphasis])}>
      {emphasis === "failure" && <SquareX className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
      {emphasis === "warning" && <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
      {emphasis === "starting" && <LoaderCircle className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />}
      <span className="truncate">{words}</span>
    </span>
  );
}

/** The colour a stream's icon takes for its state: blue while it runs, red once it failed, grey otherwise. */
const STREAM_STATE_ICON_CLASS_NAMES: Record<StreamStateIconTone, string> = {
  running: "text-brand-text",
  idle: "text-fg-3",
  failed: "text-danger",
};

/** A stream's icon in its state's colour; where it stands alone, the words beside it say the state for a screen reader. */
export function StreamStateIcon({ stream }: { stream: ListedStream }) {
  return <Workflow className={cn("size-4 shrink-0", STREAM_STATE_ICON_CLASS_NAMES[presentStreamState(stream).iconTone])} strokeWidth={1.75} aria-hidden />;
}
