import type { RecentProject } from "../../shared/tatolab_backend_contract";
import { PROJECT_COVER_NUMBERS, type ProjectCoverNumber } from "@tatolab/tato-app-view-sdk/design_system/project_card";

/** One project card in the Projects window. */
export interface RecentProjectCardPresentation {
  folder: string;
  /** The project's name, or the folder's own name when the runtime names no project there now. */
  name: string;
  /** When it was last opened, as "2 hours ago". */
  lastOpenedWords: string;
  /** The folder, as the card's second line says where the project is. */
  folderWords: string;
  /** The card's second line: where the project is and when it was opened, as "~/streams/pattern · Opened 2 hours ago". */
  detailWords: string;
  /** The runtime names no project in its folder now; it still opens, and the studio says why. */
  isUnreadable: boolean;
  /** The plain cover picked from the name, the same each time the name is the same. */
  coverNumber: ProjectCoverNumber;
  /** The name's first letter or digit, drawn on the plain cover; empty for a name with none. */
  coverInitial: string;
}

/** How the Projects window orders its projects: the most recently opened first, or by name. */
export type ProjectsOrder = "last_opened" | "name";

/** How the Projects window lays its projects out: cards in a grid, or rows in a list. */
export type ProjectsLayout = "grid" | "list";

/** The words each order is shown by, on the sort button and in its menu. */
const PROJECTS_ORDER_WORDS: Record<ProjectsOrder, string> = { last_opened: "Last opened", name: "Name" };

/** The words each layout is shown by, in the View menu and the View button's name. */
const PROJECTS_LAYOUT_WORDS: Record<ProjectsLayout, string> = { grid: "Grid", list: "List" };

/** The orders the Projects window's sort menu offers, in its order, with the words its button and menu show. */
export const PROJECTS_ORDERS: readonly { order: ProjectsOrder; words: string }[] = [
  { order: "last_opened", words: PROJECTS_ORDER_WORDS.last_opened },
  { order: "name", words: PROJECTS_ORDER_WORDS.name },
];

/** The layouts the Projects window's View menu offers, in its order, with the words its menu shows. */
export const PROJECTS_LAYOUTS: readonly { layout: ProjectsLayout; words: string }[] = [
  { layout: "grid", words: PROJECTS_LAYOUT_WORDS.grid },
  { layout: "list", words: PROJECTS_LAYOUT_WORDS.list },
];

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

/** The plain cover `name` wears: its characters summed into one of the covers, so a project keeps its cover while its name stays. */
export function projectCoverNumberOfTheName(name: string): ProjectCoverNumber {
  let characterCodeSum = 0;
  for (const character of name.trim().toLowerCase()) characterCodeSum += character.codePointAt(0) ?? 0;
  return PROJECT_COVER_NUMBERS[characterCodeSum % PROJECT_COVER_NUMBERS.length] ?? PROJECT_COVER_NUMBERS[0];
}

/** The first letter or digit of `name`, upper-cased, for its plain cover; empty when it holds none. */
function coverInitialOfTheName(name: string): string {
  return (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toLocaleUpperCase("en");
}

/** The order `order` puts two cards in: the most recently opened first, or by name with the most recently opened first among equal names. */
function compareCardsIn(order: ProjectsOrder) {
  const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return (
    first: { card: RecentProjectCardPresentation; openedAtMs: number },
    second: { card: RecentProjectCardPresentation; openedAtMs: number },
  ): number => {
    const byLastOpened = second.openedAtMs - first.openedAtMs;
    if (order === "last_opened") return byLastOpened;
    return nameCollator.compare(first.card.name, second.card.name) || byLastOpened;
  };
}

/** The cards for `recentProjects` in `order`, narrowed to those whose name or folder holds the search text `searchText`. */
export function presentRecentProjectCards(
  recentProjects: readonly RecentProject[],
  wallClockNowMs: number,
  searchText: string,
  order: ProjectsOrder = "last_opened",
): RecentProjectCardPresentation[] {
  const searchedFor = searchText.trim().toLowerCase();
  return recentProjects
    .map((recentProject) => {
      const name = recentProject.project_name ?? recentProject.folder.split("/").filter((segment) => segment !== "").at(-1) ?? recentProject.folder;
      const lastOpenedWords = presentTimeSince(recentProject.last_opened_at_wall_clock_ms, wallClockNowMs);
      const folderWords = folderUnderHome(recentProject.folder);
      const card: RecentProjectCardPresentation = {
        folder: recentProject.folder,
        name,
        lastOpenedWords,
        folderWords,
        detailWords: `${folderWords} · Opened ${lastOpenedWords}`,
        isUnreadable: recentProject.project_name === null,
        coverNumber: projectCoverNumberOfTheName(name),
        coverInitial: coverInitialOfTheName(name),
      };
      return { card, openedAtMs: recentProject.last_opened_at_wall_clock_ms };
    })
    .filter(({ card }) => searchedFor === "" || card.name.toLowerCase().includes(searchedFor) || card.folderWords.toLowerCase().includes(searchedFor))
    .sort(compareCardsIn(order))
    .map(({ card }) => card);
}

/** What the Projects window says when no card shows: no project opened yet, or none matching the search. */
export function presentProjectsWithNoCards(searchText: string): { title: string; explanation: string } {
  if (searchText.trim() !== "") return { title: "No project matches", explanation: `Nothing recent is named like “${searchText.trim()}”.` };
  return { title: "No projects yet", explanation: "Projects you create or open show here." };
}

/** The Projects window's chosen order and layout, as kept between launches. */
export interface ProjectsHomeChoices {
  order: ProjectsOrder;
  layout: ProjectsLayout;
}

/** What the Projects window opens on when nothing is kept: the most recently opened first, as cards. */
export const PROJECTS_HOME_CHOICES_AT_FIRST: ProjectsHomeChoices = { order: "last_opened", layout: "grid" };

/** The choices `kept` holds, each one that is missing or unknown read as the first choice. */
export function projectsHomeChoicesFromKept(kept: unknown): ProjectsHomeChoices {
  if (typeof kept !== "object" || kept === null) return PROJECTS_HOME_CHOICES_AT_FIRST;
  const keptOrder: unknown = Reflect.get(kept, "order");
  const keptLayout: unknown = Reflect.get(kept, "layout");
  return {
    order: PROJECTS_ORDERS.find(({ order }) => order === keptOrder)?.order ?? PROJECTS_HOME_CHOICES_AT_FIRST.order,
    layout: PROJECTS_LAYOUTS.find(({ layout }) => layout === keptLayout)?.layout ?? PROJECTS_HOME_CHOICES_AT_FIRST.layout,
  };
}

/** What the Projects window's sort and View buttons show and are named for the chosen order and layout. */
export function presentProjectsHomeChoices(projectsHomeChoices: ProjectsHomeChoices): { sortWords: string; sortButtonLabel: string; viewButtonLabel: string } {
  const sortWords = PROJECTS_ORDER_WORDS[projectsHomeChoices.order];
  return { sortWords, sortButtonLabel: `Sort: ${sortWords}`, viewButtonLabel: `View: ${PROJECTS_LAYOUT_WORDS[projectsHomeChoices.layout]}` };
}
