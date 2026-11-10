import { Box, CircleCheck, Download, FileArchive, FolderOpen, FolderPlus, LayoutGrid, RefreshCw, Search, Shapes, Workflow, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type {
  DependencySourceKind,
  OpenProjectReading,
  PackageCatalogEntry,
  PackageCatalogMember,
  PackageCatalogReading,
  ProjectDependency,
  TatolabPlatform,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
} from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FormDialog, FormDialogFooter } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { ModuleCard } from "@tatolab/tato-app-view-sdk/design_system/module_card";
import { PanelListRow, PanelSection } from "@tatolab/tato-app-view-sdk/design_system/panel_section";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { PlainCover } from "@tatolab/tato-app-view-sdk/design_system/project_card";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { SectionNavigationList } from "@tatolab/tato-app-view-sdk/design_system/section_navigation_list";
import { Toolbar, ToolbarGroup } from "@tatolab/tato-app-view-sdk/design_system/toolbar";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { coverInitialOfTheName, projectCoverNumberOfTheName } from "../presentation/projects_presentation";
import { everyModuleCardRowOf, moduleCardCountsOf, moduleCardMarkOf, moduleCardRowPickedBy, moduleCardRowsShownOf, shortVersionOf, type ModuleCardRow, type ModulesShown } from "./module_manager_listing";

/** The streamlib issue that serves the catalog. */
const THE_CATALOG_IS_SERVED_WITH = "tatolab/streamlib#3216";

/** What the module manager window reads and asks through. */
export interface ModuleManagerSources {
  readPackageCatalog(): Promise<PackageCatalogReading>;
  listWorkspaceDependencies(checkForNewer: boolean): Promise<WorkspaceDependency[]>;
  chooseDependencySource(sourceKind: DependencySourceKind): Promise<string | null>;
  addDependencyToTheWorkspace(source: string): Promise<ProjectDependency>;
  updateWorkspaceDependency(project: string, overwriteEditedFiles: boolean): Promise<WorkspaceDependencyUpdate>;
  importFromTheMarketplace(name: string): Promise<ProjectDependency>;
  openImportToEdit(folder: string): Promise<void>;
  /** The full path of a file or folder dropped on the window, or `""` for an item with none. */
  pathOfADroppedFile(droppedFile: File): string;
  /** The text of a rejected ask, as the backend gives it. */
  describeRejection(rejection: unknown): string;
}

/** The project's modules as last listed: not yet, listed, or refused in the runtime's words. */
type ModulesOfTheProjectListing = { kind: "listing" } | { kind: "listed"; dependencies: WorkspaceDependency[] } | { kind: "refused"; because: string };

/** An Update that waits on the person: the module, its title, and each file of its folder edited since its copy. */
interface UpdateWaitingOnTheOverwrite {
  dependency: WorkspaceDependency;
  title: string;
  edited_files: string[];
}

/** The nodes and streams a catalog entry brings, each a row. */
function MembersSections({ nodes, streams }: { nodes: readonly PackageCatalogMember[]; streams: readonly PackageCatalogMember[] }) {
  return (
    <>
      {nodes.length > 0 && (
        <PanelSection title="Adds these nodes">
          <ul>
            {nodes.map((node) => (
              <PanelListRow key={node.import_path} icon={<Box className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={node.name} detail={node.summary || node.import_path} />
            ))}
          </ul>
        </PanelSection>
      )}
      {streams.length > 0 && (
        <PanelSection title="Adds these streams">
          <ul>
            {streams.map((stream) => (
              <PanelListRow key={stream.import_path} icon={<Workflow className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={stream.name} detail={stream.summary || stream.import_path} />
            ))}
          </ul>
        </PanelSection>
      )}
    </>
  );
}

/** The picked card at length: what it brings and where it came from, Add for one the project has not added, and Update and Open to edit for one it has. */
function ModuleCardDetails({
  row,
  projectName,
  isBusy,
  onAdded,
  onUpdated,
  onOpenedToEdit,
  onClosed,
}: {
  row: ModuleCardRow;
  projectName: string;
  isBusy: boolean;
  onAdded: () => void;
  onUpdated: () => void;
  onOpenedToEdit: () => void;
  onClosed: () => void;
}) {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const facts: KeyValueRow[] = [
    ...(entry === null ? [] : ([["Version", entry.version], ["Package", <span className="font-mono text-xs">{entry.name}</span>], ["Kind", entry.kind === "sample" ? "Sample project" : "Package"]] as const)),
    ...(dependency === null
      ? []
      : ([["Folder", `imports/${dependency.folder}`], ["Copy", shortVersionOf(dependency.version)]] as const)),
  ];
  return (
    <aside className="flex w-95 shrink-0 flex-col border-l bg-studio-area shadow-(--shadow-pop)" aria-label="Details" data-module-manager-detail={row.row_id}>
      <div className="flex h-10 shrink-0 items-center justify-between pr-2 pl-5 text-xs text-fg-3">
        Details
        <IconButton icon={X} label="Close details" onPressed={onClosed} data-module-manager-close-details="" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5">
        <PlainCover coverNumber={projectCoverNumberOfTheName(row.title)} coverInitial={coverInitialOfTheName(row.title)} size="picture" />
        <h2 className="text-lg font-semibold text-fg">{row.title}</h2>
        {entry !== null && <p className="text-[13px] text-fg-2">{entry.summary}</p>}
        {dependency !== null && dependency.newer_version_exists === true && (
          <p className="text-xs font-medium text-brand-text" data-module-manager-newer-version="">
            Its source holds a newer version.
          </p>
        )}
        {dependency !== null && dependency.check_refused_because !== null && <RefusalLine tone="warning" lead="Its source could not be checked:" words={dependency.check_refused_because} />}
        {entry !== null && <MembersSections nodes={entry.nodes} streams={entry.streams} />}
        {dependency !== null && (
          <PanelSection title={`Edited since its copy (${dependency.edited_files.length})`}>
            {dependency.edited_files.length === 0 ? (
              <p className="py-1.5 text-xs text-fg-3">Nothing in its folder was edited since it was copied.</p>
            ) : (
              <ul className="py-1 font-mono text-xs text-fg-2" data-module-manager-edited-files="">
                {dependency.edited_files.map((editedFile) => (
                  <li key={editedFile}>{editedFile}</li>
                ))}
              </ul>
            )}
          </PanelSection>
        )}
        <KeyValueRows rows={facts} />
        {dependency !== null && (
          <p className="text-xs break-all text-fg-3 select-text" data-module-manager-copied-from="">
            Copied from {dependency.source}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t p-4">
        {dependency !== null ? (
          <div className="flex gap-2">
            <ActionButton
              className="flex-1"
              appearance={dependency.newer_version_exists === true ? "primary" : "secondary"}
              icon={RefreshCw}
              isDisabled={isBusy}
              onPressed={onUpdated}
              data-module-manager-update={dependency.folder}
            >
              Update
            </ActionButton>
            <ActionButton className="flex-1" icon={FolderOpen} isDisabled={isBusy} onPressed={onOpenedToEdit} data-module-manager-open-to-edit={dependency.folder}>
              Open to edit
            </ActionButton>
          </div>
        ) : entry?.download === null ? (
          <p className="text-xs text-fg-3">The catalog names no download for it yet.</p>
        ) : (
          entry !== null && (
            <ActionButton appearance="primary" icon={Download} isDisabled={isBusy} onPressed={onAdded} data-module-manager-import={entry.name}>
              {`Add to ${projectName}`}
            </ActionButton>
          )
        )}
      </div>
    </aside>
  );
}

/** What the Modules window's Show list offers, each with its icon. */
const MODULES_SHOWN_SECTIONS: readonly { modulesShown: ModulesShown; label: string; icon: LucideIcon }[] = [
  { modulesShown: "everything", label: "Everything", icon: LayoutGrid },
  { modulesShown: "added_to_this_project", label: "Added to this project", icon: CircleCheck },
  { modulesShown: "sample_projects", label: "Sample projects", icon: Shapes },
];

function isModulesShown(sectionId: string): sectionId is ModulesShown {
  return MODULES_SHOWN_SECTIONS.some((section) => section.modulesShown === sectionId);
}

/** The Modules window: the catalog's packages and samples and the project's modules as cards, shown all, added or samples only and narrowed by a search, the picked one at length beside them; more added from a folder or `.zip`. */
export function ModuleManagerWindowView({ workspace, sources, platform }: { workspace: OpenProjectReading; sources: ModuleManagerSources; platform: TatolabPlatform }) {
  const [modulesShown, setModulesShown] = useState<ModulesShown>("everything");
  const [catalog, setCatalog] = useState<PackageCatalogReading | null>(null);
  const [modulesOfTheProject, setModulesOfTheProject] = useState<ModulesOfTheProjectListing>({ kind: "listing" });
  const [searchText, setSearchText] = useState("");
  const [pickedRowId, setPickedRowId] = useState<string | null>(null);
  const [isTheDetailsPanelClosed, setIsTheDetailsPanelClosed] = useState(false);
  const [workUnderWay, setWorkUnderWay] = useState<string | null>(null);
  const [actionRefusal, setActionRefusal] = useState<string | null>(null);
  const [updateWaitingOnTheOverwrite, setUpdateWaitingOnTheOverwrite] = useState<UpdateWaitingOnTheOverwrite | null>(null);
  const [isAFileDraggedOver, setIsAFileDraggedOver] = useState(false);

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
  const listTheModulesOfTheProject = useCallback(
    () =>
      sources.listWorkspaceDependencies(false).then(showTheModulesOfTheProject, (rejection: unknown) => {
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
  const everyCardRow = useMemo(() => everyModuleCardRowOf(catalog, dependencies), [catalog, dependencies]);
  const cardRows = useMemo(() => moduleCardRowsShownOf(everyCardRow, modulesShown, searchText), [everyCardRow, modulesShown, searchText]);
  const cardCounts = useMemo(() => moduleCardCountsOf(everyCardRow), [everyCardRow]);
  const pickedRow = (() => {
    if (isTheDetailsPanelClosed) return null;
    if (pickedRowId === null) return cardRows[0] ?? null;
    return moduleCardRowPickedBy(cardRows, pickedRowId);
  })();
  const pickTheCard = (rowId: string) => {
    setPickedRowId(rowId);
    setIsTheDetailsPanelClosed(false);
  };
  const projectName = workspace.kind === "read" ? workspace.open_project.project.name : workspace.kind === "unreadable" ? workspace.folder : "";
  const isBusy = workUnderWay !== null;

  const doTheWork = <Answer,>(wordsWhileItRuns: string, work: () => Promise<Answer>, thenWith: (answer: Answer) => void) => {
    setActionRefusal(null);
    setWorkUnderWay(wordsWhileItRuns);
    work().then(
      (answer) => {
        setWorkUnderWay(null);
        thenWith(answer);
      },
      (rejection: unknown) => {
        setWorkUnderWay(null);
        setActionRefusal(sources.describeRejection(rejection));
      },
    );
  };
  const addFrom = (source: string) =>
    doTheWork(`Importing ${source}`, () => sources.addDependencyToTheWorkspace(source), (added) => {
      pickTheCard(added.folder);
      void listTheModulesOfTheProject();
    });
  const chooseAndAdd = (sourceKind: DependencySourceKind) => {
    setActionRefusal(null);
    sources.chooseDependencySource(sourceKind).then(
      (chosen) => {
        if (chosen !== null) addFrom(chosen);
      },
      (rejection: unknown) => setActionRefusal(sources.describeRejection(rejection)),
    );
  };
  const update = (dependency: WorkspaceDependency, title: string, overwriteEditedFiles: boolean) =>
    doTheWork(`Updating ${title}`, () => sources.updateWorkspaceDependency(dependency.project, overwriteEditedFiles), (answer) => {
      if (answer.kind === "edited_since_its_copy") {
        setUpdateWaitingOnTheOverwrite({ dependency, title, edited_files: answer.edited_files });
        return;
      }
      setUpdateWaitingOnTheOverwrite(null);
      void listTheModulesOfTheProject();
    });
  const addFromTheCatalog = (entry: PackageCatalogEntry) =>
    doTheWork(`Downloading and adding ${entry.title}`, () => sources.importFromTheMarketplace(entry.name), (added) => {
      pickTheCard(added.folder);
      void listTheModulesOfTheProject();
    });
  const openToEdit = (dependency: WorkspaceDependency) => {
    setActionRefusal(null);
    sources.openImportToEdit(dependency.folder).catch((rejection: unknown) => setActionRefusal(sources.describeRejection(rejection)));
  };
  const checkForNewer = () => doTheWork("Checking each module's source for a newer version", () => sources.listWorkspaceDependencies(true), showTheModulesOfTheProject);

  const onDragOver = (dragEvent: DragEvent<HTMLDivElement>) => {
    if (!dragEvent.dataTransfer.types.includes("Files")) return;
    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = "copy";
    setIsAFileDraggedOver(true);
  };
  const onDrop = (dragEvent: DragEvent<HTMLDivElement>) => {
    dragEvent.preventDefault();
    setIsAFileDraggedOver(false);
    const droppedFile = dragEvent.dataTransfer.files[0];
    if (droppedFile === undefined || isBusy) return;
    const droppedPath = sources.pathOfADroppedFile(droppedFile);
    if (droppedPath === "") setActionRefusal(`${droppedFile.name} has no path on this machine; drop a project's folder or a .zip of one.`);
    else addFrom(droppedPath);
  };

  const cardGrid = (() => {
    if (modulesOfTheProject.kind === "listing") return <WaitingState title="Reading the catalog and the project's modules" data-module-manager-state="reading" />;
    if (cardRows.length > 0) {
      return (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3.5 overflow-y-auto p-5" data-module-manager-cards="">
          {cardRows.map((row) => (
            <ModuleCard
              key={row.row_id}
              title={row.title}
              summary={row.summary}
              coverNumber={projectCoverNumberOfTheName(row.title)}
              coverInitial={coverInitialOfTheName(row.title)}
              mark={moduleCardMarkOf(row)}
              isPicked={row.row_id === pickedRow?.row_id}
              onPicked={() => pickTheCard(row.row_id)}
              data-module-manager-row={row.row_id}
            />
          ))}
        </div>
      );
    }
    if (searchText.trim() !== "") return <WaitingState title={`Nothing matches “${searchText.trim()}”`} data-module-manager-state="empty" />;
    if (modulesShown === "added_to_this_project" && modulesOfTheProject.kind === "refused") {
      return <WaitingState title="The project's modules could not be listed" explanation="The runtime's words are above." data-module-manager-state="refused" />;
    }
    if (modulesShown === "added_to_this_project") {
      return <WaitingState title="The project has no modules yet" explanation="Add one from the catalog, from a project's folder or .zip, or drop one here." data-module-manager-state="empty" />;
    }
    if (catalog === null) return <WaitingState title="Reading the catalog" data-module-manager-state="reading" />;
    if (catalog.kind === "not_read") return <WaitingState title="The catalog didn't load" explanation="Its reason is above." data-module-manager-state="not_read" />;
    return <WaitingState title="The catalog lists nothing to show here yet" data-module-manager-state="empty" />;
  })();

  return (
    <div
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
          <span className="truncate">Modules · {projectName}</span>
        </div>
      )}
      <Toolbar label="Modules">
        <h1 className="px-1 text-base font-semibold">Modules</h1>
        <ToolbarGroup>
          <SearchField label="Search modules" placeholder="Search modules and samples" text={searchText} onTextChanged={setSearchText} data-module-manager-search="" />
        </ToolbarGroup>
        {workUnderWay !== null && (
          <ToolbarGroup>
            <PendingActionWords words={`${workUnderWay}…`} />
          </ToolbarGroup>
        )}
        <ToolbarGroup isAtTheEnd>
          <ActionButton size="small" icon={FolderPlus} isDisabled={isBusy} onPressed={() => chooseAndAdd("folder")} data-module-manager-add="folder">
            Add from folder…
          </ActionButton>
          <ActionButton size="small" icon={FileArchive} isDisabled={isBusy} onPressed={() => chooseAndAdd("zip")} data-module-manager-add="zip">
            Add from .zip…
          </ActionButton>
          <ActionButton size="small" appearance="quiet" icon={Search} isDisabled={isBusy || dependencies.length === 0} onPressed={checkForNewer} data-module-manager-check-for-newer="">
            Check for newer
          </ActionButton>
        </ToolbarGroup>
      </Toolbar>
      {catalog?.kind === "not_read" && (
        <RefusalLine layout="bar" lead={`The catalog didn't load (it waits on ${THE_CATALOG_IS_SERVED_WITH}):`} words={catalog.because} data-module-manager-state="not_read" />
      )}
      {catalog?.kind === "read" && catalog.unreadable_entry_count > 0 && (
        <RefusalLine tone="warning" layout="bar" words={`The catalog lists ${catalog.unreadable_entry_count} more this Tato Studio cannot read. A newer Tato Studio may list them.`} />
      )}
      {modulesOfTheProject.kind === "refused" && <RefusalLine layout="bar" lead="The project's modules could not be listed:" words={modulesOfTheProject.because} data-module-manager-state="refused" />}
      {actionRefusal !== null && <RefusalLine layout="bar" words={actionRefusal} />}
      <main className="flex min-h-0 flex-1">
        <SectionNavigationList
          label="Show"
          sectionGroups={[
            {
              groupLabel: "Show",
              sections: MODULES_SHOWN_SECTIONS.map((section) => ({ section_id: section.modulesShown, label: section.label, icon: section.icon, count: cardCounts[section.modulesShown] })),
            },
          ]}
          shownSectionId={modulesShown}
          onSectionChosen={(sectionId) => {
            if (isModulesShown(sectionId)) setModulesShown(sectionId);
          }}
          dataAttributeOfEachSection="data-module-manager-show"
          width="wide"
        />
        <div className="flex min-w-0 flex-1 flex-col">{cardGrid}</div>
        {pickedRow !== null && (
          <ModuleCardDetails
            row={pickedRow}
            projectName={projectName}
            isBusy={isBusy}
            onAdded={() => {
              if (pickedRow.catalog_entry !== null) addFromTheCatalog(pickedRow.catalog_entry);
            }}
            onUpdated={() => {
              if (pickedRow.module_of_the_project !== null) update(pickedRow.module_of_the_project, pickedRow.title, false);
            }}
            onOpenedToEdit={() => {
              if (pickedRow.module_of_the_project !== null) openToEdit(pickedRow.module_of_the_project);
            }}
            onClosed={() => setIsTheDetailsPanelClosed(true)}
          />
        )}
      </main>
      <FormDialog
        isOpen={updateWaitingOnTheOverwrite !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUpdateWaitingOnTheOverwrite(null);
        }}
        title={updateWaitingOnTheOverwrite === null ? "" : `Update ${updateWaitingOnTheOverwrite.title}`}
        description="These files of its folder were edited since it was copied. Updating overwrites them with its source's; keeping your edits leaves the module as it is."
        icon={RefreshCw}
        footer={
          updateWaitingOnTheOverwrite !== null && (
            <FormDialogFooter>
              <ActionButton className="ml-auto" hasFocusOnOpen onPressed={() => setUpdateWaitingOnTheOverwrite(null)} data-module-manager-keep-my-edits="">
                Keep my edits
              </ActionButton>
              <ActionButton appearance="destructive" isDisabled={isBusy} onPressed={() => update(updateWaitingOnTheOverwrite.dependency, updateWaitingOnTheOverwrite.title, true)} data-module-manager-overwrite="">
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
    </div>
  );
}
