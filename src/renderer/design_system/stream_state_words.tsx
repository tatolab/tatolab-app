import { cn } from "cn";
import { LoaderCircle, SquareX, Workflow } from "lucide-react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { presentStreamState, presentStreamStateAfterAStopNotRecorded } from "../presentation/stream_presentation";

/** How a state word reads: quiet for stopped, plain for running, a spinner while starting, red with its icon for a failure. */
export type StateWordsEmphasis = "plain" | "quiet" | "starting" | "failure";

const EMPHASIS_CLASS_NAMES: Record<StateWordsEmphasis, string> = {
  failure: "text-danger-text",
  quiet: "text-fg-3",
  starting: "text-fg-2",
  plain: "text-fg-2",
};

/** A state as a word: no icon while healthy, a spinner while starting, a red square for a failure; `meaning` in its tooltip. */
export function StateWords({ emphasis, words, meaning }: { emphasis: StateWordsEmphasis; words: string; meaning?: string }) {
  return (
    <span title={meaning} className={cn("inline-flex min-w-0 items-center gap-1.5", EMPHASIS_CLASS_NAMES[emphasis])}>
      {emphasis === "failure" && <SquareX className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
      {emphasis === "starting" && <LoaderCircle className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />}
      <span className="truncate">{words}</span>
    </span>
  );
}

/** A stream's state in words, red with its icon when failed, the runtime's whole reason in its tooltip. */
export function StreamStateWords({ stream, isAfterAStopNotRecorded }: { stream: ListedStream; isAfterAStopNotRecorded: boolean }) {
  const statePresentation = isAfterAStopNotRecorded ? presentStreamStateAfterAStopNotRecorded(stream) : presentStreamState(stream);
  return <StateWords emphasis={statePresentation.emphasis} words={statePresentation.label} meaning={statePresentation.meaning} />;
}

/** The colour a stream's icon takes for its state: blue while it runs, red once it failed, grey otherwise. */
const STREAM_STATE_ICON_CLASS_NAMES: Record<StateWordsEmphasis, string> = {
  plain: "text-brand-text",
  starting: "text-fg-3",
  quiet: "text-fg-3",
  failure: "text-danger",
};

/** A stream's icon in its state's colour; where it stands alone, the words beside it say the state for a screen reader. */
export function StreamStateIcon({ stream }: { stream: ListedStream }) {
  return <Workflow className={cn("size-4 shrink-0", STREAM_STATE_ICON_CLASS_NAMES[presentStreamState(stream).emphasis])} strokeWidth={1.75} aria-hidden />;
}
