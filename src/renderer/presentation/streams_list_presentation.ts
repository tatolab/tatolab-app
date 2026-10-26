import type { ListedStream, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";
import { abbreviateHomeDirectory } from "./stream_presentation";

/** Which streams the Streams list shows. */
export type StreamsListFilter = "all" | "running" | "stopped" | "failed";

/** The Streams list's filters, in the order the segmented control shows them. */
export const STREAMS_LIST_FILTERS: readonly { filter: StreamsListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "running", label: "Running" },
  { filter: "stopped", label: "Stopped" },
  { filter: "failed", label: "Failed" },
];

/** Whether `stream` is one `filter` shows: kept and attached streams count as Running. */
export function streamMatchesListFilter(stream: ListedStream, filter: StreamsListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return stream.state === "kept" || stream.state === "attached";
    case "stopped":
    case "failed":
      return stream.state === filter;
  }
}

/** Whether `stream`'s name or project folder holds `filterText`, ignoring case; blank text matches every stream. */
export function streamMatchesFilterText(stream: ListedStream, filterText: string): boolean {
  const wantedText = filterText.trim().toLowerCase();
  return wantedText === "" || `${stream.name}\n${stream.project_directory}`.toLowerCase().includes(wantedText);
}

/** A project folder in the sidebar: where it is, the name it shows under, and the streams added from it. */
export interface StreamProjectFolder {
  projectDirectory: string;
  folderName: string;
  streams: readonly ListedStream[];
}

function lastPathSegments(absolutePath: string, segmentCount: number): string {
  return absolutePath.split("/").filter((segment) => segment !== "").slice(-segmentCount).join("/");
}

/**
 * The listing's streams under the project folders they were added from, in the order the runtime lists them. A folder
 * shows under its own name, or under its parent's and its own where two folders share a name.
 */
export function streamProjectFoldersOf(streams: readonly ListedStream[]): StreamProjectFolder[] {
  const streamsOfEachDirectory = new Map<string, ListedStream[]>();
  for (const stream of streams) {
    const streamsOfThisDirectory = streamsOfEachDirectory.get(stream.project_directory);
    if (streamsOfThisDirectory === undefined) streamsOfEachDirectory.set(stream.project_directory, [stream]);
    else streamsOfThisDirectory.push(stream);
  }
  const directories = [...streamsOfEachDirectory.keys()];
  const directoryCountOfEachName = new Map<string, number>();
  for (const directory of directories) {
    const name = lastPathSegments(directory, 1);
    directoryCountOfEachName.set(name, (directoryCountOfEachName.get(name) ?? 0) + 1);
  }
  return directories.map((directory) => {
    const name = lastPathSegments(directory, 1);
    return {
      projectDirectory: directory,
      folderName: (directoryCountOfEachName.get(name) ?? 0) > 1 ? lastPathSegments(directory, 2) : name,
      streams: streamsOfEachDirectory.get(directory) ?? [],
    };
  });
}

/** What the dialog asking to remove a stream says. */
export interface StreamRemovalConfirmationPresentation {
  title: string;
  explanation: string;
}

/** The question before `remove_stream`, the one action that loses a stream. */
export function presentStreamRemovalConfirmation(stream: ListedStream): StreamRemovalConfirmationPresentation {
  return {
    title: `Remove ${stream.name}?`,
    explanation: `The runtime unloads it and forgets it, so it no longer loads when the runtime starts. Its project folder, ${abbreviateHomeDirectory(stream.project_directory)}, stays as it is.`,
  };
}

/** A stream action the window asked for, with the listing it saw when it asked and whether the runtime has answered. */
export interface StreamActionUnderWay {
  streamAction: TatolabStreamActionName;
  listingWhenAsked: ListedStream | null;
  isAnswered: boolean;
}

function sameListing(firstListing: ListedStream | null, secondListing: ListedStream | null): boolean {
  return JSON.stringify(firstListing) === JSON.stringify(secondListing);
}

/** Whether a row still shows its action as under way: until the runtime answers, then until the listing differs from the one seen when asking. */
export function isStreamActionStillUnderWay(actionUnderWay: StreamActionUnderWay, listingNow: ListedStream | null): boolean {
  return !actionUnderWay.isAnswered || sameListing(actionUnderWay.listingWhenAsked, listingNow);
}
