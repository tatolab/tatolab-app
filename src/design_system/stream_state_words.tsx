// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { LoaderCircle, SquareX } from "lucide-react";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { presentStreamState, presentStreamStateAfterAStopNotRecorded } from "../presentation/stream_presentation";

/** How a state word reads: quiet for stopped, plain for running, a spinner while starting, red with its icon for a failure. */
export type StateWordsEmphasis = "plain" | "quiet" | "starting" | "failure";

const EMPHASIS_CLASS_NAMES: Record<StateWordsEmphasis, string> = {
  failure: "text-danger-text",
  quiet: "text-fg-3",
  starting: "text-fg-2",
  plain: "text-fg-2",
};

/** A state as a word, as DESIGN.md has it: no icon while healthy, a spinner while starting, a red square for a failure; `meaning` in its tooltip. */
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
