import type { RecentProject } from "../../shared/tatolab_backend_contract";

/** One project card in the Projects window. */
export interface RecentProjectCardPresentation {
  folder: string;
  /** The project's name, or the folder's own name when its `pyproject.toml` doesn't read now. */
  name: string;
  /** When it was last opened, as "2 hours ago". */
  lastOpenedWords: string;
  /** The folder, as the card's second line says where the project is. */
  folderWords: string;
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

/** The cards for `recentProjects`, recent first, narrowed to those whose name or folder holds the search text `searchText`. */
export function presentRecentProjectCards(
  recentProjects: readonly RecentProject[],
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
        isUnreadable: recentProject.project_name === null,
      }),
    )
    .filter((card) => searchedFor === "" || card.name.toLowerCase().includes(searchedFor) || card.folderWords.toLowerCase().includes(searchedFor));
}

/** What the Projects window says when no card shows: no project opened yet, or none matching the search. */
export function presentProjectsWithNoCards(searchText: string): { title: string; explanation: string } {
  if (searchText.trim() !== "") return { title: "No project matches", explanation: `Nothing recent is named like “${searchText.trim()}”.` };
  return { title: "No projects yet", explanation: "Projects you create or open show here." };
}
