import { cn } from "cn";
import { Box, Download, FolderOpen, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import type { ImportPreview, OpenProjectReading, PackageCatalogReading, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { ChoosableItemList } from "@tatolab/tato-app-view-sdk/design_system/choosable_item_list";
import { FormDialog, FormDialogFooter } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { PanelListRow, PanelSection } from "@tatolab/tato-app-view-sdk/design_system/panel_section";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { SegmentedChoiceControl } from "@tatolab/tato-app-view-sdk/design_system/segmented_choice_control";
import { Toolbar, ToolbarGroup } from "@tatolab/tato-app-view-sdk/design_system/toolbar";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { getMoreRowsOf, importChangeLinesOf, type GetMoreRow, type GetMoreScope } from "./get_more_listing";

/** The streamlib issue that serves the catalog. */
const THE_CATALOG_IS_SERVED_WITH = "tatolab/streamlib#3216";

/** What the Get more window reads and asks through. */
export interface GetMoreSources {
  readPackageCatalog(): Promise<PackageCatalogReading>;
  previewImport(requirement: string): Promise<ImportPreview>;
  importIntoWorkspace(requirement: string, basedOnVersion: string): Promise<void>;
  openImportToEdit(name: string): Promise<void>;
  /** The text of a rejected ask, as the backend gives it. */
  describeRejection(rejection: unknown): string;
}

/** An import shown before it is written, and why writing it was refused, if it was. */
interface ImportShown {
  title: string;
  requirement: string;
  preview: ImportPreview;
  refusal: string | null;
}

/** The change an import makes to `pyproject.toml`, line by line, the added lines marked. */
function ImportChange({ preview }: { preview: ImportPreview }) {
  return (
    <figure className="overflow-hidden rounded-md bg-well" data-import-change="">
      <figcaption className="flex h-8 items-center border-b px-3 font-mono text-xs text-fg-3">pyproject.toml</figcaption>
      <pre className="max-h-72 overflow-auto py-2 font-mono text-xs leading-[18px] select-text">
        {importChangeLinesOf(preview.text_before, preview.text_after).map((line, lineIndex) => (
          <div
            key={lineIndex}
            className={cn("px-3 whitespace-pre", line.change === "added" && "bg-brand-soft text-fg", line.change === "removed" && "bg-danger-soft text-fg-2 line-through", line.change === "kept" && "text-fg-2")}
            data-import-change-line={line.change}
          >
            <span className="mr-2 inline-block w-2 text-fg-3 select-none" aria-hidden>
              {line.change === "added" ? "+" : line.change === "removed" ? "−" : " "}
            </span>
            {line.text}
          </div>
        ))}
      </pre>
    </figure>
  );
}

/** The row chosen, at length: what it brings and what can be done with it. */
function GetMoreRowDetail({ row, onImport, onOpenToEdit }: { row: GetMoreRow; onImport: () => void; onOpenToEdit: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-get-more-detail={row.name}>
      <header className="flex flex-col gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold text-fg">{row.title}</h2>
        <p className="text-xs text-fg-3">
          {row.name} · {row.version_words}
        </p>
        <p className="mt-1 text-[13px] text-fg-2">{row.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {row.requirement_to_import !== null && (
            <ActionButton appearance="primary" size="small" icon={Download} onPressed={onImport} data-get-more-import={row.name}>
              Import
            </ActionButton>
          )}
          {row.is_imported && <span className="text-xs text-fg-3">The project imports it.</span>}
          {row.opens_to_edit && (
            <ActionButton size="small" icon={FolderOpen} onPressed={onOpenToEdit} data-get-more-open-to-edit={row.name}>
              Open to edit
            </ActionButton>
          )}
        </div>
      </header>
      <PanelSection title={`Nodes (${row.nodes.length})`}>
        {row.nodes.length === 0 ? (
          <p className="py-1.5 text-xs text-fg-3">It brings no nodes.</p>
        ) : (
          <ul>
            {row.nodes.map((node) => (
              <PanelListRow key={node.import_path} icon={<Box className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={node.name} detail={node.summary || node.import_path} />
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title={`Streams (${row.streams.length})`}>
        {row.streams.length === 0 ? (
          <p className="py-1.5 text-xs text-fg-3">It brings no streams.</p>
        ) : (
          <ul>
            {row.streams.map((stream) => (
              <PanelListRow key={stream.import_path} icon={<Workflow className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} name={stream.name} detail={stream.summary || stream.import_path} />
            ))}
          </ul>
        )}
      </PanelSection>
    </div>
  );
}

/** Get more: the catalog's packages and samples and the workspace's imports, each showing what it brings, imported into the workspace after its change to `pyproject.toml` is shown. */
export function GetMoreWindowView({ workspace, sources, platform }: { workspace: OpenProjectReading; sources: GetMoreSources; platform: TatolabPlatform }) {
  const [catalog, setCatalog] = useState<PackageCatalogReading | null>(null);
  const [scope, setScope] = useState<GetMoreScope>("published");
  const [searchText, setSearchText] = useState("");
  const [chosenRowName, setChosenRowName] = useState<string | null>(null);
  const [importShown, setImportShown] = useState<ImportShown | null>(null);
  const [actionRefusal, setActionRefusal] = useState<string | null>(null);
  useEffect(() => {
    let isStillShown = true;
    void sources.readPackageCatalog().then((reading) => {
      if (isStillShown) setCatalog(reading);
    });
    return () => {
      isStillShown = false;
    };
  }, [sources]);

  const workspaceName = workspace.kind === "read" ? workspace.open_project.project.name : workspace.kind === "unreadable" ? workspace.folder : "";
  const rows = getMoreRowsOf(scope, catalog, workspace, searchText);
  const chosenRow = rows.find((row) => row.name === chosenRowName) ?? rows[0] ?? null;
  const countOf = (countedScope: GetMoreScope) => getMoreRowsOf(countedScope, catalog, workspace, "").length;

  const showTheImport = (row: GetMoreRow) => {
    const requirement = row.requirement_to_import;
    if (requirement === null) return;
    setActionRefusal(null);
    sources.previewImport(requirement).then(
      (preview) => setImportShown({ title: row.title, requirement, preview, refusal: null }),
      (rejection: unknown) => setActionRefusal(sources.describeRejection(rejection)),
    );
  };
  const writeTheImport = (shown: ImportShown) => {
    sources.importIntoWorkspace(shown.requirement, shown.preview.based_on_version).then(
      () => setImportShown(null),
      (rejection: unknown) => setImportShown({ ...shown, refusal: sources.describeRejection(rejection) }),
    );
  };
  const openToEdit = (row: GetMoreRow) => {
    if (row.name_imported_as === null) return;
    setActionRefusal(null);
    sources.openImportToEdit(row.name_imported_as).catch((rejection: unknown) => setActionRefusal(sources.describeRejection(rejection)));
  };

  const listing = (() => {
    if (catalog === null && scope !== "in_this_workspace") return <WaitingState title="Reading the catalog" data-get-more-state="reading" />;
    if (catalog?.kind === "not_read" && scope !== "in_this_workspace") {
      return <WaitingState isFailure title="The catalog didn't load" explanation={catalog.because} waitsOn={THE_CATALOG_IS_SERVED_WITH} data-get-more-state="not_read" />;
    }
    if (rows.length === 0) {
      return (
        <WaitingState
          title={searchText.trim() === "" ? (scope === "in_this_workspace" ? "The project imports nothing yet" : "The catalog lists none of these") : `Nothing matches “${searchText.trim()}”`}
          data-get-more-state="empty"
        />
      );
    }
    return (
      <div className="flex min-h-0 flex-1">
        <ChoosableItemList
          label="Listing"
          items={rows.map((row) => ({ item_id: row.name, title: row.title, summary: row.summary, trailing: row.is_imported ? "Imported" : undefined }))}
          chosenItemId={chosenRow?.name ?? null}
          onItemChosen={setChosenRowName}
          dataAttributeOfEachItem="data-get-more-row"
        />
        {chosenRow !== null && <GetMoreRowDetail row={chosenRow} onImport={() => showTheImport(chosenRow)} onOpenToEdit={() => openToEdit(chosenRow)} />}
      </div>
    );
  })();

  return (
    <div className="flex h-full flex-col bg-window text-fg" data-get-more-window="">
      {presentPlatform(platform).hasOverlayTitleBar && (
        <div
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center justify-center border-b bg-studio-menu-bar px-20 text-xs text-fg-2"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          <span className="truncate">Get more · {workspaceName}</span>
        </div>
      )}
      <Toolbar label="Get more">
        <SegmentedChoiceControl
          label="What to list"
          choices={[
            { choice: "published", label: "Published", count: countOf("published") },
            { choice: "samples", label: "Samples", count: countOf("samples") },
            { choice: "in_this_workspace", label: "In this project", count: countOf("in_this_workspace") },
          ]}
          chosen={scope}
          onChosen={(chosenScope) => {
            setScope(chosenScope);
            setChosenRowName(null);
          }}
          dataAttributeOfEachSegment="data-get-more-scope"
        />
        <ToolbarGroup isAtTheEnd>
          <SearchField label="Search packages and samples" placeholder="Search nodes, streams, packages" text={searchText} onTextChanged={setSearchText} data-get-more-search="" />
        </ToolbarGroup>
      </Toolbar>
      {catalog?.kind === "read" && catalog.unreadable_entry_count > 0 && (
        <RefusalLine tone="warning" layout="bar" words={`The catalog lists ${catalog.unreadable_entry_count} more this Tato Studio cannot read. A newer Tato Studio may list them.`} />
      )}
      {actionRefusal !== null && <RefusalLine layout="bar" words={actionRefusal} />}
      <main className="flex min-h-0 flex-1 flex-col">{listing}</main>
      <FormDialog
        isOpen={importShown !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setImportShown(null);
        }}
        title={importShown === null ? "" : `Import ${importShown.title}`}
        description={`Adds it to ${workspaceName}'s dependencies. The runtime takes it the next time the project loads.`}
        icon={Download}
        footer={
          importShown !== null && (
            <FormDialogFooter>
              <ActionButton className="ml-auto" onPressed={() => setImportShown(null)}>
                Cancel
              </ActionButton>
              <ActionButton appearance="primary" onPressed={() => writeTheImport(importShown)} data-get-more-import-confirm="">
                Import
              </ActionButton>
            </FormDialogFooter>
          )
        }
        data-get-more-import-dialog=""
      >
        {importShown !== null && (
          <div className="flex flex-col gap-2 px-6 py-4">
            <ImportChange preview={importShown.preview} />
            {importShown.refusal !== null && <RefusalLine lead="Nothing was written:" words={importShown.refusal} />}
          </div>
        )}
      </FormDialog>
    </div>
  );
}
