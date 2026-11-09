import { Box, Download, FileArchive, FolderOpen, FolderPlus, RefreshCw, Search, Workflow } from "lucide-react";
import { useCallback, useEffect, useState, type DragEvent } from "react";
import type {
  DependencySourceKind,
  OpenProjectReading,
  PackageCatalogReading,
  ProjectDependency,
  TatolabPlatform,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
} from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { ChoosableItemList } from "../design_system/choosable_item_list";
import { FormDialog, FormDialogFooter } from "../design_system/form_dialog";
import { PanelListRow, PanelSection } from "../design_system/panel_section";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { SearchField } from "../design_system/search_field";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { Toolbar, ToolbarGroup } from "../design_system/toolbar";
import { WaitingState } from "../design_system/waiting_state";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { marketplaceRowsOf, modulesOfTheProjectRowsOf, shortVersionOf, type MarketplaceRow, type ModuleManagerTab, type ModuleOfTheProjectRow } from "./module_manager_listing";

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

/** An Update that waits on the person: the module, and each file of its folder edited since its copy. */
interface UpdateWaitingOnTheOverwrite {
  row: ModuleOfTheProjectRow;
  edited_files: string[];
}

function MembersSections({ nodes, streams }: { nodes: readonly { name: string; import_path: string; summary: string }[]; streams: readonly { name: string; import_path: string; summary: string }[] }) {
  return (
    <>
      <PanelSection title={`Nodes (${nodes.length})`}>
        {nodes.length === 0 ? (
          <p className="py-1.5 text-xs text-fg-3">It brings no nodes.</p>
        ) : (
          <ul>
            {nodes.map((node) => (
              <PanelListRow key={node.import_path} icon={<Box className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={node.name} detail={node.summary || node.import_path} />
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title={`Streams (${streams.length})`}>
        {streams.length === 0 ? (
          <p className="py-1.5 text-xs text-fg-3">It brings no streams.</p>
        ) : (
          <ul>
            {streams.map((stream) => (
              <PanelListRow key={stream.import_path} icon={<Workflow className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={stream.name} detail={stream.summary || stream.import_path} />
            ))}
          </ul>
        )}
      </PanelSection>
    </>
  );
}

/** One of the project's modules at length: where it was copied from, at what version, and Update and Open to edit. */
function ModuleOfTheProjectDetail({ row, isBusy, onUpdate, onOpenToEdit }: { row: ModuleOfTheProjectRow; isBusy: boolean; onUpdate: () => void; onOpenToEdit: () => void }) {
  const { dependency } = row;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-module-manager-detail={dependency.folder}>
      <header className="flex flex-col gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold text-fg">{row.title}</h2>
        <p className="text-xs text-fg-3">
          imports/{dependency.folder} · version {shortVersionOf(dependency.version)}
        </p>
        <p className="mt-1 text-[13px] break-all text-fg-2">Copied from {dependency.source}</p>
        {dependency.newer_version_exists === true && (
          <p className="text-xs font-medium text-brand" data-module-manager-newer-version="">
            Its source holds a newer version.
          </p>
        )}
        {dependency.check_refused_because !== null && <RefusalLine tone="warning" lead="Its source could not be checked:" words={dependency.check_refused_because} />}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ActionButton appearance={dependency.newer_version_exists === true ? "primary" : "secondary"} size="small" icon={RefreshCw} isDisabled={isBusy} onPressed={onUpdate} data-module-manager-update={dependency.folder}>
            Update
          </ActionButton>
          <ActionButton size="small" icon={FolderOpen} isDisabled={isBusy} onPressed={onOpenToEdit} data-module-manager-open-to-edit={dependency.folder}>
            Open to edit
          </ActionButton>
        </div>
      </header>
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
    </div>
  );
}

/** One Marketplace entry at length: what it brings, and Import. */
function MarketplaceDetail({ row, isBusy, onImport }: { row: MarketplaceRow; isBusy: boolean; onImport: () => void }) {
  const { entry } = row;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-module-manager-detail={entry.name}>
      <header className="flex flex-col gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold text-fg">{entry.title}</h2>
        <p className="text-xs text-fg-3">
          {entry.name} · {entry.version}
        </p>
        <p className="mt-1 text-[13px] text-fg-2">{entry.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {row.folder_in_this_project !== null ? (
            <span className="text-xs text-fg-3">The project has it, in imports/{row.folder_in_this_project}.</span>
          ) : entry.download === null ? (
            <span className="text-xs text-fg-3">The catalog names no download for it yet.</span>
          ) : (
            <ActionButton appearance="primary" size="small" icon={Download} isDisabled={isBusy} onPressed={onImport} data-module-manager-import={entry.name}>
              Import
            </ActionButton>
          )}
        </div>
      </header>
      <MembersSections nodes={entry.nodes} streams={entry.streams} />
    </div>
  );
}

/** The module manager: the project's modules as the runtime lists them, each updated or opened to edit, more added from a folder or `.zip`, and the Marketplace's, each downloaded and imported. */
export function ModuleManagerWindowView({ workspace, sources, platform }: { workspace: OpenProjectReading; sources: ModuleManagerSources; platform: TatolabPlatform }) {
  const [tab, setTab] = useState<ModuleManagerTab>("in_this_project");
  const [catalog, setCatalog] = useState<PackageCatalogReading | null>(null);
  const [modulesOfTheProject, setModulesOfTheProject] = useState<ModulesOfTheProjectListing>({ kind: "listing" });
  const [searchText, setSearchText] = useState("");
  const [chosenRowId, setChosenRowId] = useState<string | null>(null);
  const [workUnderWay, setWorkUnderWay] = useState<string | null>(null);
  const [actionRefusal, setActionRefusal] = useState<string | null>(null);
  const [updateWaitingOnTheOverwrite, setUpdateWaitingOnTheOverwrite] = useState<UpdateWaitingOnTheOverwrite | null>(null);
  const [isAFileDraggedOver, setIsAFileDraggedOver] = useState(false);

  const listTheModulesOfTheProject = useCallback(
    (checkForNewer: boolean) =>
      sources.listWorkspaceDependencies(checkForNewer).then(
        (dependencies) => setModulesOfTheProject({ kind: "listed", dependencies }),
        (rejection: unknown) => setModulesOfTheProject({ kind: "refused", because: sources.describeRejection(rejection) }),
      ),
    [sources],
  );
  useEffect(() => {
    let isStillShown = true;
    void listTheModulesOfTheProject(false);
    void sources.readPackageCatalog().then((reading) => {
      if (isStillShown) setCatalog(reading);
    });
    return () => {
      isStillShown = false;
    };
  }, [sources, listTheModulesOfTheProject]);

  const dependencies = modulesOfTheProject.kind === "listed" ? modulesOfTheProject.dependencies : [];
  const projectRows = modulesOfTheProjectRowsOf(dependencies, searchText);
  const marketplaceRows = marketplaceRowsOf(catalog, dependencies, searchText);
  const workspaceName = workspace.kind === "read" ? workspace.open_project.project.name : workspace.kind === "unreadable" ? workspace.folder : "";
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
      setTab("in_this_project");
      setChosenRowId(added.folder);
      void listTheModulesOfTheProject(false);
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
  const update = (row: ModuleOfTheProjectRow, overwriteEditedFiles: boolean) =>
    doTheWork(`Updating ${row.title}`, () => sources.updateWorkspaceDependency(row.dependency.project, overwriteEditedFiles), (answer) => {
      if (answer.kind === "edited_since_its_copy") {
        setUpdateWaitingOnTheOverwrite({ row, edited_files: answer.edited_files });
        return;
      }
      setUpdateWaitingOnTheOverwrite(null);
      void listTheModulesOfTheProject(false);
    });
  const importFromTheMarketplace = (row: MarketplaceRow) =>
    doTheWork(`Downloading and importing ${row.title}`, () => sources.importFromTheMarketplace(row.entry.name), (added) => {
      setChosenRowId(added.folder);
      setTab("in_this_project");
      void listTheModulesOfTheProject(false);
    });
  const openToEdit = (row: ModuleOfTheProjectRow) => {
    setActionRefusal(null);
    sources.openImportToEdit(row.dependency.folder).catch((rejection: unknown) => setActionRefusal(sources.describeRejection(rejection)));
  };
  const checkForNewer = () => doTheWork("Checking each module's source for a newer version", () => listTheModulesOfTheProject(true), () => undefined);

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

  const listing = (() => {
    if (tab === "in_this_project") {
      if (modulesOfTheProject.kind === "listing") return <WaitingState title="Listing the project's modules" data-module-manager-state="listing" />;
      if (modulesOfTheProject.kind === "refused") return <WaitingState isFailure title="The project's modules could not be listed" explanation={modulesOfTheProject.because} data-module-manager-state="refused" />;
      if (projectRows.length === 0) {
        return (
          <WaitingState
            title={searchText.trim() === "" ? "The project has no modules yet" : `Nothing matches “${searchText.trim()}”`}
            explanation={searchText.trim() === "" ? "Add a project's folder or .zip, drop one here, or import one from the Marketplace." : undefined}
            data-module-manager-state="empty"
          />
        );
      }
      const chosenRow = projectRows.find((row) => row.row_id === chosenRowId) ?? projectRows[0] ?? null;
      return (
        <div className="flex min-h-0 flex-1">
          <ChoosableItemList
            label="The project's modules"
            items={projectRows.map((row) => ({
              item_id: row.row_id,
              title: row.title,
              summary: `imports/${row.dependency.folder}`,
              trailing: row.dependency.newer_version_exists === true ? "Newer version" : row.dependency.edited_files.length > 0 ? "Edited" : undefined,
            }))}
            chosenItemId={chosenRow?.row_id ?? null}
            onItemChosen={setChosenRowId}
            dataAttributeOfEachItem="data-module-manager-row"
          />
          {chosenRow !== null && <ModuleOfTheProjectDetail row={chosenRow} isBusy={isBusy} onUpdate={() => update(chosenRow, false)} onOpenToEdit={() => openToEdit(chosenRow)} />}
        </div>
      );
    }
    if (catalog === null) return <WaitingState title="Reading the catalog" data-module-manager-state="reading" />;
    if (catalog.kind === "not_read") return <WaitingState isFailure title="The catalog didn't load" explanation={catalog.because} waitsOn={THE_CATALOG_IS_SERVED_WITH} data-module-manager-state="not_read" />;
    if (marketplaceRows.length === 0) {
      return <WaitingState title={searchText.trim() === "" ? "The catalog lists nothing yet" : `Nothing matches “${searchText.trim()}”`} data-module-manager-state="empty" />;
    }
    const chosenRow = marketplaceRows.find((row) => row.row_id === chosenRowId) ?? marketplaceRows[0] ?? null;
    return (
      <div className="flex min-h-0 flex-1">
        <ChoosableItemList
          label="Marketplace"
          items={marketplaceRows.map((row) => ({
            item_id: row.row_id,
            title: row.title,
            summary: row.entry.summary,
            trailing: row.folder_in_this_project !== null ? "In this project" : undefined,
          }))}
          chosenItemId={chosenRow?.row_id ?? null}
          onItemChosen={setChosenRowId}
          dataAttributeOfEachItem="data-module-manager-row"
        />
        {chosenRow !== null && <MarketplaceDetail row={chosenRow} isBusy={isBusy} onImport={() => importFromTheMarketplace(chosenRow)} />}
      </div>
    );
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
          <span className="truncate">Module manager · {workspaceName}</span>
        </div>
      )}
      <Toolbar label="Module manager">
        <SegmentedChoiceControl
          label="What to list"
          choices={[
            { choice: "in_this_project", label: "In this project", count: modulesOfTheProject.kind === "listed" ? modulesOfTheProject.dependencies.length : undefined },
            { choice: "marketplace", label: "Marketplace", count: catalog?.kind === "read" ? catalog.entries.length : undefined },
          ]}
          chosen={tab}
          onChosen={(chosenTab) => {
            setTab(chosenTab);
            setChosenRowId(null);
          }}
          dataAttributeOfEachSegment="data-module-manager-tab"
        />
        {tab === "in_this_project" && (
          <ToolbarGroup>
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
        )}
        {workUnderWay !== null && (
          <ToolbarGroup>
            <PendingActionWords words={`${workUnderWay}…`} />
          </ToolbarGroup>
        )}
        <ToolbarGroup isAtTheEnd>
          <SearchField label="Search modules" placeholder="Search modules, nodes, streams" text={searchText} onTextChanged={setSearchText} data-module-manager-search="" />
        </ToolbarGroup>
      </Toolbar>
      {catalog?.kind === "read" && catalog.unreadable_entry_count > 0 && tab === "marketplace" && (
        <RefusalLine tone="warning" layout="bar" words={`The catalog lists ${catalog.unreadable_entry_count} more this Tato Studio cannot read. A newer Tato Studio may list them.`} />
      )}
      {actionRefusal !== null && <RefusalLine layout="bar" words={actionRefusal} />}
      <main className="flex min-h-0 flex-1 flex-col">{listing}</main>
      <FormDialog
        isOpen={updateWaitingOnTheOverwrite !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUpdateWaitingOnTheOverwrite(null);
        }}
        title={updateWaitingOnTheOverwrite === null ? "" : `Update ${updateWaitingOnTheOverwrite.row.title}`}
        description="These files of its folder were edited since it was copied. Updating overwrites them with its source's; keeping your edits leaves the module as it is."
        icon={RefreshCw}
        footer={
          updateWaitingOnTheOverwrite !== null && (
            <FormDialogFooter>
              <ActionButton className="ml-auto" hasFocusOnOpen onPressed={() => setUpdateWaitingOnTheOverwrite(null)} data-module-manager-keep-my-edits="">
                Keep my edits
              </ActionButton>
              <ActionButton appearance="destructive" isDisabled={isBusy} onPressed={() => update(updateWaitingOnTheOverwrite.row, true)} data-module-manager-overwrite="">
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
