import { useEffect, useRef, useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";
import { listedStreamProjectDirectory, streamActionRefusalLead, type StreamActionAskedByTheWindow, type StreamPrimaryActionPresentation } from "../presentation/stream_presentation";
import {
  isStreamActionStillUnderWay,
  presentProjectRemovalConfirmation,
  streamsOfTheProject,
  type StreamActionUnderWay,
} from "../presentation/streams_list_presentation";
import { ConfirmationDialog } from "../design_system/confirmation_dialog";
import { RefusalLine } from "../design_system/refusal_line";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The action a person chose on a row, by its word: Stop, Start, Retry or Remove project. */
export type ChosenStreamActionLabel = StreamPrimaryActionPresentation["label"] | "Remove project";

/** The runtime's refusal of a stream's last action, after the action the person chose. */
export interface StreamActionRefusalWords {
  chosenActionLabel: ChosenStreamActionLabel;
  runtimeWords: string;
}

function withoutKeys<Value>(entries: ReadonlyMap<string, Value>, keys: readonly string[]): ReadonlyMap<string, Value> {
  if (!keys.some((key) => entries.has(key))) return entries;
  const remainingEntries = new Map(entries);
  for (const key of keys) remainingEntries.delete(key);
  return remainingEntries;
}

function listingWithTheStreamId(listedStreams: readonly ListedStream[], streamId: string): ListedStream | null {
  return listedStreams.find((stream) => stream.stream === streamId) ?? null;
}

/** The stream actions being asked for on each stream and the runtime's last refusal of each, kept until the listing shows the outcome. */
export function useStreamActionsUnderWay(listedStreams: readonly ListedStream[]) {
  const { backend } = useTatolabWindowEnvironment();
  const [actionsUnderWay, setActionsUnderWay] = useState<ReadonlyMap<string, StreamActionUnderWay>>(new Map());
  const [refusalWords, setRefusalWords] = useState<ReadonlyMap<string, StreamActionRefusalWords>>(new Map());
  /** The listing as of the last render, for an answer that arrives after the status showing its outcome. */
  const latestListedStreams = useRef(listedStreams);

  useEffect(() => {
    latestListedStreams.current = listedStreams;
    setActionsUnderWay((underWay) => {
      const stillUnderWay = new Map(
        [...underWay].filter(([streamId, actionUnderWay]) => isStreamActionStillUnderWay(actionUnderWay, listingWithTheStreamId(listedStreams, streamId))),
      );
      return stillUnderWay.size === underWay.size ? underWay : stillUnderWay;
    });
    setRefusalWords((words) => {
      const stillListed = new Map([...words].filter(([streamId]) => listingWithTheStreamId(listedStreams, streamId) !== null));
      return stillListed.size === words.size ? words : stillListed;
    });
  }, [listedStreams]);

  const askTheRuntime = (
    streamAction: StreamActionAskedByTheWindow,
    chosenActionLabel: ChosenStreamActionLabel,
    streamsAskedAbout: readonly ListedStream[],
    queueTheAction: () => Promise<void>,
  ): void => {
    const streamIds = streamsAskedAbout.map((stream) => stream.stream);
    setActionsUnderWay((underWay) => {
      const askedFor = new Map(underWay);
      for (const stream of streamsAskedAbout) askedFor.set(stream.stream, { streamAction, listingWhenAsked: stream, isAnswered: false });
      return askedFor;
    });
    setRefusalWords((words) => withoutKeys(words, streamIds));
    queueTheAction().then(
      () => {
        setActionsUnderWay((underWay) => {
          const answered = new Map(underWay);
          for (const streamId of streamIds) {
            const actionUnderWay = underWay.get(streamId);
            if (actionUnderWay === undefined) continue;
            const answeredAction = { ...actionUnderWay, isAnswered: true };
            if (isStreamActionStillUnderWay(answeredAction, listingWithTheStreamId(latestListedStreams.current, streamId))) answered.set(streamId, answeredAction);
            else answered.delete(streamId);
          }
          return answered;
        });
      },
      (rejection: unknown) => {
        const runtimeWords = describeBackendRejection(rejection);
        setRefusalWords((words) => {
          const refused = new Map(words);
          for (const streamId of streamIds) refused.set(streamId, { chosenActionLabel, runtimeWords });
          return refused;
        });
        setActionsUnderWay((underWay) => withoutKeys(underWay, streamIds));
      },
    );
  };

  const runStreamAction = (streamAction: TatolabStreamActionName, chosenActionLabel: ChosenStreamActionLabel, stream: ListedStream): void =>
    askTheRuntime(streamAction, chosenActionLabel, [stream], () => backend.runStreamAction(streamAction, stream.stream));

  const removeProject = (projectDirectory: string, streamsOfThatProject: readonly ListedStream[]): void =>
    askTheRuntime("remove_project", "Remove project", streamsOfThatProject, () => backend.removeProject(projectDirectory));

  return { actionsUnderWay, refusalWords, runStreamAction, removeProject };
}

/** The runtime's refusal of a stream action, in its own words. */
export function StreamActionRefusalLine({ refusal }: { refusal: StreamActionRefusalWords }) {
  return <RefusalLine lead={streamActionRefusalLead(refusal.chosenActionLabel)} words={refusal.runtimeWords} />;
}

/**
 * The question before `remove_project`, naming the folder and every stream the listing holds from it; the project it
 * asks about stays until the dialog has finished closing. A stream an earlier runtime recorded names no folder, so it
 * offers no removal.
 */
export function useProjectRemovalDialog(listedStreams: readonly ListedStream[], onRemove: (projectDirectory: string, streamsOfThatProject: readonly ListedStream[]) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectAskedAbout, setProjectAskedAbout] = useState<{ projectDirectory: string; streams: readonly ListedStream[] } | null>(null);
  const confirmation = projectAskedAbout === null ? null : presentProjectRemovalConfirmation(projectAskedAbout.projectDirectory, projectAskedAbout.streams);
  const askToRemoveTheProjectOf = (stream: ListedStream) => {
    const projectDirectory = listedStreamProjectDirectory(stream);
    if (projectDirectory === null) return;
    setProjectAskedAbout({ projectDirectory, streams: streamsOfTheProject(listedStreams, projectDirectory) });
    setIsOpen(true);
  };
  const removalDialog = (
    <ConfirmationDialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onClosedCompletely={() => setProjectAskedAbout(null)}
      question={confirmation === null ? null : { ...confirmation, confirmWords: "Remove project" }}
      isDestructive
      onConfirmed={() => {
        if (projectAskedAbout !== null) onRemove(projectAskedAbout.projectDirectory, projectAskedAbout.streams);
        setIsOpen(false);
      }}
      confirmDataAttributes={{ "data-stream-action": "confirm_remove_project" }}
      data-project-removal-dialog=""
    />
  );
  return { askToRemoveTheProjectOf, removalDialog };
}
