// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Copy, Infinity as InfinityIcon, LoaderCircle, RefreshCw, SquareX, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import {
  isStreamLoaded,
  presentStreamRunMode,
  presentStreamState,
  presentStreamStateAfterAStopNotRecorded,
  STOP_NOT_RECORDED_LEAD,
  streamActionRefusalLead,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import { isStreamActionStillUnderWay, presentStreamRemovalConfirmation, type StreamActionUnderWay } from "../presentation/streams_list_presentation";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./shadcn/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import { useCopiedConfirmation } from "./copied_confirmation";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The action a person chose on a row, by its word: Stop, Start, Retry or Remove. */
export type ChosenStreamActionLabel = StreamPrimaryActionPresentation["label"] | "Remove";

/** What the runtime said about a stream's last action: its refusal after the action the person chose, or the notice beside a stop it could not record. */
export type StreamActionOutcomeWords =
  | { kind: "refusal"; chosenActionLabel: ChosenStreamActionLabel; runtimeWords: string }
  | { kind: "notice"; runtimeWords: string };

function withoutKey<Value>(entries: ReadonlyMap<string, Value>, key: string): ReadonlyMap<string, Value> {
  if (!entries.has(key)) return entries;
  const remainingEntries = new Map(entries);
  remainingEntries.delete(key);
  return remainingEntries;
}

function listingNamed(listedStreams: readonly ListedStream[], streamName: string): ListedStream | null {
  return listedStreams.find((stream) => stream.name === streamName) ?? null;
}

/** The stream actions under way on each stream and what the runtime last said of each, kept until the listing shows the outcome. */
export function useStreamActionsUnderWay(listedStreams: readonly ListedStream[]) {
  const { backend } = useTatolabWindowEnvironment();
  const [actionsUnderWay, setActionsUnderWay] = useState<ReadonlyMap<string, StreamActionUnderWay>>(new Map());
  const [outcomeWords, setOutcomeWords] = useState<ReadonlyMap<string, StreamActionOutcomeWords>>(new Map());
  /** The listing as of the last render, for an answer that arrives after the status showing its outcome. */
  const latestListedStreams = useRef(listedStreams);

  useEffect(() => {
    latestListedStreams.current = listedStreams;
    setActionsUnderWay((underWay) => {
      const stillUnderWay = new Map(
        [...underWay].filter(([streamName, actionUnderWay]) => isStreamActionStillUnderWay(actionUnderWay, listingNamed(listedStreams, streamName))),
      );
      return stillUnderWay.size === underWay.size ? underWay : stillUnderWay;
    });
    setOutcomeWords((words) => {
      const stillListed = new Map([...words].filter(([streamName]) => listingNamed(listedStreams, streamName) !== null));
      return stillListed.size === words.size ? words : stillListed;
    });
  }, [listedStreams]);

  const runStreamAction = (streamAction: TatolabStreamActionName, chosenActionLabel: ChosenStreamActionLabel, stream: ListedStream): void => {
    setActionsUnderWay((underWay) => new Map(underWay).set(stream.name, { streamAction, listingWhenAsked: stream, isAnswered: false }));
    setOutcomeWords((words) => withoutKey(words, stream.name));
    backend.runStreamAction(streamAction, stream.name).then(
      (notice) => {
        if (notice !== null) setOutcomeWords((words) => new Map(words).set(stream.name, { kind: "notice", runtimeWords: notice }));
        setActionsUnderWay((underWay) => {
          const actionUnderWay = underWay.get(stream.name);
          if (actionUnderWay === undefined) return underWay;
          const answeredAction = { ...actionUnderWay, isAnswered: true };
          return isStreamActionStillUnderWay(answeredAction, listingNamed(latestListedStreams.current, stream.name))
            ? new Map(underWay).set(stream.name, answeredAction)
            : withoutKey(underWay, stream.name);
        });
      },
      (rejection: unknown) => {
        setOutcomeWords((words) =>
          new Map(words).set(stream.name, { kind: "refusal", chosenActionLabel, runtimeWords: describeBackendRejection(rejection) }),
        );
        setActionsUnderWay((underWay) => withoutKey(underWay, stream.name));
      },
    );
  };

  return { actionsUnderWay, outcomeWords, runStreamAction };
}

/** A stream's state in words, red with its icon when failed, the runtime's whole reason in its tooltip. */
export function StreamStateWord({ stream, isAfterAStopNotRecorded }: { stream: ListedStream; isAfterAStopNotRecorded: boolean }) {
  const statePresentation = isAfterAStopNotRecorded ? presentStreamStateAfterAStopNotRecorded(stream) : presentStreamState(stream);
  return (
    <span
      title={statePresentation.meaning}
      className={joinClassNames(
        "inline-flex min-w-0 items-center gap-1.5",
        statePresentation.emphasis === "failure" ? "text-danger-text" : statePresentation.emphasis === "quiet" ? "text-fg-3" : "text-fg-2",
      )}
    >
      {statePresentation.emphasis === "failure" && <SquareX className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
      {statePresentation.emphasis === "starting" && <LoaderCircle className="size-3.5 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />}
      <span className="truncate">{statePresentation.label}</span>
    </span>
  );
}

/** Always on or Dev session, with what it means and the runtime's own term in its tooltip. */
export function StreamRunModeWord({ stream }: { stream: ListedStream }) {
  const runMode = presentStreamRunMode(stream);
  if (runMode === null) return <span className="text-fg-3">—</span>;
  const RunModeIcon = runMode.runMode === "dev_session" ? RefreshCw : InfinityIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${runMode.label}: ${runMode.meaning} The runtime calls it ${runMode.runtimeTerm}.`}
            className={joinClassNames("inline-flex cursor-default items-center gap-1.5 rounded-sm", isStreamLoaded(stream) ? "text-fg-2" : "text-fg-3")}
          />
        }
      >
        <RunModeIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
        {runMode.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {runMode.meaning}
        <span className="mt-1 block font-mono text-2xs opacity-70">runtime: {runMode.runtimeTerm}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The runtime's refusal of a stream action, or its notice beside a stop it could not record, in its own words. */
export function StreamActionOutcomeLine({ outcome }: { outcome: StreamActionOutcomeWords }) {
  if (outcome.kind === "notice") {
    return (
      <p role="status" className="mt-1 flex max-w-[480px] gap-1.5 text-xs text-fg-2">
        <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
        <span className="select-text">
          <span className="text-warn-text">{STOP_NOT_RECORDED_LEAD} </span>
          {outcome.runtimeWords}
        </span>
      </p>
    );
  }
  return (
    <p role="alert" className="mt-1 flex max-w-[480px] gap-1.5 text-xs text-fg-2">
      <SquareX className="mt-px size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      <span className="select-text">
        <span className="text-danger-text">{streamActionRefusalLead(outcome.chosenActionLabel)} </span>
        {outcome.runtimeWords}
      </span>
    </p>
  );
}

/** The question before `remove_stream`; the stream it asks about stays until the dialog has finished closing. */
export function useStreamRemovalDialog(onRemove: (stream: ListedStream) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [streamAskedAbout, setStreamAskedAbout] = useState<ListedStream | null>(null);
  const confirmation = streamAskedAbout === null ? null : presentStreamRemovalConfirmation(streamAskedAbout);
  const askToRemove = (stream: ListedStream) => {
    setStreamAskedAbout(stream);
    setIsOpen(true);
  };
  const removalDialog = (
    <Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      onOpenChangeComplete={(hasOpened) => {
        if (!hasOpened) setStreamAskedAbout(null);
      }}
    >
      <DialogContent data-stream-removal-dialog="">
        {streamAskedAbout !== null && confirmation !== null && (
          <>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription>{confirmation.explanation}</DialogDescription>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" autoFocus />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                data-stream-action="confirm_remove_stream"
                onClick={() => {
                  onRemove(streamAskedAbout);
                  setIsOpen(false);
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
  return { askToRemove, removalDialog };
}

/** A terminal command in a well, with a button that copies it. */
export function CommandWithCopyButton({ command }: { command: string }) {
  const { wasCopied, copy } = useCopiedConfirmation(command);
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border bg-well pr-1 pl-3 font-mono">
      <span className="text-fg-3 select-none" aria-hidden>
        $
      </span>
      <span className="min-w-0 flex-1 truncate text-fg select-text">{command}</span>
      <Button
        variant="ghost"
        className="font-sans"
        onClick={copy}
      >
        <Copy aria-hidden /> {wasCopied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

