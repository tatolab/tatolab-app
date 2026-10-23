// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useRef, useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import { STOP_NOT_RECORDED_LEAD, streamActionRefusalLead, type StreamPrimaryActionPresentation } from "../presentation/stream_presentation";
import { isStreamActionStillUnderWay, presentStreamRemovalConfirmation, type StreamActionUnderWay } from "../presentation/streams_list_presentation";
import { ConfirmationDialog } from "../design_system/confirmation_dialog";
import { CopyWordsButton } from "../design_system/copy_words_button";
import { RefusalLine } from "../design_system/refusal_line";
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

/** The runtime's refusal of a stream action, or its notice beside a stop it could not record, in its own words. */
export function StreamActionOutcomeLine({ outcome }: { outcome: StreamActionOutcomeWords }) {
  if (outcome.kind === "notice") return <RefusalLine tone="warning" lead={STOP_NOT_RECORDED_LEAD} words={outcome.runtimeWords} />;
  return <RefusalLine lead={streamActionRefusalLead(outcome.chosenActionLabel)} words={outcome.runtimeWords} />;
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
    <ConfirmationDialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onClosedCompletely={() => setStreamAskedAbout(null)}
      question={confirmation === null ? null : { ...confirmation, confirmWords: "Remove" }}
      isDestructive
      onConfirmed={() => {
        if (streamAskedAbout !== null) onRemove(streamAskedAbout);
        setIsOpen(false);
      }}
      confirmDataAttributes={{ "data-stream-action": "confirm_remove_stream" }}
      data-stream-removal-dialog=""
    />
  );
  return { askToRemove, removalDialog };
}

/** A terminal command in a well, with a button that copies it. */
export function CommandWithCopyButton({ command }: { command: string }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border bg-well pr-1 pl-3 font-mono">
      <span className="text-fg-3 select-none" aria-hidden>
        $
      </span>
      <span className="min-w-0 flex-1 truncate text-fg select-text">{command}</span>
      <span className="font-sans">
        <CopyWordsButton appearance="quiet" readTextToCopy={() => command} />
      </span>
    </div>
  );
}
