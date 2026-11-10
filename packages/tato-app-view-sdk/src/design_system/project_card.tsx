import { cn } from "cn";
import { Plus, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { MoreActionsMenu } from "./menus";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** The plain covers a project's card may wear, each a `--project-cover-<n>-*` token pair. */
export const PROJECT_COVER_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

/** Which of the plain covers a project's card wears. */
export type ProjectCoverNumber = (typeof PROJECT_COVER_NUMBERS)[number];

/** Each plain cover's colour and the colour of the initial drawn on it. */
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
  card: "h-42.5 w-full rounded-xl",
  thumbnail: "h-11.5 w-21 shrink-0 rounded-md text-base",
};

/** A card's cover lifts while its card is under the pointer, its menu is open, or its open button has the keyboard's focus. */
const PROJECT_CARD_COVER_LIFT_CLASS_NAMES =
  "transition-[transform,box-shadow,border-color] duration-150 ease-(--ease) group-hover/project:-translate-y-0.5 group-hover/project:border-line-strong group-hover/project:shadow-(--shadow-pop) group-has-[[data-popup-open]]/project:-translate-y-0.5 group-has-[[data-popup-open]]/project:shadow-(--shadow-pop) group-focus-visible/open:-translate-y-0.5 group-focus-visible/open:border-line-strong group-focus-visible/open:shadow-(--shadow-pop)";

/** The tile a plain cover draws its initial on, in the colour picked from the project's name, as the Project details panel draws it too. */
export function ProjectCoverInitialTile({ coverNumber, coverInitial }: { coverNumber: ProjectCoverNumber; coverInitial: string }) {
  return (
    <span aria-hidden className={cn("flex size-14 items-center justify-center rounded-2xl text-[22px] font-bold select-none", PROJECT_COVER_CLASS_NAMES[coverNumber])}>
      {coverInitial}
    </span>
  );
}

/**
 * A project's cover: the image chosen for it, or its plain cover, which on a card is the initial's tile on the well and in a list row the initial on
 * its colour.
 */
function ProjectCover({ coverNumber, coverInitial, coverImageUrl, size }: { coverNumber: ProjectCoverNumber; coverInitial: string; coverImageUrl: string | null; size: ProjectCoverSize }) {
  const isAPlainThumbnail = coverImageUrl === null && size === "thumbnail";
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center overflow-hidden border border-line font-semibold select-none",
        isAPlainThumbnail ? PROJECT_COVER_CLASS_NAMES[coverNumber] : "bg-well",
        PROJECT_COVER_SIZE_CLASS_NAMES[size],
        size === "card" && PROJECT_CARD_COVER_LIFT_CLASS_NAMES,
      )}
      data-project-cover={coverImageUrl === null ? "plain" : "image"}
    >
      {coverImageUrl !== null ? (
        <img src={coverImageUrl} alt="" draggable={false} className="size-full object-cover" />
      ) : size === "card" ? (
        <ProjectCoverInitialTile coverNumber={coverNumber} coverInitial={coverInitial} />
      ) : (
        coverInitial
      )}
    </span>
  );
}

/** How big a plain cover drawn outside the Projects window is: a module card's band, or a details panel's picture. */
type PlainCoverSize = "band" | "picture";

const PLAIN_COVER_SIZE_CLASS_NAMES: Record<PlainCoverSize, string> = {
  band: "h-20 w-full shrink-0 rounded-lg text-2xl",
  picture: "h-36 w-full shrink-0 rounded-xl text-4xl",
};

/** A plain cover: a ground in the colour picked from a name, with the name's initial on it. */
export function PlainCover({ coverNumber, coverInitial, size }: { coverNumber: ProjectCoverNumber; coverInitial: string; size: PlainCoverSize }) {
  return (
    <span aria-hidden className={cn("flex items-center justify-center overflow-hidden border border-line font-semibold select-none", PROJECT_COVER_CLASS_NAMES[coverNumber], PLAIN_COVER_SIZE_CLASS_NAMES[size])}>
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

/** What a project card or row shows of one project, and what pressing it and its ⋯ menu do. */
interface ProjectShown {
  readonly name: string;
  /** What the project is, or the words a project with none shows. */
  readonly description: string;
  /** Whether `description` is the project's own; a placeholder reads dimmed. */
  readonly hasADescription: boolean;
  /** Where the project is, as "~/streams/pattern", in the tooltip of its open button. */
  readonly folderWords: string;
  readonly coverNumber: ProjectCoverNumber;
  readonly coverInitial: string;
  /** The image chosen to show the project by, as a URL the window loads; `null` for its plain cover. */
  readonly coverImageUrl: string | null;
  readonly isUnreadable: boolean;
  readonly onOpened: () => void;
  /** The ⋯ menu's choices, as `MenuItem`s; it shows while the pointer is over the project, its menu is open or it holds the keyboard's focus. */
  readonly moreActions: ReactNode;
  /** The ⋯ button's name, as "Actions for pattern, ~/streams/pattern". */
  readonly moreActionsLabel: string;
  /** What is being done to the project while a change of it runs, as "Moving to Trash…"; it then neither opens nor offers its ⋯ menu. `null` when nothing is. */
  readonly pendingWords: string | null;
}

/** The ⋯ menu's place: out of sight until the project is under the pointer, holds the keyboard's focus, or has its menu open. */
const PROJECT_MORE_ACTIONS_CLASS_NAMES =
  "opacity-0 transition-opacity duration-150 group-hover/project:opacity-100 group-focus-within/project:opacity-100 group-has-[[data-popup-open]]/project:opacity-100";

/** The card's ⋯ menu rides its cover as the cover lifts. */
const PROJECT_CARD_MORE_ACTIONS_LIFT_CLASS_NAMES =
  "transition-[transform,opacity] group-hover/project:-translate-y-0.5 group-has-[[data-popup-open]]/project:-translate-y-0.5 group-has-[[data-project-open]:focus-visible]/project:-translate-y-0.5";

/** One project in the Projects window's grid: its cover, which lifts under the pointer, its name, what it is and when it was edited, and a ⋯ menu over its cover; pressing it opens it. */
export function ProjectCard({
  name,
  description,
  hasADescription,
  folderWords,
  when,
  coverNumber,
  coverInitial,
  coverImageUrl,
  isUnreadable,
  onOpened,
  moreActions,
  moreActionsLabel,
  pendingWords,
  ...controlDataAttributes
}: ProjectShown & {
  /** When it was last edited, as "Edited 2 hours ago". */
  when: string;
} & ControlDataAttributes) {
  return (
    <div className="group/project relative flex w-full min-w-0" aria-busy={pendingWords !== null} {...controlDataAttributes}>
      <button
        type="button"
        onClick={onOpened}
        disabled={pendingWords !== null}
        title={folderWords}
        className={cn("group/open flex w-full min-w-0 flex-col gap-1.5 rounded-xl text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
        data-project-open=""
      >
        <ProjectCover coverNumber={coverNumber} coverInitial={coverInitial} coverImageUrl={coverImageUrl} size="card" />
        <span className="flex min-w-0 flex-col gap-1.5 pt-1">
          <ProjectName name={name} isUnreadable={isUnreadable} className="text-lg" />
          <span className={cn("line-clamp-2 min-h-9 text-studio", hasADescription ? "text-fg-2" : "text-fg-3")}>{description}</span>
          <span className="truncate text-xs text-fg-3" data-project-pending={pendingWords === null ? undefined : ""}>
            {pendingWords ?? when}
          </span>
        </span>
      </button>
      {pendingWords === null && (
        <div className={cn("absolute top-2.5 right-2.5", PROJECT_MORE_ACTIONS_CLASS_NAMES, PROJECT_CARD_MORE_ACTIONS_LIFT_CLASS_NAMES)}>
          <MoreActionsMenu label={moreActionsLabel} isOverAPicture data-project-more-actions="">
            {moreActions}
          </MoreActionsMenu>
        </div>
      )}
    </div>
  );
}

/**
 * The columns a Projects list's heading and its rows share: thumbnail, name, description, when it was edited, and its ⋯ menu; a list narrower than
 * its `projects` container's 2xl step leaves the description out.
 */
const PROJECT_LIST_COLUMNS_CLASS_NAMES = "grid grid-cols-[84px_minmax(0,1fr)_120px] items-center gap-4 px-3 @2xl/projects:grid-cols-[84px_minmax(0,220px)_minmax(0,1fr)_120px]";

/** The description column, left out of a narrow list. */
const PROJECT_LIST_DESCRIPTION_COLUMN_CLASS_NAMES = "hidden @2xl/projects:block";

/** The width of a list row's ⋯ menu, kept clear beside the heading too. */
const PROJECT_LIST_MORE_ACTIONS_WIDTH_CLASS_NAMES = "w-10 shrink-0";

/** The heading over a Projects list's rows, naming each column; the list's container is named `projects` (`@container/projects`). */
export function ProjectListHeading() {
  return (
    <div className="flex h-7.5 items-center border-b border-line text-2xs text-fg-3" aria-hidden>
      <div className={cn(PROJECT_LIST_COLUMNS_CLASS_NAMES, "flex-1")}>
        <span />
        <span>Name</span>
        <span className={PROJECT_LIST_DESCRIPTION_COLUMN_CLASS_NAMES}>Description</span>
        <span>Edited</span>
      </div>
      <span className={PROJECT_LIST_MORE_ACTIONS_WIDTH_CLASS_NAMES} />
    </div>
  );
}

/** One project in the Projects window's list: a thumbnail of its cover, its name, what it is and when it was edited, and a ⋯ menu; pressing it opens it. Its list draws the line under it. */
export function ProjectListRow({
  name,
  description,
  hasADescription,
  folderWords,
  when,
  coverNumber,
  coverInitial,
  coverImageUrl,
  isUnreadable,
  onOpened,
  moreActions,
  moreActionsLabel,
  pendingWords,
  ...controlDataAttributes
}: ProjectShown & {
  /** When it was last edited, as "2 hours ago". */
  when: string;
} & ControlDataAttributes) {
  return (
    <div className="group/project flex w-full min-w-0 items-center rounded-lg hover:bg-hover has-[[data-popup-open]]:bg-hover" aria-busy={pendingWords !== null} {...controlDataAttributes}>
      <button
        type="button"
        onClick={onOpened}
        disabled={pendingWords !== null}
        title={folderWords}
        className={cn(PROJECT_LIST_COLUMNS_CLASS_NAMES, "h-15 min-w-0 flex-1 rounded-lg text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
        data-project-open=""
      >
        <ProjectCover coverNumber={coverNumber} coverInitial={coverInitial} coverImageUrl={coverImageUrl} size="thumbnail" />
        <ProjectName name={name} isUnreadable={isUnreadable} className="text-base" />
        <span className={cn("truncate text-studio", PROJECT_LIST_DESCRIPTION_COLUMN_CLASS_NAMES, hasADescription ? "text-fg-2" : "text-fg-3")}>{description}</span>
        <span className="truncate text-xs text-fg-3" data-project-pending={pendingWords === null ? undefined : ""}>
          {pendingWords ?? when}
        </span>
      </button>
      <div className={cn("flex justify-center", PROJECT_LIST_MORE_ACTIONS_WIDTH_CLASS_NAMES, PROJECT_MORE_ACTIONS_CLASS_NAMES)}>
        {pendingWords === null && (
          <MoreActionsMenu label={moreActionsLabel} data-project-more-actions="">
            {moreActions}
          </MoreActionsMenu>
        )}
      </div>
    </div>
  );
}

/** The last place in the Projects window's grid: a dashed cover that starts a new project. */
export function NewProjectCard({ onPressed, ...controlDataAttributes }: { onPressed: () => void } & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onPressed}
      className={cn("group/project flex w-full min-w-0 flex-col rounded-xl text-left outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      {...controlDataAttributes}
    >
      <span
        className={cn(
          "flex items-center justify-center gap-1.5 border border-dashed border-line-strong bg-well text-sm text-fg-3 transition-colors duration-150 group-hover/project:border-fg-3 group-hover/project:text-fg-2",
          PROJECT_COVER_SIZE_CLASS_NAMES.card,
        )}
      >
        <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
        New project
      </span>
    </button>
  );
}

/** The cover the Project details panel shows: the chosen image or the plain cover's tile on the well, with what changes it laid over its corner. */
export function ProjectDetailsCover({
  coverNumber,
  coverInitial,
  coverImageUrl,
  coverActions,
}: {
  coverNumber: ProjectCoverNumber;
  coverInitial: string;
  coverImageUrl: string | null;
  /** The buttons that choose or remove the image, as `ProjectDetailsCoverAction`s. */
  coverActions: ReactNode;
}) {
  return (
    <div className="relative flex h-45 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-well" data-project-cover={coverImageUrl === null ? "plain" : "image"}>
      {coverImageUrl === null ? (
        <ProjectCoverInitialTile coverNumber={coverNumber} coverInitial={coverInitial} />
      ) : (
        <img src={coverImageUrl} alt="" draggable={false} className="size-full object-cover" />
      )}
      <div className="absolute right-2.5 bottom-2.5 flex gap-1.5">{coverActions}</div>
    </div>
  );
}

/** One button laid over the Project details panel's cover, as Choose image…; it reads its words as pending while `isDisabled`. */
export function ProjectDetailsCoverAction({
  onPressed,
  isDisabled = false,
  children,
  ...controlDataAttributes
}: { onPressed: () => void; isDisabled?: boolean; children: ReactNode } & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onPressed}
      disabled={isDisabled}
      className={cn("h-7 rounded-md bg-window/85 px-2.5 text-xs text-fg outline-none hover:bg-window disabled:text-fg-3", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      {...controlDataAttributes}
    >
      {children}
    </button>
  );
}
