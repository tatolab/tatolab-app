import type { RecentProject } from "../../shared/tatolab_backend_contract";
import type { ListedStreamsReading } from "../view_host/studio_view_contract";

/** One project card in the Projects window. */
export interface RecentProjectCardPresentation {
  folder: string;
  /** The project's name, or the folder's own name when its `pyproject.toml` doesn't read now. */
  name: string;
  /** When it was last opened, as "2 hours ago". */
  lastOpenedWords: string;
  /** The folder, as the card's second line says where the project is. */
  folderWords: string;
  isRunning: boolean;
  /** Its folder or its `pyproject.toml` doesn't read now; it still opens, and the studio says why. */
  isUnreadable: boolean;
}

const MILLISECONDS_IN_A_MINUTE = 60_000;
const RELATIVE_TIME_STEPS: readonly { unit: Intl.RelativeTimeFormatUnit; milliseconds: number }[] = [
  { unit: "year", milliseconds: 365 * 24 * 60 * MILLISECONDS_IN_A_MINUTE },
  { unit: "month", milliseconds: 30 * 24 * 60 * MILLISECONDS_IN_A_MINUTE },
  { unit: "week", milliseconds: 7 * 24 * 60 * MILLISECONDS_IN_A_MINUTE },
  { unit: "day", milliseconds: 24 * 60 * MILLISECONDS_IN_A_MINUTE },
  { unit: "hour", milliseconds: 60 * MILLISECONDS_IN_A_MINUTE },
  { unit: "minute", milliseconds: MILLISECONDS_IN_A_MINUTE },
];

/** How long before `wallClockNowMs` the moment `thenMs` was, in words, as "2 hours ago", "yesterday" or "just now". */
export function presentTimeSince(thenMs: number, wallClockNowMs: number): string {
  const elapsedMs = Math.max(0, wallClockNowMs - thenMs);
  const step = RELATIVE_TIME_STEPS.find(({ milliseconds }) => elapsedMs >= milliseconds);
  if (step === undefined) return "just now";
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.floor(elapsedMs / step.milliseconds), step.unit);
}

/** `folder` with the person's home written as `~`, as a card shows where a project is. */
function folderUnderHome(folder: string): string {
  return folder.replace(/^\/(Users|home)\/[^/]+/, "~");
}

/** Whether the runtime lists a stream of the project in `folder` running or on its way to running. */
function isAStreamOfTheProjectRunning(listedStreams: ListedStreamsReading, folder: string): boolean {
  if (listedStreams.kind !== "listed") return false;
  return listedStreams.streams.some((listing) => listing.location?.project_directory === folder && (listing.state === "running" || listing.state === "preparing"));
}

/** The cards for `recentProjects`, recent first, narrowed to those whose name or folder holds the search text `searchText`. */
export function presentRecentProjectCards(
  recentProjects: readonly RecentProject[],
  listedStreams: ListedStreamsReading,
  wallClockNowMs: number,
  searchText: string,
): RecentProjectCardPresentation[] {
  const searchedFor = searchText.trim().toLowerCase();
  return recentProjects
    .map(
      (recentProject): RecentProjectCardPresentation => ({
        folder: recentProject.folder,
        name: recentProject.project_name ?? recentProject.folder.split("/").filter((segment) => segment !== "").at(-1) ?? recentProject.folder,
        lastOpenedWords: presentTimeSince(recentProject.last_opened_at_wall_clock_ms, wallClockNowMs),
        folderWords: folderUnderHome(recentProject.folder),
        isRunning: isAStreamOfTheProjectRunning(listedStreams, recentProject.folder),
        isUnreadable: recentProject.project_name === null,
      }),
    )
    .filter((card) => searchedFor === "" || card.name.toLowerCase().includes(searchedFor) || card.folderWords.toLowerCase().includes(searchedFor));
}

/** The Projects window's lead before why the runtime's streams could not be listed. */
export const STREAMS_NOT_LISTED_LEAD = "The runtime's streams could not be listed:";

/** What the Projects window says when no card shows: why the streams could not be listed, none matching the search, or no project opened yet. */
export function presentProjectsWithNoCards(searchText: string, listedStreams: ListedStreamsReading): { title: string; explanation: string; isFailure: boolean } {
  if (listedStreams.kind === "listing_failed") return { title: "The runtime's streams could not be listed", explanation: listedStreams.because, isFailure: true };
  if (searchText.trim() !== "") return { title: "No project matches", explanation: `Nothing recent is named like “${searchText.trim()}”.`, isFailure: false };
  return { title: "No projects yet", explanation: "Projects you create or open show here.", isFailure: false };
}
