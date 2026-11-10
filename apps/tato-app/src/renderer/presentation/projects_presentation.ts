import type { RecentProject } from "../../shared/tatolab_backend_contract";
import { PROJECT_COVER_NUMBERS, type ProjectCoverNumber } from "@tatolab/tato-app-view-sdk/design_system/project_card";

/** One project card in the Projects window. */
export interface RecentProjectCardPresentation {
  folder: string;
  /** The project's name, or the folder's own name when the runtime names no project there now. */
  name: string;
  /** The folder, with the person's home as `~`, as the card's tooltip says where the project is. */
  folderWords: string;
  /** Its ⋯ button's name, as "Actions for pattern, ~/streams/pattern", so two projects of one name read apart. */
  moreActionsLabel: string;
  /** What the project is, or "No description yet". */
  descriptionWords: string;
  /** Whether the runtime serves a description; a card without one shows its placeholder dimmed. */
  hasADescription: boolean;
  /** When it was last edited, as "Edited 2 hours ago", or when it was last opened, as "Opened 2 hours ago", for a project with no edit yet. */
  whenWords: string;
  /** The same moment as a list's Edited column shows it: "2 hours ago" for an edit, "Opened 2 hours ago" for a project with no edit yet. */
  whenWordsInTheList: string;
  /** The runtime names no project in its folder now; it still opens, and the studio says why. */
  isUnreadable: boolean;
  /** The plain cover picked from the name, the same each time the name is the same. */
  coverNumber: ProjectCoverNumber;
  /** The name's first letter or digit, drawn on the plain cover; empty for a name with none. */
  coverInitial: string;
  /** Whether the project is shown by an image chosen for it, which the window reads apart, rather than by its plain cover. */
  hasAChosenCover: boolean;
  /** The description as the runtime serves it, empty for none, as the Project details panel edits it. */
  descriptionToEdit: string;
}

/** How the Projects window orders its projects: the most recently edited first, or by name. */
export type ProjectsOrder = "last_edited" | "name";

/** How the Projects window lays its projects out: cards in a grid, or rows in a list. */
export type ProjectsLayout = "grid" | "list";

/** The words each order is shown by, on the sort button and in its menu. */
const PROJECTS_ORDER_WORDS: Record<ProjectsOrder, string> = { last_edited: "Last edited", name: "Name" };

/** The words each layout is shown by, in the View menu and the View button's name. */
const PROJECTS_LAYOUT_WORDS: Record<ProjectsLayout, string> = { grid: "Grid", list: "List" };

/** The orders the Projects window's sort menu offers, in its order, with the words its button and menu show. */
export const PROJECTS_ORDERS: readonly { order: ProjectsOrder; words: string }[] = [
  { order: "last_edited", words: PROJECTS_ORDER_WORDS.last_edited },
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
export function coverInitialOfTheName(name: string): string {
  return (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toLocaleUpperCase("en");
}

/** A card with the moment it is ordered by: its last edit, or when it was opened for a project with no edit yet. */
interface CardWithItsMoment {
  card: RecentProjectCardPresentation;
  orderedAtMs: number;
}

/** The order `order` puts two cards in: the most recently edited first, or by name with the most recently edited first among equal names. */
function compareCardsIn(order: ProjectsOrder) {
  const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return (first: CardWithItsMoment, second: CardWithItsMoment): number => {
    const byLastEdited = second.orderedAtMs - first.orderedAtMs;
    if (order === "last_edited") return byLastEdited;
    return nameCollator.compare(first.card.name, second.card.name) || byLastEdited;
  };
}

function cardOfTheRecentProject(recentProject: RecentProject, wallClockNowMs: number): CardWithItsMoment {
  const name = recentProject.project_name ?? recentProject.folder.split("/").filter((segment) => segment !== "").at(-1) ?? recentProject.folder;
  const description = recentProject.project_description?.trim() ?? "";
  const lastEditedAtMs = recentProject.last_edited_at_wall_clock_ms;
  const openedWords = `Opened ${presentTimeSince(recentProject.last_opened_at_wall_clock_ms, wallClockNowMs)}`;
  const editedTimeWords = lastEditedAtMs === null ? null : presentTimeSince(lastEditedAtMs, wallClockNowMs);
  return {
    card: {
      folder: recentProject.folder,
      name,
      folderWords: folderUnderHome(recentProject.folder),
      moreActionsLabel: `Actions for ${name}, ${folderUnderHome(recentProject.folder)}`,
      descriptionWords: description === "" ? "No description yet" : description,
      hasADescription: description !== "",
      whenWords: editedTimeWords === null ? openedWords : `Edited ${editedTimeWords}`,
      whenWordsInTheList: editedTimeWords ?? openedWords,
      isUnreadable: recentProject.project_name === null,
      coverNumber: projectCoverNumberOfTheName(name),
      coverInitial: coverInitialOfTheName(name),
      hasAChosenCover: recentProject.has_a_chosen_cover,
      descriptionToEdit: recentProject.project_description ?? "",
    },
    orderedAtMs: lastEditedAtMs ?? recentProject.last_opened_at_wall_clock_ms,
  };
}

/** Whether `card` holds `searchedFor`, lower-cased, in its name, its folder or its description. */
function cardHoldsTheSearch(card: RecentProjectCardPresentation, searchedFor: string): boolean {
  if (searchedFor === "") return true;
  const searchedWords = [card.name, card.folderWords, card.hasADescription ? card.descriptionWords : ""];
  return searchedWords.some((words) => words.toLowerCase().includes(searchedFor));
}

/** The cards for `recentProjects` in `order`, narrowed to those whose name, folder or description holds the search text `searchText`. */
export function presentRecentProjectCards(
  recentProjects: readonly RecentProject[],
  wallClockNowMs: number,
  searchText: string,
  order: ProjectsOrder = "last_edited",
): RecentProjectCardPresentation[] {
  const searchedFor = searchText.trim().toLowerCase();
  return recentProjects
    .map((recentProject) => cardOfTheRecentProject(recentProject, wallClockNowMs))
    .filter(({ card }) => cardHoldsTheSearch(card, searchedFor))
    .sort(compareCardsIn(order))
    .map(({ card }) => card);
}

/** What the Projects window says when no card shows: no project opened yet, or none matching the search. */
export function presentProjectsWithNoCards(searchText: string): { title: string; explanation: string } {
  if (searchText.trim() !== "") return { title: "No project matches", explanation: `No recent project's name, folder or description holds “${searchText.trim()}”.` };
  return { title: "No projects yet", explanation: "Projects you create or open show here." };
}

/** The Projects window's chosen order and layout, as kept between launches. */
export interface ProjectsHomeChoices {
  order: ProjectsOrder;
  layout: ProjectsLayout;
}

/** What the Projects window opens on when nothing is kept: the most recently edited first, as cards. */
export const PROJECTS_HOME_CHOICES_AT_FIRST: ProjectsHomeChoices = { order: "last_edited", layout: "grid" };

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

/** What the Projects window asks before it deletes the project `name`: the question, what deleting does, and the button that does it. */
export function presentProjectDeletionQuestion(name: string): { title: string; explanation: string; confirmWords: string } {
  return {
    title: `Delete “${name}”?`,
    explanation: "Its streams stop, and Tato Studio moves its folder to the Trash, where you can put it back.",
    confirmWords: "Move to Trash",
  };
}

/** Why `name` cannot be a project's new name, or `null` when it can; a rename changes the name only, never the folder, so only a blank one is refused here. */
export function projectRenameRefusal(name: string): string | null {
  return name.trim() === "" ? "Give the project a name." : null;
}

/** A change the Projects window asked of a recent project. */
export type RecentProjectChange = "rename" | "duplicate" | "delete";

/** Why a change the Projects window asked of a recent project did not happen, in the words of whatever refused it. */
export interface RecentProjectChangeRefusal {
  asked_to: RecentProjectChange;
  because: string;
}

/** What a card says is being done to its project while a duplicate or a deletion of it runs. */
export function presentRecentProjectChangePendingWords(change: Exclude<RecentProjectChange, "rename">): string {
  return change === "duplicate" ? "Duplicating…" : "Moving to Trash…";
}

/** The words of the sheet that makes a project: New project's, or Import project's for the `.zip` at `archive`, which keeps the name it was saved with. */
export function presentNewProjectSheetWords(archive: string | null): {
  title: string;
  description: string;
  nameLabel: string;
  actionWords: string;
  pendingWords: string;
  refusalLead: string;
} {
  if (archive === null) {
    return {
      title: "New project",
      description: "Tato Studio makes a folder for the project, with a stream to start from.",
      nameLabel: "Name",
      actionWords: "Create",
      pendingWords: "Creating…",
      refusalLead: "The project wasn't created:",
    };
  }
  return {
    title: "Import project",
    description: `Tato Studio makes a project of its own from ${fileNameOfThePath(archive)}, in a new folder. It keeps the name it was saved with.`,
    nameLabel: "Folder name",
    actionWords: "Import",
    pendingWords: "Importing…",
    refusalLead: "The project wasn't imported:",
  };
}

function fileNameOfThePath(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

/** The name the Project details panel saves for `nameTyped`: `null` when it is the name the project has or the one just sent, so a name is saved once. */
export function projectNameToSave(nameTyped: string, nameTheProjectHas: string, nameLastSent: string | null): string | null {
  const trimmedName = nameTyped.trim();
  return trimmedName === nameTheProjectHas || trimmedName === nameLastSent ? null : nameTyped;
}

/** The description the Project details panel saves for `descriptionTyped`: `null` when it is the one the project has or the one just sent, so it is saved once. */
export function projectDescriptionToSave(descriptionTyped: string, descriptionTheProjectHas: string, descriptionLastSent: string | null): string | null {
  const trimmedDescription = descriptionTyped.trim();
  return trimmedDescription === descriptionTheProjectHas.trim() || trimmedDescription === descriptionLastSent?.trim() ? null : descriptionTyped;
}

/** The title of the notice that says a change the Projects window asked of a project did not happen. */
export function presentRecentProjectChangeRefusalTitle(askedTo: RecentProjectChange): string {
  const titles: Record<RecentProjectChange, string> = { rename: "The project wasn't renamed", duplicate: "The project wasn't duplicated", delete: "The project wasn't deleted" };
  return titles[askedTo];
}
