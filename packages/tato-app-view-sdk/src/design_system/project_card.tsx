import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** The plain covers a project's card may wear, each a `--project-cover-<n>-*` token pair. */
export const PROJECT_COVER_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

/** Which of the plain covers a project's card wears. */
export type ProjectCoverNumber = (typeof PROJECT_COVER_NUMBERS)[number];

/** Each plain cover's ground and the colour of the initial drawn on it. */
const PROJECT_COVER_CLASS_NAMES: Record<ProjectCoverNumber, string> = {
  1: "bg-project-cover-1-ground text-project-cover-1-mark",
  2: "bg-project-cover-2-ground text-project-cover-2-mark",
  3: "bg-project-cover-3-ground text-project-cover-3-mark",
  4: "bg-project-cover-4-ground text-project-cover-4-mark",
  5: "bg-project-cover-5-ground text-project-cover-5-mark",
  6: "bg-project-cover-6-ground text-project-cover-6-mark",
};

/** How big a project's cover is drawn: the full width of a card, or a list row's thumbnail. */
type ProjectCoverSize = "card" | "thumbnail";

const PROJECT_COVER_SIZE_CLASS_NAMES: Record<ProjectCoverSize, string> = {
  card: "aspect-16/10 w-full rounded-xl text-3xl",
  thumbnail: "h-11 w-20 shrink-0 rounded-md text-base",
};

/** A project's plain cover: a ground in the colour picked from its name, with the name's initial on it. */
function ProjectCover({ coverNumber, coverInitial, size }: { coverNumber: ProjectCoverNumber; coverInitial: string; size: ProjectCoverSize }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center overflow-hidden border border-line font-semibold select-none",
        PROJECT_COVER_CLASS_NAMES[coverNumber],
        PROJECT_COVER_SIZE_CLASS_NAMES[size],
        size === "card" && "transition-[transform,box-shadow,border-color] duration-150 ease-(--ease) group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-(--shadow-pop) group-focus-visible:-translate-y-0.5 group-focus-visible:border-line-strong group-focus-visible:shadow-(--shadow-pop)",
      )}
    >
      {coverInitial}
    </span>
  );
}

/** A project's name, marked when the runtime names no project in its folder now. */
function ProjectName({ name, isUnreadable, className }: { name: string; isUnreadable: boolean; className: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 font-semibold text-fg", className)}>
      {isUnreadable && <TriangleAlert className="size-3.5 shrink-0 text-warn-text" strokeWidth={1.75} aria-label="Doesn't read now" />}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** What a project card or row shows of one project, and what pressing it does. */
interface ProjectShown {
  readonly name: string;
  readonly coverNumber: ProjectCoverNumber;
  readonly coverInitial: string;
  readonly isUnreadable: boolean;
  readonly onOpened: () => void;
}

/** One project in the Projects window's grid: its cover, which lifts under the pointer, its name, and a line on where it is and when it was opened; pressing it opens it. */
export function ProjectCard({
  name,
  detail,
  coverNumber,
  coverInitial,
  isUnreadable,
  onOpened,
  ...controlDataAttributes
}: ProjectShown & {
  /** The card's second line, as "~/streams/pattern · Opened 2 hours ago". */
  detail: string;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onOpened}
      className={cn("group flex w-full min-w-0 flex-col gap-2.5 rounded-xl text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      {...controlDataAttributes}
    >
      <ProjectCover coverNumber={coverNumber} coverInitial={coverInitial} size="card" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <ProjectName name={name} isUnreadable={isUnreadable} className="text-base" />
        <span className="truncate text-xs text-fg-3">{detail}</span>
      </span>
    </button>
  );
}

/** The columns a Projects list's heading and its rows share: thumbnail, name, folder and when it was opened. */
const PROJECT_LIST_COLUMNS_CLASS_NAMES = "grid grid-cols-[80px_minmax(0,14rem)_minmax(0,1fr)_8rem] items-center gap-4 px-3";

/** The heading over a Projects list's rows, naming each column. */
export function ProjectListHeading() {
  return (
    <div className={cn(PROJECT_LIST_COLUMNS_CLASS_NAMES, "h-7.5 border-b border-line text-2xs text-fg-3")} aria-hidden>
      <span />
      <span>Name</span>
      <span>Folder</span>
      <span>Opened</span>
    </div>
  );
}

/** One project in the Projects window's list: a thumbnail of its cover, its name, its folder and when it was opened; pressing it opens it. Its list draws the line under it. */
export function ProjectListRow({
  name,
  folderWords,
  lastOpenedWords,
  coverNumber,
  coverInitial,
  isUnreadable,
  onOpened,
  ...controlDataAttributes
}: ProjectShown & {
  /** Where the project is, as "~/streams/pattern". */
  folderWords: string;
  /** When it was last opened, as "2 hours ago". */
  lastOpenedWords: string;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onOpened}
      className={cn(
        PROJECT_LIST_COLUMNS_CLASS_NAMES,
        "h-15 w-full rounded-lg text-left outline-none hover:bg-hover",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
      )}
      {...controlDataAttributes}
    >
      <ProjectCover coverNumber={coverNumber} coverInitial={coverInitial} size="thumbnail" />
      <ProjectName name={name} isUnreadable={isUnreadable} className="text-base" />
      <span className="truncate text-sm text-fg-2">{folderWords}</span>
      <span className="truncate text-xs text-fg-3">{lastOpenedWords}</span>
    </button>
  );
}
