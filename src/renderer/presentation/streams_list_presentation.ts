import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { abbreviateHomeDirectory, listedStreamProjectDirectory, type StreamActionAskedByTheWindow } from "./stream_presentation";

/** Which streams the Streams list shows. */
export type StreamsListFilter = "all" | "running" | "stopped" | "failed";

/** The Streams list's filters, in the order the segmented control shows them. */
export const STREAMS_LIST_FILTERS: readonly { filter: StreamsListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "running", label: "Running" },
  { filter: "stopped", label: "Stopped" },
  { filter: "failed", label: "Failed" },
];

/** What the state filter's field says while `filter` is chosen. */
export function streamsListFilterWords(filter: StreamsListFilter): string {
  return filter === "all" ? "Any state" : (STREAMS_LIST_FILTERS.find((listFilter) => listFilter.filter === filter)?.label ?? "Any state");
}

/** Whether `stream` is one `filter` shows; a stream preparing or stopping shows under every filter, so its row stays put while its action runs. */
export function streamMatchesListFilter(stream: ListedStream, filter: StreamsListFilter): boolean {
  return stream.state === "preparing" || stream.state === "stopping" || streamIsInListFilterState(stream, filter);
}

/** Whether `stream`'s own state is the one `filter` names, which is what the filter counts; a stream preparing or stopping counts only under All. */
export function streamIsInListFilterState(stream: ListedStream, filter: StreamsListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
    case "stopped":
    case "failed":
      return stream.state === filter;
  }
}

/** Whether `stream`'s display name or project folder holds `filterText`, ignoring case; blank text matches every stream. */
export function streamMatchesFilterText(stream: ListedStream, filterText: string): boolean {
  const wantedText = filterText.trim().toLowerCase();
  return wantedText === "" || `${stream.display_name}\n${listedStreamProjectDirectory(stream) ?? ""}`.toLowerCase().includes(wantedText);
}

/** What the folder of the records an earlier runtime wrote, which name no project folder, shows under. */
export const STREAMS_OF_AN_EARLIER_RUNTIME_FOLDER_NAME = "From an earlier runtime";

/** A project folder in the sidebar: where it is, the name it shows under, and the streams added from it. */
export interface StreamProjectFolder {
  /** `null` for the records an earlier runtime wrote, which name no project folder. */
  projectDirectory: string | null;
  folderName: string;
  streams: readonly ListedStream[];
  /** Whether a stream added from it failed, which its row says while it is closed. */
  holdsAFailedStream: boolean;
}

function lastPathSegments(absolutePath: string, segmentCount: number): string {
  return absolutePath.split("/").filter((segment) => segment !== "").slice(-segmentCount).join("/");
}

/**
 * The listing's streams under the project folders they were added from, in the order the runtime lists them. A folder
 * shows under its own name, or under its parent's and its own where two folders share a name.
 */
export function streamProjectFoldersOf(streams: readonly ListedStream[]): StreamProjectFolder[] {
  const streamsOfEachDirectory = new Map<string | null, ListedStream[]>();
  for (const stream of streams) {
    const projectDirectory = listedStreamProjectDirectory(stream);
    const streamsOfThisDirectory = streamsOfEachDirectory.get(projectDirectory);
    if (streamsOfThisDirectory === undefined) streamsOfEachDirectory.set(projectDirectory, [stream]);
    else streamsOfThisDirectory.push(stream);
  }
  const directories = [...streamsOfEachDirectory.keys()];
  const directoryCountOfEachName = new Map<string, number>();
  for (const directory of directories) {
    if (directory === null) continue;
    const name = lastPathSegments(directory, 1);
    directoryCountOfEachName.set(name, (directoryCountOfEachName.get(name) ?? 0) + 1);
  }
  const folderNameOf = (directory: string | null): string => {
    if (directory === null) return STREAMS_OF_AN_EARLIER_RUNTIME_FOLDER_NAME;
    const name = lastPathSegments(directory, 1);
    return (directoryCountOfEachName.get(name) ?? 0) > 1 ? lastPathSegments(directory, 2) : name;
  };
  return directories.map((directory) => {
    const streamsOfThisDirectory = streamsOfEachDirectory.get(directory) ?? [];
    return {
      projectDirectory: directory,
      folderName: folderNameOf(directory),
      streams: streamsOfThisDirectory,
      holdsAFailedStream: streamsOfThisDirectory.some((stream) => stream.state === "failed"),
    };
  });
}

/** What the dialog asking to remove a project says. */
export interface ProjectRemovalConfirmationPresentation {
  title: string;
  explanation: string;
}

/** The streams the listing holds from `projectDirectory`, in the order it lists them. */
export function streamsOfTheProject(listedStreams: readonly ListedStream[], projectDirectory: string): ListedStream[] {
  return listedStreams.filter((stream) => listedStreamProjectDirectory(stream) === projectDirectory);
}

function namesInASentence(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** The question before `remove_project`, the one action that loses a project's streams: the folder, and every stream the listing holds from it. */
export function presentProjectRemovalConfirmation(projectDirectory: string, streamsOfThatProject: readonly ListedStream[]): ProjectRemovalConfirmationPresentation {
  const folderShown = abbreviateHomeDirectory(projectDirectory);
  const streamNames = namesInASentence(streamsOfThatProject.map((stream) => stream.display_name));
  const whatTheRuntimeForgets =
    streamsOfThatProject.length === 1 ? `its stream ${streamNames}, so it no longer loads` : `its ${streamsOfThatProject.length} streams, ${streamNames}, so they no longer load`;
  return {
    title: `Remove the project ${lastSegmentOf(projectDirectory)}?`,
    explanation: `The runtime stops and forgets ${whatTheRuntimeForgets} when the runtime starts. The folder ${folderShown} and its log stay as they are.`,
  };
}

function lastSegmentOf(absolutePath: string): string {
  return lastPathSegments(absolutePath, 1);
}

/** A stream action the window asked for, with the listing it saw when it asked and whether the runtime has answered. */
export interface StreamActionUnderWay {
  streamAction: StreamActionAskedByTheWindow;
  listingWhenAsked: ListedStream | null;
  isAnswered: boolean;
}

function sameListing(firstListing: ListedStream | null, secondListing: ListedStream | null): boolean {
  return JSON.stringify(firstListing) === JSON.stringify(secondListing);
}

/**
 * Whether a row still shows its action as under way: until the runtime answers, then until the listing differs from the
 * one seen when asking; a cancel until the listing no longer names the action it cancelled.
 */
export function isStreamActionStillUnderWay(actionUnderWay: StreamActionUnderWay, listingNow: ListedStream | null): boolean {
  if (!actionUnderWay.isAnswered) return true;
  if (actionUnderWay.streamAction !== "cancel_stream_action") return sameListing(actionUnderWay.listingWhenAsked, listingNow);
  const cancelledAction = actionUnderWay.listingWhenAsked?.action ?? null;
  return cancelledAction !== null && listingNow?.action === cancelledAction;
}
