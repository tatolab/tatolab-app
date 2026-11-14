import { ArrowLeft, Box, Check, ChevronLeft, ChevronRight, Copy, Download, FileArchive, FolderPlus, RefreshCw, Trash2, TriangleAlert, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type {
  ChosenProjectFolder,
  DependencySourceKind,
  OpenProjectReading,
  PackageCatalogMember,
  PackageCatalogReading,
  ProjectDependency,
  TatolabPlatform,
  ViewsOfAWorkspaceDependency,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
} from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { CardGrid } from "@tatolab/tato-app-view-sdk/design_system/card_grid";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import { CopyWordsButton } from "@tatolab/tato-app-view-sdk/design_system/copy_words_button";
import { FormDialog, FormDialogFooter } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { KeyboardKey } from "@tatolab/tato-app-view-sdk/design_system/keyboard_key";
import { ModuleCard, ModuleCover, ModuleMark } from "@tatolab/tato-app-view-sdk/design_system/module_card";
import { MenuItem, MenuItemThatCannotBeChosen, MoreActionsMenu } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { ModuleList, ModuleListRow } from "@tatolab/tato-app-view-sdk/design_system/module_list";
import { PanelListRow } from "@tatolab/tato-app-view-sdk/design_system/panel_section";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { ProgressMeter } from "@tatolab/tato-app-view-sdk/design_system/progress_meter";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { SegmentedChoiceControl } from "@tatolab/tato-app-view-sdk/design_system/segmented_choice_control";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { isTheKeyboardsFocusOnNothing } from "@tatolab/tato-app-view-sdk/design_system/support/keyboards_focus";
import { studioIconNamed } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import {
  everyModuleCardRowOf,
  MARKETPLACE_KINDS_SHOWN,
  marketplaceRowsShownOf,
  MODULE_ASK_WORDS_ONCE_DONE,
  MODULE_ASK_WORDS_WHILE_UNDER_WAY,
  moduleCardContentsWordsOf,
  cardOffersAdd,
  moduleCardMarkOf,
  moduleCountsWordsOf,
  type ModuleAsk,
  updatesCountWordsOf,
  workInProgressWordsOf,
  moduleContentsWordsOf,
  moduleCopyStateOf,
  moduleCoverNumberOf,
  whyTheModuleHasNoUpdateToTake,
  moduleRowAndItsNeighboursOf,
  workByIdWithoutTheAddsNowListed,
  workByIdWithTheRowsMade,
  workKeptForTheRow,
  moduleRowCountsOf,
  moduleSourceWordsOf,
  moduleViewsShownOf,
  projectModuleRowsShownOf,
  type MarketplaceKindShown,
  type ModuleCardRow,
} from "./module_manager_listing";
import type { ModulesShown } from "../../shared/tatolab_electron_bridge_contract";
import type { ModuleManagerSectionAskNumbered } from "./studio_window_model";

/** What the Marketplace window reads and asks through. */
export interface ModuleManagerSources {
  readPackageCatalog(): Promise<PackageCatalogReading>;
  listWorkspaceDependencies(checkForNewer: boolean): Promise<WorkspaceDependency[]>;
  chooseDependencySource(sourceKind: DependencySourceKind): Promise<string | null>;
  addDependencyToTheWorkspace(source: string): Promise<ProjectDependency>;
  updateWorkspaceDependency(project: string, overwriteEditedFiles: boolean): Promise<WorkspaceDependencyUpdate>;
  removeWorkspaceDependency(project: string): Promise<ProjectDependency>;
  importFromTheMarketplace(name: string): Promise<ProjectDependency>;
  cloneMarketplaceSample(name: string): Promise<ChosenProjectFolder>;
  /** Bring forward the studio window of the project in `folder`, one a clone just made. */
  showTheClonedProject(folder: string): Promise<void>;
  /** The full path of a file or folder dropped on the window, or `""` for an item with none. */
  pathOfADroppedFile(droppedFile: File): string;
  /** The text of a rejected ask, as the backend gives it. */
  describeRejection(rejection: unknown): string;
}

/** The project's modules as last listed: not yet, listed, or refused in the runtime's words. */
type ModulesOfTheProjectListing = { kind: "listing" } | { kind: "listed"; dependencies: WorkspaceDependency[] } | { kind: "refused"; because: string };

/** An Update that waits on the person: the row, and each file of its folder edited since its copy. */
interface UpdateWaitingOnTheOverwrite {
  row: ModuleCardRow;
  edited_files: string[];
}

/**
 * Where the last thing asked of one module stands: under way, refused in the words of what refused it, or done in a way its page tells of
 * (just added to the project, or a sample just cloned into the project in `folder`, whose window was then shown or refused in words).
 */
type ModuleWork =
  | { kind: "under_way"; ask: ModuleAsk; words: string }
  | { kind: "refused"; ask: ModuleAsk; because: string }
  | { kind: "just_added" }
  | { kind: "just_cloned"; folder: string; showing_it_was_refused_because: string | null };

/** The work last asked of each module, by its row. */
type ModuleWorkByRowId = Readonly<Record<string, ModuleWork>>;

/** A heading over one kind of thing a module holds, with how many of it there are. */
function CountedHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs text-fg-2">
      {title}
      <span className="text-fg-3 tabular-nums">{count}</span>
    </h3>
  );
}

const MEMBER_LIST_CLASS_NAMES = "mt-1.5 rounded-lg border px-3 py-1";

function MemberRows({ title, icon, members }: { title: string; icon: ReactNode; members: readonly PackageCatalogMember[] }) {
  if (members.length === 0) return null;
  return (
    <div>
      <CountedHeading title={title} count={members.length} />
      <ul className={MEMBER_LIST_CLASS_NAMES}>
        {members.map((member) => (
          <PanelListRow key={member.import_path} icon={icon} name={<span className="font-mono text-xs">{member.name}</span>} detail={member.summary === "" ? member.import_path : member.summary} detailWraps />
        ))}
      </ul>
    </div>
  );
}

/** The views a module the project has brings, each a row, and what they can reach; or why the runtime listed none. */
function ViewsTheModuleBrings({ views }: { views: ViewsOfAWorkspaceDependency }) {
  const shown = useMemo(() => moduleViewsShownOf(views), [views]);
  const ViewIcon = studioIconNamed("project_view");
  if (shown.kind === "not_listed") return <RefusalLine tone="warning" lead="Its views could not be listed:" words={shown.because} data-module-manager-views-not-listed="" />;
  if (shown.rows.length === 0) return null;
  return (
    <div>
      <CountedHeading title="Views" count={shown.rows.length} />
      <ul className={MEMBER_LIST_CLASS_NAMES}>
        {shown.rows.map((viewRow) => (
          <PanelListRow
            key={viewRow.view_type_id}
            icon={<ViewIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />}
            name={viewRow.title}
            trailing={viewRow.opens ? viewRow.ports_words : undefined}
            detail={viewRow.opens ? undefined : <RefusalLine tone="warning" layout="under_field" lead="Doesn't open:" words={viewRow.not_opened_because} />}
            detailWraps
            data-module-manager-view={viewRow.view_type_id}
          />
        ))}
      </ul>
      {shown.reach_words !== null && (
        <p className="mt-1.5 text-xs text-fg-3" data-module-manager-views-reach="">
          {shown.reach_words}
        </p>
      )}
    </div>
  );
}

/** A module page's action, drawn across its column. */
function PageAction({
  appearance,
  icon,
  disabledReason,
  onPressed,
  children,
  ...controlDataAttributes
}: Pick<Parameters<typeof ActionButton>[0], "appearance" | "icon" | "disabledReason" | "onPressed" | "children"> & { [dataAttributeName: `data-${string}`]: string | undefined }) {
  return (
    <ActionButton appearance={appearance} icon={icon} disabledReason={disabledReason} onPressed={onPressed} className="h-10 w-full text-base" {...controlDataAttributes}>
      {children}
    </ActionButton>
  );
}

/** How something asked of a module went, once done: a line saying so behind a check, what it means, and what to do next. */
function PageOutcome({ title, children, ...controlDataAttributes }: { title: string; children: ReactNode; [dataAttributeName: `data-${string}`]: string | undefined }) {
  return (
    <div className="flex flex-col gap-3" {...controlDataAttributes}>
      <h3 className="flex items-start gap-2 text-lg font-semibold text-fg">
        <Check className="mt-0.5 size-4 shrink-0 text-status-positive-text" strokeWidth={2} aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

/** What a module's page is asked to do, each by the row it shows. */
interface ModuleAsks {
  add: (row: ModuleCardRow) => void;
  clone: (row: ModuleCardRow) => void;
  update: (row: ModuleCardRow) => void;
  askBeforeRemoving: (row: ModuleCardRow) => void;
  showTheClonedProject: (row: ModuleCardRow, folder: string) => void;
}

/** The right column of a module's page: what it is, the one thing to do with it, and how that went. */
function ModulePageActions({
  row,
  work,
  projectName,
  asks,
  onKeepBrowsing,
  onViewInTheProject,
}: {
  row: ModuleCardRow;
  work: ModuleWork | null;
  projectName: string;
  asks: ModuleAsks;
  onKeepBrowsing: () => void;
  onViewInTheProject: () => void;
}) {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const retry = (ask: ModuleAsk) => ({ add: asks.add, clone: asks.clone, update: asks.update, remove: asks.askBeforeRemoving })[ask](row);
  const action = (() => {
    if (work?.kind === "under_way") {
      return <ProgressMeter label={work.words} detail="Leave this page any time. It keeps going." percent={null} outcome="in_progress" data-module-manager-work={row.row_id} />;
    }
    if (work?.kind === "just_cloned") {
      return (
        <PageOutcome title={`${row.title} was cloned into a new project`} data-module-manager-cloned={row.row_id}>
          <p className="text-sm text-fg-2">
            It is a project of its own now, open in its own window. {projectName} was not changed.
          </p>
          <PageAction appearance="primary" onPressed={() => asks.showTheClonedProject(row, work.folder)} data-module-manager-show-cloned-project="">
            Show the new project
          </PageAction>
          {work.showing_it_was_refused_because !== null && (
            <RefusalLine lead="The new project was not shown:" words={work.showing_it_was_refused_because} data-module-manager-show-cloned-project-refusal="" />
          )}
          <PageAction onPressed={onKeepBrowsing}>Keep browsing</PageAction>
        </PageOutcome>
      );
    }
    if (work?.kind === "just_added") {
      const nodeNames = entry === null ? [] : entry.nodes.map((node) => node.name);
      return (
        <PageOutcome title={`${row.title} is in ${projectName}`} data-module-manager-added={row.row_id}>
          {nodeNames.length > 0 && (
            <p className="text-sm text-fg-2">
              <span className="font-mono text-xs">{nodeNames.join(", ")}</span> {nodeNames.length === 1 ? "is" : "are"} in {projectName}'s node list now, ready for any of its streams.
            </p>
          )}
          <PageAction onPressed={onKeepBrowsing}>Keep browsing</PageAction>
          <PageAction onPressed={onViewInTheProject} data-module-manager-view-in-project="">
            View in {projectName}
          </PageAction>
        </PageOutcome>
      );
    }
    if (entry?.kind === "sample") {
      return (
        <div className="flex flex-col gap-3">
          {entry.download === null ? (
            <p className="text-xs text-fg-3">The catalog names no download for it yet.</p>
          ) : (
            <PageAction appearance="primary" icon={Copy} onPressed={() => asks.clone(row)} data-module-manager-clone={entry.name}>
              Clone sample
            </PageAction>
          )}
          <p className="text-xs text-fg-3">Downloaded, checked against its SHA-256, then made into a new project of its own. {projectName} is not changed.</p>
        </div>
      );
    }
    if (dependency === null) {
      if (entry === null) return null;
      if (entry.download === null) return <p className="text-xs text-fg-3">The catalog names no download for it yet.</p>;
      return (
        <div className="flex flex-col gap-3">
          <PageAction appearance="primary" icon={Download} onPressed={() => asks.add(row)} data-module-manager-import={entry.name}>
            Add to {projectName}
          </PageAction>
          <p className="text-xs text-fg-3">Downloaded, checked against its SHA-256, then added to {projectName}.</p>
        </div>
      );
    }
    const copyState = moduleCopyStateOf(dependency);
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-fg-2" data-module-manager-in-project={row.row_id}>
          <Check className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          In {projectName}
        </p>
        {copyState.kind === "update_available" && (
          <p className="text-xs font-medium text-brand-text" data-module-manager-update-available="">
            An update is available from where it was copied.
          </p>
        )}
        {copyState.kind === "check_refused" && <RefusalLine tone="warning" lead="Where it was copied from could not be checked:" words={copyState.because} />}
        <PageAction
          appearance={copyState.kind === "update_available" ? "primary" : "secondary"}
          icon={RefreshCw}
          disabledReason={whyTheModuleHasNoUpdateToTake(dependency)}
          onPressed={() => asks.update(row)}
          data-module-manager-update={dependency.folder}
        >
          {dependency.edited_files.length > 0 ? "Update…" : "Update"}
        </PageAction>
        <PageAction appearance="quiet" onPressed={() => asks.askBeforeRemoving(row)} data-module-manager-remove={dependency.folder}>
          Uninstall…
        </PageAction>
      </div>
    );
  })();
  return (
    <aside className="sticky top-0 flex w-90 shrink-0 flex-col gap-4 self-start rounded-xl border bg-raised p-6" aria-label={`${row.title}, what to do with it`}>
      <div className="flex flex-col gap-1.5">
        {entry !== null && <span className="label-caps">{entry.kind === "sample" ? "Sample project" : "Package"}</span>}
        <h2 className="text-2xl font-semibold text-fg">{row.title}</h2>
        {row.summary !== "" && <p className="text-sm text-fg-2">{row.summary}</p>}
      </div>
      {work?.kind === "refused" && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-danger bg-danger-soft p-3.5" role="alert" data-module-manager-refusal={row.row_id}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-danger-text">
            <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {row.title} was not {MODULE_ASK_WORDS_ONCE_DONE[work.ask]}
          </h3>
          <p className="rounded-md bg-window p-2.5 font-mono text-xs break-words whitespace-pre-wrap text-fg select-text" data-module-manager-refusal-words="">
            {work.because}
          </p>
          <p className="text-xs text-fg-2">Nothing in {projectName} changed.</p>
          <div className="flex gap-2">
            <ActionButton appearance="primary" icon={RefreshCw} onPressed={() => retry(work.ask)} data-module-manager-retry="">
              Retry
            </ActionButton>
            <CopyWordsButton readTextToCopy={() => work.because} />
          </div>
        </div>
      )}
      {(work?.kind !== "refused" || work.ask === "update" || work.ask === "remove") && action}
      {entry !== null && <KeyValueRows rows={[["Version", entry.version]]} />}
    </aside>
  );
}

/** A module's own page: Back and where it is, its cover, its description, what's inside and its technical details down the left, and what to do with it on the right. */
function ModulePage({
  row,
  position,
  rowCount,
  previousRowId,
  nextRowId,
  cameFromWords,
  work,
  projectName,
  asks,
  onBack,
  onRowOpened,
  onViewInTheProject,
}: {
  row: ModuleCardRow;
  position: number;
  rowCount: number;
  previousRowId: string | null;
  nextRowId: string | null;
  /** The tab Back returns to, as the breadcrumb names it. */
  cameFromWords: string;
  work: ModuleWork | null;
  projectName: string;
  asks: ModuleAsks;
  onBack: () => void;
  onRowOpened: (rowId: string) => void;
  onViewInTheProject: () => void;
}) {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const isASample = entry?.kind === "sample";
  const technicalDetails: KeyValueRow[] = [
    ...(entry === null ? [] : ([["Package", entry.name], ["Version", entry.version]] as const)),
    ...(entry === null || entry.download === null ? [] : ([["Download", entry.download.url], ["SHA-256", entry.download.sha256]] as const)),
    ...(dependency === null ? [] : ([["Folder", `imports/${dependency.folder}`], ["Copied from", dependency.source], ["Its copy", dependency.version]] as const)),
  ];
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-9 py-5" data-module-manager-detail={row.row_id}>
      <div className="mx-auto flex w-full max-w-300 flex-col gap-5">
        <div className="flex items-center gap-3">
          <ActionButton icon={ArrowLeft} onPressed={onBack} data-module-manager-back="">
            Back
          </ActionButton>
          <nav aria-label="Where this page is" className="flex min-w-0 items-center gap-1.5 text-sm text-fg-3">
            <span>{cameFromWords}</span>
            {entry !== null && cameFromWords === "Marketplace" && (
              <>
                <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{isASample ? "Samples" : "Packages"}</span>
              </>
            )}
            <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate text-fg" aria-current="page">
              {row.title}
            </span>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-fg-3">
            <IconButton icon={ChevronLeft} label="Previous" disabledReason={previousRowId === null ? "This is the first" : null} onPressed={() => previousRowId !== null && onRowOpened(previousRowId)} data-module-manager-previous="" />
            <IconButton icon={ChevronRight} label="Next" disabledReason={nextRowId === null ? "This is the last" : null} onPressed={() => nextRowId !== null && onRowOpened(nextRowId)} data-module-manager-next="" />
            <span className="tabular-nums">
              {position} of {rowCount}
            </span>
            <KeyboardKey>esc</KeyboardKey>
          </div>
        </div>
        <div className="flex items-start gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <ModuleCover title={row.title} coverNumber={moduleCoverNumberOf(row)} size="page" />
            {row.summary !== "" && (
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-fg">Description</h2>
                <p className="max-w-(--page-readable-width) text-base text-fg-2 select-text" data-module-manager-description="">
                  {row.summary}
                </p>
              </section>
            )}
            <section className="flex flex-col gap-3" data-module-manager-whats-inside="">
              <div>
                <h2 className="text-lg font-semibold text-fg">What's inside</h2>
                <p className="text-sm text-fg-3">{isASample ? "What the new project starts with." : dependency === null ? `What adding it brings to ${projectName}.` : `What it brought to ${projectName}.`}</p>
              </div>
              {entry !== null && (
                <>
                  <MemberRows title="Nodes" icon={<Box className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} members={entry.nodes} />
                  <MemberRows title="Streams" icon={<Workflow className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} members={entry.streams} />
                </>
              )}
              {dependency !== null && <ViewsTheModuleBrings views={dependency.views} />}
              {entry === null && (dependency === null || dependency.views.kind !== "listed" || dependency.views.views.length === 0) && (
                <p className="text-xs text-fg-3">The catalog doesn't list it, so its nodes are named in {projectName}'s node list only.</p>
              )}
            </section>
            <section className="flex flex-col gap-3" data-module-manager-technical-details="">
              <h2 className="text-lg font-semibold text-fg">Technical details</h2>
              <KeyValueRows rows={technicalDetails} look="fields" />
              {dependency !== null && (
                <div>
                  <h3 className="text-xs text-fg-2">Edited since its copy ({dependency.edited_files.length})</h3>
                  {dependency.edited_files.length === 0 ? (
                    <p className="py-1.5 text-xs text-fg-3">Nothing in its folder was edited since it was copied.</p>
                  ) : (
                    <ul className="py-1 font-mono text-xs text-fg-2" data-module-manager-edited-files="">
                      {dependency.edited_files.map((editedFile) => (
                        <li key={editedFile}>{editedFile}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
          <ModulePageActions row={row} work={work} projectName={projectName} asks={asks} onKeepBrowsing={onBack} onViewInTheProject={onViewInTheProject} />
        </div>
      </div>
    </div>
  );
}

const MARKETPLACE_KIND_LABELS: Record<MarketplaceKindShown, string> = { all: "All", package: "Packages", sample: "Samples" };

/** How the project's module of a row stands, in its list row: what is being done with it, else whether its source has an update, over where it was copied from. */
function ModuleStatusWords({ row, dependency, work }: { row: ModuleCardRow; dependency: WorkspaceDependency; work: ModuleWork | null }) {
  const copyState = moduleCopyStateOf(dependency);
  return (
    <span className="flex min-w-0 flex-col gap-0.5" data-module-manager-status={dependency.folder}>
      {work?.kind === "under_way" ? (
        <PendingActionWords words={MODULE_ASK_WORDS_WHILE_UNDER_WAY[work.ask]} />
      ) : (
        <>
          {copyState.kind === "check_refused" && (
            <span className="flex items-center gap-1.5 text-xs text-warn-text">
              <TriangleAlert className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
              Its source could not be checked
            </span>
          )}
          {copyState.kind === "update_available" && <ModuleMark mark={{ words: "Update available", tone: "news" }} />}
          {copyState.kind === "up_to_date" && <ModuleMark mark={{ words: "Up to date", tone: "quiet" }} />}
          {copyState.kind === "not_checked" && <span className="text-xs text-fg-3">Not checked for updates</span>}
        </>
      )}
      <span className="truncate text-2xs text-fg-3">{moduleSourceWordsOf(row)}</span>
    </span>
  );
}

/** Update and Uninstall… for one of the project's modules, as the choices of its ⋯ menu: Update is greyed, with why, unless its source has an update. */
function ModuleActionsMenuChoices({ row, dependency, work, asks }: { row: ModuleCardRow; dependency: WorkspaceDependency; work: ModuleWork | null; asks: ModuleAsks }) {
  const isWorkUnderWay = work?.kind === "under_way";
  const whyUpdateIsNotOffered = isWorkUnderWay ? work.words : whyTheModuleHasNoUpdateToTake(dependency);
  return (
    <>
      {whyUpdateIsNotOffered === null ? (
        <MenuItem icon={RefreshCw} onChosen={() => asks.update(row)} data-module-manager-update={dependency.folder}>
          {dependency.edited_files.length > 0 ? "Update…" : "Update"}
        </MenuItem>
      ) : (
        <MenuItemThatCannotBeChosen whyItCannotBeChosen={whyUpdateIsNotOffered} data-module-manager-update-not-offered={dependency.folder}>
          Update
        </MenuItemThatCannotBeChosen>
      )}
      <MenuItem icon={Trash2} isDestructive isDisabled={isWorkUnderWay} onChosen={() => asks.askBeforeRemoving(row)} data-module-manager-remove={dependency.folder}>
        Uninstall…
      </MenuItem>
    </>
  );
}

/** One of the project's modules in its list: what it adds, how it stands, and a ⋯ menu of what can be done with it; pressing its name opens its page. */
function ProjectModuleListRow({ row, dependency, work, asks, onOpened }: { row: ModuleCardRow; dependency: WorkspaceDependency; work: ModuleWork | null; asks: ModuleAsks; onOpened: () => void }) {
  return (
    <ModuleListRow
      title={row.title}
      coverNumber={moduleCoverNumberOf(row)}
      summary={row.summary}
      contentsWords={moduleContentsWordsOf(row)}
      statusWords={<ModuleStatusWords row={row} dependency={dependency} work={work} />}
      actions={
        <MoreActionsMenu label={`Actions for ${row.title}`} data-module-manager-actions={dependency.folder}>
          <ModuleActionsMenuChoices row={row} dependency={dependency} work={work} asks={asks} />
        </MoreActionsMenu>
      }
      belowTheRow={
        work?.kind === "refused" || dependency.check_refused_because !== null ? (
          <span className="flex flex-col gap-1">
            {dependency.check_refused_because !== null && (
              <RefusalLine tone="warning" lead="Where it was copied from could not be checked:" words={dependency.check_refused_because} data-module-manager-check-refusal={row.row_id} />
            )}
            {work?.kind === "refused" && <RefusalLine lead={`${row.title} was not ${MODULE_ASK_WORDS_ONCE_DONE[work.ask]}:`} words={work.because} data-module-manager-refusal={row.row_id} />}
          </span>
        ) : null
      }
      onOpened={onOpened}
      data-module-manager-row={row.row_id}
    />
  );
}


/** Whether a key press belongs to a field the person is typing in. */
function isTypedIntoAField(keyTarget: EventTarget | null): boolean {
  return keyTarget instanceof HTMLElement && (keyTarget.isContentEditable || keyTarget.tagName === "INPUT" || keyTarget.tagName === "TEXTAREA" || keyTarget.tagName === "SELECT");
}

/** Whether a key was pressed with the focus on a module's page or on nothing, and so not on a control outside the page that reads the arrow keys itself, as the tabs do. */
function isPressedOnTheModulePageOrNothing(keyTarget: EventTarget | null): boolean {
  return !(keyTarget instanceof HTMLElement) || keyTarget === document.body || keyTarget.closest(MODULE_PAGE_SELECTOR) !== null;
}

const MODULE_PAGE_SELECTOR = "[data-module-manager-detail]";

/**
 * The Marketplace window: the catalog's packages and samples as a storefront, and the open project's modules under the project's own name. A card
 * or a row opens the module's own page in the window's place; a package is added to the project, a sample cloned into a project of its own, and
 * a folder or `.zip` added from the project's tab. Each thing asked of a module runs on its own, so the rest of the window stays usable.
 */
export function ModuleManagerWindowView({
  workspace,
  sectionAsked,
  sources,
  platform,
}: {
  workspace: OpenProjectReading;
  sectionAsked: ModuleManagerSectionAskNumbered | null;
  sources: ModuleManagerSources;
  platform: TatolabPlatform;
}) {
  const [modulesShown, setModulesShown] = useState<ModulesShown>(sectionAsked?.shows ?? "marketplace");
  const [searchText, setSearchText] = useState("");
  const [marketplaceKindShown, setMarketplaceKindShown] = useState<MarketplaceKindShown>("all");
  const [rowIdOfThePageOpen, setRowIdOfThePageOpen] = useState<string | null>(null);
  const showTheTab = useCallback((tabToShow: ModulesShown) => {
    setModulesShown(tabToShow);
    setRowIdOfThePageOpen(null);
  }, []);
  useEffect(() => {
    if (sectionAsked !== null) showTheTab(sectionAsked.shows);
  }, [sectionAsked, showTheTab]);
  const [catalog, setCatalog] = useState<PackageCatalogReading | null>(null);
  const [modulesOfTheProject, setModulesOfTheProject] = useState<ModulesOfTheProjectListing>({ kind: "listing" });
  const [moduleWorkByRowId, setModuleWorkByRowId] = useState<ModuleWorkByRowId>({});
  const [sourceBeingAdded, setSourceBeingAdded] = useState<string | null>(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [projectTabRefusal, setProjectTabRefusal] = useState<string | null>(null);
  const [updateWaitingOnTheOverwrite, setUpdateWaitingOnTheOverwrite] = useState<UpdateWaitingOnTheOverwrite | null>(null);
  const [rowWaitingOnItsRemoval, setRowWaitingOnItsRemoval] = useState<ModuleCardRow | null>(null);
  const [isAFileDraggedOver, setIsAFileDraggedOver] = useState(false);
  const searchFieldElement = useRef<HTMLInputElement>(null);

  const isTheWindowStillShown = useRef(true);
  useEffect(() => {
    isTheWindowStillShown.current = true;
    return () => {
      isTheWindowStillShown.current = false;
    };
  }, []);
  const showTheModulesOfTheProject = useCallback((dependencies: WorkspaceDependency[]) => {
    if (isTheWindowStillShown.current) setModulesOfTheProject({ kind: "listed", dependencies });
  }, []);
  const wereUpdatesCheckedFor = useRef(false);
  const listTheModulesOfTheProject = useCallback(
    () =>
      sources.listWorkspaceDependencies(wereUpdatesCheckedFor.current).then(showTheModulesOfTheProject, (rejection: unknown) => {
        if (isTheWindowStillShown.current) setModulesOfTheProject({ kind: "refused", because: sources.describeRejection(rejection) });
      }),
    [sources, showTheModulesOfTheProject],
  );
  useEffect(() => {
    void listTheModulesOfTheProject();
    void sources.readPackageCatalog().then((reading) => {
      if (isTheWindowStillShown.current) setCatalog(reading);
    });
  }, [sources, listTheModulesOfTheProject]);

  const dependencies = useMemo(() => (modulesOfTheProject.kind === "listed" ? modulesOfTheProject.dependencies : []), [modulesOfTheProject]);
  const everyRow = useMemo(() => everyModuleCardRowOf(catalog, dependencies), [catalog, dependencies]);
  const marketplaceRows = useMemo(() => marketplaceRowsShownOf(everyRow, marketplaceKindShown, searchText), [everyRow, marketplaceKindShown, searchText]);
  const projectRows = useMemo(() => projectModuleRowsShownOf(everyRow, searchText), [everyRow, searchText]);
  const rowCounts = useMemo(() => moduleRowCountsOf(everyRow), [everyRow]);
  const rowsOfTheTabShown = modulesShown === "marketplace" ? marketplaceRows : projectRows;
  const pageOpen = rowIdOfThePageOpen === null ? null : moduleRowAndItsNeighboursOf(rowsOfTheTabShown, rowIdOfThePageOpen);
  const projectName = workspace.kind === "read" ? workspace.open_project.project.name : workspace.kind === "unreadable" ? workspace.folder : "";

  const setTheWorkOf = (row: ModuleCardRow, ask: ModuleAsk, work: ModuleWork | null) => {
    if (isTheWindowStillShown.current) setModuleWorkByRowId((workByRowId) => workByIdWithTheRowsMade(workByRowId, row, ask, work));
  };
  const workOf = (row: ModuleCardRow) => workKeptForTheRow(moduleWorkByRowId, row);
  const showThePageOf = (rowId: string | null) => {
    setRowIdOfThePageOpen(rowId);
    setModuleWorkByRowId((workByRowId) => workByIdWithoutTheAddsNowListed(workByRowId, everyRow, (work) => work.kind === "just_added"));
  };
  const askOfTheModule = <Answer,>(row: ModuleCardRow, ask: ModuleAsk, wordsWhileItRuns: string, work: () => Promise<Answer>, workOnceAnswered: (answer: Answer) => ModuleWork | null) => {
    if (workOf(row)?.kind === "under_way") return;
    setTheWorkOf(row, ask, { kind: "under_way", ask, words: wordsWhileItRuns });
    work().then(
      (answer) => {
        setTheWorkOf(row, ask, workOnceAnswered(answer));
        void listTheModulesOfTheProject();
      },
      (rejection: unknown) => setTheWorkOf(row, ask, { kind: "refused", ask, because: sources.describeRejection(rejection) }),
    );
  };
  const updateTheModule = (row: ModuleCardRow, overwriteEditedFiles: boolean) => {
    const dependency = row.module_of_the_project;
    if (dependency === null) return;
    askOfTheModule(row, "update", `Updating ${row.title}…`, () => sources.updateWorkspaceDependency(dependency.project, overwriteEditedFiles), (answer) => {
      setUpdateWaitingOnTheOverwrite(answer.kind === "edited_since_its_copy" ? { row, edited_files: answer.edited_files } : null);
      return null;
    });
  };
  const asks: ModuleAsks = {
    add: (row) => {
      const entry = row.catalog_entry;
      if (entry !== null) askOfTheModule(row, "add", `Adding ${row.title} to ${projectName}…`, () => sources.importFromTheMarketplace(entry.name), () => ({ kind: "just_added" }));
    },
    clone: (row) => {
      const entry = row.catalog_entry;
      if (entry === null) return;
      askOfTheModule(row, "clone", `Cloning ${row.title} into a new project…`, () => sources.cloneMarketplaceSample(entry.name), (cloned) => ({ kind: "just_cloned", folder: cloned.folder, showing_it_was_refused_because: null }));
    },
    update: (row) => updateTheModule(row, false),
    askBeforeRemoving: setRowWaitingOnItsRemoval,
    showTheClonedProject: (row, folder) => {
      const showTheOutcome = (refusedBecause: string | null) => setTheWorkOf(row, "clone", { kind: "just_cloned", folder, showing_it_was_refused_because: refusedBecause });
      sources.showTheClonedProject(folder).then(
        () => showTheOutcome(null),
        (rejection: unknown) => showTheOutcome(sources.describeRejection(rejection)),
      );
    },
  };
  const removeTheModule = (row: ModuleCardRow) => {
    const dependency = row.module_of_the_project;
    if (dependency === null) return;
    showThePageOf(null);
    askOfTheModule(row, "remove", `Uninstalling ${row.title}…`, () => sources.removeWorkspaceDependency(dependency.project), () => null);
  };

  const addFrom = (source: string) => {
    setProjectTabRefusal(null);
    setSourceBeingAdded(source);
    sources.addDependencyToTheWorkspace(source).then(
      () => {
        if (isTheWindowStillShown.current) setSourceBeingAdded(null);
        void listTheModulesOfTheProject();
      },
      (rejection: unknown) => {
        if (!isTheWindowStillShown.current) return;
        setSourceBeingAdded(null);
        setProjectTabRefusal(sources.describeRejection(rejection));
      },
    );
  };
  const chooseAndAdd = (sourceKind: DependencySourceKind) => {
    setProjectTabRefusal(null);
    sources.chooseDependencySource(sourceKind).then(
      (chosen) => {
        if (chosen !== null) addFrom(chosen);
      },
      (rejection: unknown) => setProjectTabRefusal(sources.describeRejection(rejection)),
    );
  };
  const checkForUpdates = () => {
    setProjectTabRefusal(null);
    setIsCheckingForUpdates(true);
    sources.listWorkspaceDependencies(true).then(
      (checked) => {
        wereUpdatesCheckedFor.current = true;
        showTheModulesOfTheProject(checked);
        if (isTheWindowStillShown.current) setIsCheckingForUpdates(false);
      },
      (rejection: unknown) => {
        if (!isTheWindowStillShown.current) return;
        setIsCheckingForUpdates(false);
        setProjectTabRefusal(sources.describeRejection(rejection));
      },
    );
  };

  const isTheProjectTabsListShown = modulesShown === "added_to_this_project" && pageOpen === null;
  const onDragOver = (dragEvent: DragEvent<HTMLDivElement>) => {
    if (!isTheProjectTabsListShown || !dragEvent.dataTransfer.types.includes("Files")) return;
    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = "copy";
    setIsAFileDraggedOver(true);
  };
  const onDrop = (dragEvent: DragEvent<HTMLDivElement>) => {
    if (!isTheProjectTabsListShown) return;
    dragEvent.preventDefault();
    setIsAFileDraggedOver(false);
    const droppedFile = dragEvent.dataTransfer.files[0];
    if (droppedFile === undefined || sourceBeingAdded !== null) return;
    const droppedPath = sources.pathOfADroppedFile(droppedFile);
    if (droppedPath === "") setProjectTabRefusal(`${droppedFile.name} has no path on this machine; drop a project's folder or a .zip of one.`);
    else addFrom(droppedPath);
  };

  const rowIdOfThePageShown = pageOpen?.row.row_id ?? null;
  useEffect(() => {
    if (rowIdOfThePageShown === null && rowIdOfThePageOpen !== null) setRowIdOfThePageOpen(null);
  }, [rowIdOfThePageShown, rowIdOfThePageOpen]);
  const windowElement = useRef<HTMLDivElement>(null);
  const rowIdOfThePageShownLast = useRef<string | null>(null);
  useEffect(() => {
    const rowIdOfThePageLeft = rowIdOfThePageShownLast.current;
    rowIdOfThePageShownLast.current = rowIdOfThePageShown;
    if (rowIdOfThePageShown !== null && rowIdOfThePageLeft === null) {
      windowElement.current?.querySelector<HTMLElement>("[data-module-manager-back]")?.focus();
    } else if (rowIdOfThePageShown === null && rowIdOfThePageLeft !== null && isTheKeyboardsFocusOnNothing()) {
      windowElement.current?.querySelector<HTMLElement>(`[data-module-manager-row="${CSS.escape(rowIdOfThePageLeft)}"] :is([data-module-card-open], [data-module-list-row-open])`)?.focus();
    }
  }, [rowIdOfThePageShown]);
  const kindOfTheWorkOnThePageShown = pageOpen === null ? null : (workOf(pageOpen.row)?.kind ?? "none");
  useEffect(() => {
    if (kindOfTheWorkOnThePageShown !== null && isTheKeyboardsFocusOnNothing()) windowElement.current?.querySelector<HTMLElement>("[data-module-manager-back]")?.focus();
  }, [kindOfTheWorkOnThePageShown]);

  const isADialogOpen = updateWaitingOnTheOverwrite !== null || rowWaitingOnItsRemoval !== null;
  const countOfTheProjectsModules = rowCounts.project.all;
  const countOfTheProjectsModulesShownLast = useRef(countOfTheProjectsModules);
  useEffect(() => {
    const isAModuleGone = countOfTheProjectsModules < countOfTheProjectsModulesShownLast.current;
    countOfTheProjectsModulesShownLast.current = countOfTheProjectsModules;
    const isTheFocusOnNothingTheWindowKeeps = isTheKeyboardsFocusOnNothing() || windowElement.current?.contains(document.activeElement) === false;
    if (isAModuleGone && !isADialogOpen && isTheFocusOnNothingTheWindowKeeps) windowElement.current?.querySelector<HTMLElement>(`[data-module-manager-show="${modulesShown}"]`)?.focus();
  }, [countOfTheProjectsModules, modulesShown, isADialogOpen]);
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (isADialogOpen || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
      if (isTypedIntoAField(keyEvent.target)) {
        if (keyEvent.key === "Escape" && keyEvent.target instanceof HTMLElement) keyEvent.target.blur();
        return;
      }
      if (keyEvent.key === "/") {
        keyEvent.preventDefault();
        searchFieldElement.current?.focus();
        return;
      }
      if (pageOpen === null || keyEvent.defaultPrevented) return;
      if (keyEvent.key === "Escape") showThePageOf(null);
      if (!isPressedOnTheModulePageOrNothing(keyEvent.target)) return;
      if (keyEvent.key === "ArrowLeft" && pageOpen.previousRowId !== null) showThePageOf(pageOpen.previousRowId);
      else if (keyEvent.key === "ArrowRight" && pageOpen.nextRowId !== null) showThePageOf(pageOpen.nextRowId);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isADialogOpen, pageOpen]);

  const searchedFor = searchText.trim();
  const marketplaceBrowse = (() => {
    if (catalog === null) return <WaitingState title="Reading the catalog" data-module-manager-state="reading" />;
    if (marketplaceRows.length === 0) {
      if (searchedFor !== "") return <WaitingState title={`Nothing in the Marketplace matches “${searchedFor}”`} data-module-manager-state="empty" />;
      if (catalog.kind === "not_read") return <WaitingState title="The catalog didn't load" explanation="Its reason is above." />;
      return <WaitingState title="The catalog lists nothing to show here yet" data-module-manager-state="empty" />;
    }
    return (
      <CardGrid size="page" label="Packages and samples" data-module-manager-cards="">
        {marketplaceRows.map((row) => {
          const work = workOf(row);
          const wasJustAdded = work?.kind === "just_added";
          return (
            <ModuleCard
              key={row.row_id}
              title={row.title}
              coverNumber={moduleCoverNumberOf(row)}
              summary={row.summary}
              contentsWords={moduleCardContentsWordsOf(row)}
              mark={moduleCardMarkOf(row, work?.kind === "refused" ? work.ask : null, wasJustAdded)}
              pendingWords={work?.kind === "under_way" ? MODULE_ASK_WORDS_WHILE_UNDER_WAY[work.ask] : null}
              hoverAction={
                cardOffersAdd(row, wasJustAdded) ? (
                  <ActionButton size="small" appearance="primary" icon={Download} label={`Add ${row.title} to ${projectName}`} onPressed={() => asks.add(row)} data-module-manager-add-from-card={row.row_id}>
                    Add
                  </ActionButton>
                ) : null
              }
              onOpened={() => showThePageOf(row.row_id)}
              data-module-manager-row={row.row_id}
            />
          );
        })}
      </CardGrid>
    );
  })();

  const projectModulesList = (() => {
    if (modulesOfTheProject.kind === "listing") return <WaitingState title={`Reading ${projectName}'s modules`} data-module-manager-state="reading" />;
    if (modulesOfTheProject.kind === "refused") return <WaitingState title={`${projectName}'s modules could not be listed`} explanation="The runtime's words are above." />;
    if (projectRows.length === 0) {
      if (searchedFor !== "") return <WaitingState title={`No module in ${projectName} matches “${searchedFor}”`} data-module-manager-state="empty" />;
      return <WaitingState title={`${projectName} has no modules yet`} explanation="Add one from the Marketplace, or from a project's folder or .zip." data-module-manager-state="empty" />;
    }
    return (
      <ModuleList label={`Modules in ${projectName}`}>
        {projectRows.map((row) =>
          row.module_of_the_project === null ? null : (
            <ProjectModuleListRow key={row.row_id} row={row} dependency={row.module_of_the_project} work={workOf(row)} asks={asks} onOpened={() => showThePageOf(row.row_id)} />
          ),
        )}
      </ModuleList>
    );
  })();

  const workUnderWay = everyRow.flatMap((row) => {
    const work = workOf(row);
    return work?.kind === "under_way" ? [work.words] : [];
  });
  const everyWorkUnderWay = [...workUnderWay, ...(sourceBeingAdded === null ? [] : [`Adding ${sourceBeingAdded} to ${projectName}…`]), ...(isCheckingForUpdates ? ["Checking where each module was copied from…"] : [])];

  return (
    <div
      ref={windowElement}
      className="flex h-full flex-col bg-window text-fg"
      data-module-manager-window=""
      data-module-manager-drop-target={isAFileDraggedOver ? "over" : undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setIsAFileDraggedOver(false)}
      onDrop={onDrop}
    >
      {presentPlatform(platform).hasOverlayTitleBar && (
        <div
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center justify-center border-b bg-studio-menu-bar px-20 text-xs text-fg-2"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          <span className="truncate">{projectName}</span>
        </div>
      )}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-chrome px-4">
        <SegmentedChoiceControl
          label="Marketplace, or the open project's modules"
          choices={[
            { choice: "marketplace", label: "Marketplace" },
            { choice: "added_to_this_project", label: projectName, count: rowCounts.project.all },
          ]}
          chosen={modulesShown}
          onChosen={showTheTab}
          dataAttributeOfEachSegment="data-module-manager-show"
        />
        {rowCounts.project.updates > 0 && (
          <span className="shrink-0 text-xs font-medium text-brand-text" data-module-manager-updates-count="">
            {updatesCountWordsOf(rowCounts.project.updates)}
          </span>
        )}
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchField
            label={modulesShown === "marketplace" ? "Search modules, samples and nodes" : `Search the modules in ${projectName}`}
            placeholder={modulesShown === "marketplace" ? "Search modules, samples and nodes" : `Search the modules in ${projectName}`}
            text={searchText}
            onTextChanged={(text) => {
              setSearchText(text);
              showThePageOf(null);
            }}
            shortcut={{ hint: "/", ariaKeyShortcuts: "/" }}
            inputRef={searchFieldElement}
            width="fills_the_row"
            data-module-manager-search=""
          />
        </div>
        <span className="w-56 shrink-0 truncate text-right text-xs text-fg-3">
          {modulesShown === "marketplace" && (
            <>
              Adding to <span className="font-medium text-fg">{projectName}</span>
            </>
          )}
        </span>
      </header>
      {pageOpen !== null && (
        <ModulePage
          row={pageOpen.row}
          position={pageOpen.position}
          rowCount={rowsOfTheTabShown.length}
          previousRowId={pageOpen.previousRowId}
          nextRowId={pageOpen.nextRowId}
          cameFromWords={modulesShown === "marketplace" ? "Marketplace" : projectName}
          work={workOf(pageOpen.row)}
          projectName={projectName}
          asks={asks}
          onBack={() => showThePageOf(null)}
          onRowOpened={showThePageOf}
          onViewInTheProject={() => showTheTab("added_to_this_project")}
        />
      )}
      {/* The tab stays in the page under a module's page, so Back finds it scrolled where it was left. */}
      <main className={pageOpen !== null ? "hidden" : "scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-9 py-5"} hidden={pageOpen !== null}>
        {modulesShown === "marketplace" ? (
          <>
            <div className="flex shrink-0 items-center gap-3">
              <SegmentedChoiceControl
                label="Which of the catalog to show"
                choices={MARKETPLACE_KINDS_SHOWN.map((kindShown) => ({ choice: kindShown, label: MARKETPLACE_KIND_LABELS[kindShown], count: rowCounts.marketplace[kindShown] }))}
                chosen={marketplaceKindShown}
                onChosen={setMarketplaceKindShown}
                dataAttributeOfEachSegment="data-module-manager-kind"
              />
            </div>
            {catalog?.kind === "not_read" && <RefusalLine layout="bar" lead="The catalog didn't load:" words={catalog.because} data-module-manager-state="not_read" />}
            {catalog?.kind === "read" && catalog.unreadable_entry_count > 0 && (
              <RefusalLine tone="warning" layout="bar" words={`The catalog lists ${catalog.unreadable_entry_count} more this Tato Studio cannot read. A newer Tato Studio may list them.`} />
            )}
            {marketplaceBrowse}
          </>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div className="mr-2 flex min-w-0 flex-col">
                <span className="label-caps">Project</span>
                <h1 className="truncate text-2xl font-semibold" data-module-manager-project-name="">
                  {projectName}
                </h1>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {isCheckingForUpdates ? (
                  <PendingActionWords words="Checking…" />
                ) : (
                  <ActionButton
                    icon={RefreshCw}
                    disabledReason={dependencies.length === 0 ? `${projectName} has no modules to check` : null}
                    tooltip="Ask the folder, .zip or Marketplace each module was copied from whether it has changed since"
                    onPressed={checkForUpdates}
                    data-module-manager-check-for-updates=""
                  >
                    Check for updates
                  </ActionButton>
                )}
                <ActionButton icon={FolderPlus} isDisabled={sourceBeingAdded !== null} onPressed={() => chooseAndAdd("folder")} data-module-manager-add="folder">
                  Add from a folder…
                </ActionButton>
                <ActionButton icon={FileArchive} isDisabled={sourceBeingAdded !== null} onPressed={() => chooseAndAdd("zip")} data-module-manager-add="zip">
                  Add from a .zip…
                </ActionButton>
              </div>
            </div>
            {modulesOfTheProject.kind === "refused" && <RefusalLine layout="bar" lead={`${projectName}'s modules could not be listed:`} words={modulesOfTheProject.because} data-module-manager-state="refused" />}
            {projectTabRefusal !== null && <RefusalLine layout="bar" words={projectTabRefusal} data-module-manager-project-refusal="" />}
            {sourceBeingAdded !== null && <ProgressMeter label={`Adding ${sourceBeingAdded} to ${projectName}`} detail="Its files are copied into the project." percent={null} outcome="in_progress" data-module-manager-adding-source="" />}
            {projectModulesList}
            <p className="flex shrink-0 items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-sm text-fg-3" data-module-manager-drop-hint="">
              <Download className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                Drop a module's folder or .zip anywhere on this page to add it to <span className="text-fg">{projectName}</span>.
              </span>
            </p>
          </>
        )}
      </main>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-chrome px-4 text-2xs text-fg-3">
        <span className="truncate" data-module-manager-counts="">
          {moduleCountsWordsOf(projectName, rowCounts)}
        </span>
        <span className="ml-auto min-w-0 truncate" role="status" data-module-manager-in-progress="">
          {workInProgressWordsOf(everyWorkUnderWay)}
        </span>
      </footer>
      <FormDialog
        isOpen={updateWaitingOnTheOverwrite !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUpdateWaitingOnTheOverwrite(null);
        }}
        title={updateWaitingOnTheOverwrite === null ? "" : `Update ${updateWaitingOnTheOverwrite.row.title}`}
        description="These files of its folder were edited since it was copied. Updating overwrites them with its source's; keeping your edits leaves the module as it is."
        footer={
          updateWaitingOnTheOverwrite !== null && (
            <FormDialogFooter>
              <ActionButton className="ml-auto" hasFocusOnOpen onPressed={() => setUpdateWaitingOnTheOverwrite(null)} data-module-manager-keep-my-edits="">
                Keep my edits
              </ActionButton>
              <ActionButton appearance="destructive" onPressed={() => updateTheModule(updateWaitingOnTheOverwrite.row, true)} data-module-manager-overwrite="">
                Overwrite
              </ActionButton>
            </FormDialogFooter>
          )
        }
        data-module-manager-overwrite-dialog=""
      >
        {updateWaitingOnTheOverwrite !== null && (
          <ul className="flex flex-col gap-0.5 px-6 py-4 font-mono text-xs text-fg-2">
            {updateWaitingOnTheOverwrite.edited_files.map((editedFile) => (
              <li key={editedFile}>{editedFile}</li>
            ))}
          </ul>
        )}
      </FormDialog>
      <ConfirmationDialog
        isOpen={rowWaitingOnItsRemoval !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRowWaitingOnItsRemoval(null);
        }}
        question={
          rowWaitingOnItsRemoval === null
            ? null
            : {
                title: `Uninstall ${rowWaitingOnItsRemoval.title} from ${projectName}?`,
                explanation: `Its copy leaves ${projectName}, with the nodes and views it brought. The runtime refuses while a stream of ${projectName} still uses it.`,
                confirmWords: "Uninstall",
              }
        }
        isDestructive
        onConfirmed={() => {
          if (rowWaitingOnItsRemoval !== null) removeTheModule(rowWaitingOnItsRemoval);
          setRowWaitingOnItsRemoval(null);
        }}
        confirmDataAttributes={{ "data-module-manager-confirm-remove": "" }}
        data-module-manager-remove-dialog=""
      />
    </div>
  );
}
