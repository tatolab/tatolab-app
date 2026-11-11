import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useMemo, useState } from "react";
import { Boxes, FilePlus2, Folder } from "lucide-react";
import { MenuSingleChoiceGroup, type MenuSingleChoice } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { ProjectAssetCard } from "@tatolab/tato-app-view-sdk/design_system/project_asset_card";
import { CardGrid } from "@tatolab/tato-app-view-sdk/design_system/card_grid";
import { SidePanel, WorkAreaWithSidePanel } from "@tatolab/tato-app-view-sdk/design_system/side_panel";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { SectionNavigationList } from "@tatolab/tato-app-view-sdk/design_system/section_navigation_list";
import { StudioAreaHeaderChoiceMenu } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { NodeGraphPinMark, nodeGraphPinFamilyWords } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { PropertySection } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { OpenProjectReading, ProjectAsset, ProjectAssetsReading, ProjectNodeTypePort, ProjectNodeTypesReading, StudioViewListed } from "@tatolab/tato-app-view-sdk/studio_readings";
import { studioIconNamed } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import { whereTheModuleStoppedTheParser, type DeclarationRowMeaning } from "../shared/node_type_listing_tree";
import { libraryTreeOfTheListing, type LibraryDeclarationsShown, type LibraryRowMeaning } from "./library_tree_of_the_listing";
import {
  assetFileName,
  assetFolderIdShownOf,
  assetFormatWords,
  assetKindAndSizeWords,
  assetPictureToneOf,
  assetsShownInTheFolder,
  assetsTheLibraryLists,
  byteLengthInWords,
  EVERY_ASSET_FOLDER_ID,
  importRefusalsOf,
  libraryAssetFoldersOf,
  type LibraryImportRefusal,
  noAssetShownWords,
  shortenedDigest,
} from "./library_assets_of_the_listing";
import { libraryViewGroupsOf, libraryViewRowIdOf, studioViewPortsWords, studioViewShownWhereWords } from "./library_views_of_the_listing";

/** One declared port's row: which way it faces, its family's pin, its name, and its family in words. */
function LibraryPortRow({ direction, portName, family, familyWords, portTitle, dataAttribute }: { direction: "In" | "Out"; portName: string; family: ProjectNodeTypePort["family"]; familyWords: string; portTitle: string | undefined; dataAttribute: "data-library-port" | "data-library-view-port" }) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-2 text-xs" title={portTitle} {...{ [dataAttribute]: portName }}>
      <span className="w-6 shrink-0 text-right text-2xs text-fg-3">{direction}</span>
      <NodeGraphPinMark family={family} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{portName}</span>
      <span className="shrink-0 text-fg-3">{familyWords}</span>
    </div>
  );
}

function PortsOfTheDeclaration({ direction, ports }: { direction: "In" | "Out"; ports: ProjectNodeTypePort[] | null }) {
  if (ports === null) return <p className="px-1 text-xs text-fg-3">{direction === "In" ? "Inputs" : "Outputs"} stated only by its native half</p>;
  return ports.map((port) => (
    <LibraryPortRow
      key={`${direction}:${port.name}`}
      direction={direction}
      portName={port.name}
      family={port.family}
      familyWords={port.family === null ? (port.annotation ?? "Family not stated") : nodeGraphPinFamilyWords(port.family)}
      portTitle={port.description === "" ? (port.annotation ?? undefined) : port.description}
      dataAttribute="data-library-port"
    />
  ));
}

function placeInWords(path: string | null, line: number | null): string {
  if (path === null) return "Not stated";
  return line === null ? path : `${path}:${line}`;
}

/** The chosen row's declaration: what it is, where it is declared, and its ports or promoted config; for a module that does not parse, why, in the parser's words. */
function DetailsOfTheDeclaration({ declaration }: { declaration: DeclarationRowMeaning }) {
  switch (declaration.kind) {
    case "node_type_declaration": {
      const { node_type: nodeType } = declaration;
      const facts: KeyValueRow[] = [
        ["Type", <span className="font-mono">{nodeType.type}</span>],
        ["Kind", nodeType.kind ?? "Not stated"],
        ["Category", nodeType.category],
        ["From", declaration.source_title],
        ["Declared", <span className="font-mono">{placeInWords(nodeType.path, nodeType.line)}</span>],
      ];
      return (
        <>
          <PropertySection title="Node type" data-library-details={nodeType.type}>
            {nodeType.description !== "" && <p className="px-1 pb-2 text-xs text-fg-2">{nodeType.description}</p>}
            <div className="px-1 pb-2">
              <KeyValueRows rows={facts} />
            </div>
          </PropertySection>
          <PropertySection title="Ports">
            {nodeType.inputs?.length === 0 && nodeType.outputs?.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              <>
                <PortsOfTheDeclaration direction="In" ports={nodeType.inputs} />
                <PortsOfTheDeclaration direction="Out" ports={nodeType.outputs} />
              </>
            )}
          </PropertySection>
        </>
      );
    }
    case "graph_generator_declaration": {
      const { graph_generator: graphGenerator } = declaration;
      return (
        <>
          <PropertySection title="Graph generator" data-library-details={graphGenerator.generator}>
            {graphGenerator.description !== "" && <p className="px-1 pb-2 text-xs text-fg-2">{graphGenerator.description}</p>}
            <div className="px-1 pb-2">
              <KeyValueRows
                rows={[
                  ["Generator", <span className="font-mono">{graphGenerator.generator}</span>],
                  ["From", declaration.source_title],
                  ["Declared", <span className="font-mono">{placeInWords(graphGenerator.path, graphGenerator.line)}</span>],
                ]}
              />
            </div>
          </PropertySection>
          <PropertySection title="Promoted config">
            {graphGenerator.promoted_config.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              <div className="px-1 pb-2">
                <KeyValueRows look="fields" rows={graphGenerator.promoted_config.map((setting): KeyValueRow => [setting.name, setting.annotation ?? ""])} />
              </div>
            )}
          </PropertySection>
        </>
      );
    }
    case "unreadable_module":
      return (
        <PropertySection title={`${declaration.unreadable_module.module} does not parse`} data-library-details={declaration.unreadable_module.module}>
          <div className="px-1 pb-1 font-mono text-xs text-fg-3">{whereTheModuleStoppedTheParser(declaration.unreadable_module)}</div>
          <div className="px-1 pb-2">
            <RuntimeFailureWords words={declaration.unreadable_module.why} data-library-unreadable-why={declaration.unreadable_module.module} />
          </div>
        </PropertySection>
      );
  }
}

/** What the Library shows: the node types the project can place, the views it can show, its graph generators, or its assets. */
type LibraryShown = LibraryDeclarationsShown | "views" | "assets";

const LIBRARY_SHOWN_CHOICES: readonly MenuSingleChoice<LibraryShown>[] = [
  { choice: "node_types", label: "Node types" },
  { choice: "views", label: "Views" },
  { choice: "graph_generators", label: "Generators" },
  { choice: "assets", label: "Assets" },
];

const LIBRARY_SHOWN_WORDS: Record<LibraryShown, string> = { node_types: "Node types", views: "Views", graph_generators: "Generators", assets: "Assets" };

function PortsOfTheView({ direction, ports }: { direction: "In" | "Out"; ports: StudioViewListed["inputs"] }) {
  return ports.map((port) => (
    <LibraryPortRow
      key={`${direction}:${port.name}`}
      direction={direction}
      portName={port.name}
      family={port.family}
      familyWords={nodeGraphPinFamilyWords(port.family)}
      portTitle={port.description === "" ? undefined : port.description}
      dataAttribute="data-library-view-port"
    />
  ));
}

/** The chosen view at length: what its manifest says of it, who brought it, and its ports, or why it does not open. */
function DetailsOfTheView({ studioView }: { studioView: StudioViewListed }) {
  const facts: KeyValueRow[] = [
    ["Brought by", studioView.brought_by],
    ["View type", <span className="font-mono">{studioView.view_type_id}</span>],
    ["Shows", studioViewShownWhereWords(studioView)],
  ];
  return (
    <div className="scrollbar-thin flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4" data-library-view-details={libraryViewRowIdOf(studioView)}>
      <h2 className="text-base font-semibold text-fg">{studioView.title}</h2>
      {studioView.description !== "" && <p className="text-xs text-fg-2">{studioView.description}</p>}
      {studioView.not_opened_because !== null && <RuntimeFailureWords words={studioView.not_opened_because} data-library-view-not-opened-because="" />}
      <KeyValueRows rows={facts} />
      {studioView.placement === "node" && (
        <PropertySection title="Ports">
          {studioView.inputs.length === 0 && studioView.outputs.length === 0 ? (
            <p className="px-1 text-xs text-fg-3">None</p>
          ) : (
            <>
              <PortsOfTheView direction="In" ports={studioView.inputs} />
              <PortsOfTheView direction="Out" ports={studioView.outputs} />
            </>
          )}
        </PropertySection>
      )}
    </div>
  );
}

/** The views an area can show, by who brought them, narrowed by the Library's search, the chosen one at length beside them. */
function ViewsOfTheProject({ connection, searchText }: { connection: TatoAppViewConnection; searchText: string }) {
  const studioViewsReading = useViewReading(connection.watchStudioViews);
  const [chosenViewRowId, setChosenViewRowId] = useState<string | null>(null);
  if (studioViewsReading === null) return <WaitingState title="Reading the views" data-library-state="waiting" />;
  const viewGroups = libraryViewGroupsOf(studioViewsReading, searchText);
  const viewsListed = viewGroups.flatMap((viewGroup) => viewGroup.studio_views);
  const chosenView = viewsListed.find((studioView) => libraryViewRowIdOf(studioView) === chosenViewRowId) ?? viewsListed[0] ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-views="">
      {studioViewsReading.kind === "not_listed" && <RefusalLine layout="bar" lead="The project's views could not be listed:" words={studioViewsReading.because} data-library-views-not-listed="" />}
      {viewsListed.length === 0 || chosenView === null ? (
        searchText.trim() === "" ? (
          <WaitingState title="No views" data-library-state="no_views" />
        ) : (
          <WaitingState title={`No view matches “${searchText.trim()}”`} data-library-state="no_view_matches" />
        )
      ) : (
        <div className="flex min-h-0 flex-1">
          <SectionNavigationList
            label="Views"
            width="wide"
            sectionGroups={viewGroups.map((viewGroup) => ({
              groupLabel: viewGroup.brought_by,
              sections: viewGroup.studio_views.map((studioView) => ({
                section_id: libraryViewRowIdOf(studioView),
                label: `${studioView.title} · ${studioViewPortsWords(studioView)}`,
                icon: studioIconNamed(studioView.placement === null ? "unreadable" : "project_view"),
              })),
            }))}
            shownSectionId={libraryViewRowIdOf(chosenView)}
            onSectionChosen={setChosenViewRowId}
            dataAttributeOfEachSection="data-library-view"
          />
          <DetailsOfTheView studioView={chosenView} />
        </div>
      )}
    </div>
  );
}

/** The open project's node types or graph generators, by source, as the runtime reads them from source. */
function DeclarationsOfTheProject({ connection, projectFolder, declarationsShown }: { connection: TatoAppViewConnection; projectFolder: string; declarationsShown: LibraryDeclarationsShown }) {
  const watchTheProjectsNodeTypes = useCallback(
    (listener: (reading: ProjectNodeTypesReading) => void): StopWatching => connection.watchProjectNodeTypes(projectFolder, listener),
    [connection, projectFolder],
  );
  const nodeTypesReading = useViewReading(watchTheProjectsNodeTypes);
  const settings = useViewReading(connection.watchSettings);
  const [expansionChoices, toggleTheRow] = useRowExpansionKeptInSettings(connection.rememberSettings, settings);
  const [chosenRowId, setChosenRowId] = useState<string | null>(null);
  const [openingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const libraryRows = useMemo(
    () => (nodeTypesReading?.kind === "listed" ? libraryTreeOfTheListing(nodeTypesReading.listing, expansionChoices, declarationsShown) : []),
    [nodeTypesReading, expansionChoices, declarationsShown],
  );
  if (nodeTypesReading === null) return <WaitingState title="Reading the project's node types" data-library-state="waiting" />;
  if (nodeTypesReading.kind === "not_listed") {
    return (
      <WaitingState isFailure title="The runtime lists no node types" data-library-state="not_listed">
        <RuntimeFailureWords words={nodeTypesReading.because} data-library-not-listed-because="" />
      </WaitingState>
    );
  }
  if (libraryRows.length === 0 && declarationsShown === "graph_generators")
    return <WaitingState title="No graph generators" explanation="Neither the project nor anything it imports declares one." data-library-state="no_graph_generators" />;
  const meaningOfRow = (rowId: string): LibraryRowMeaning => libraryRows.find((libraryRow) => libraryRow.row.row_id === rowId)?.meaning ?? { kind: "nothing_to_select" };
  const chosenMeaning = chosenRowId === null ? null : meaningOfRow(chosenRowId);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-declarations={declarationsShown}>
      <RefusalOfTheLatestAskBar refusal={openingRefusal} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <TreeView
          label={LIBRARY_SHOWN_WORDS[declarationsShown]}
          rows={libraryRows.map((libraryRow) => libraryRow.row)}
          selectedRowId={chosenMeaning === null || chosenMeaning.kind === "nothing_to_select" ? null : chosenRowId}
          onRowSelected={(rowId) => setChosenRowId(meaningOfRow(rowId).kind === "nothing_to_select" ? null : rowId)}
          onRowActivated={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind !== "nothing_to_select" && meaning.file !== null) showTheRefusalOf("Didn't open the file:", connection.openView("code", { kind: "file", file: meaning.file }));
          }}
          onExpansionToggled={toggleTheRow}
        />
      </div>
      {chosenMeaning !== null && chosenMeaning.kind !== "nothing_to_select" && (
        <div className="scrollbar-thin max-h-[55%] shrink-0 overflow-y-auto border-t">
          <DetailsOfTheDeclaration declaration={chosenMeaning} />
        </div>
      )}
    </div>
  );
}

/** The chosen asset: its file's name and path, what it is, its UUID, its bytes' digest and size, and each setting its import took. */
function DetailsOfTheAsset({ asset, onHidden }: { asset: ProjectAsset; onHidden: () => void }) {
  const importSettings = Object.entries(asset.import_settings);
  return (
    <SidePanel
      label="Chosen asset"
      title={assetFileName(asset.path)}
      subtitle={<span className="font-mono">{asset.path}</span>}
      hiding={{ hideLabel: "Hide details", onHidden }}
      data-library-asset-details={asset.asset}
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <KeyValueRows
          rows={[
            ["Kind", asset.kind],
            [
              "UUID",
              <span className="font-mono" title={asset.asset}>
                {shortenedDigest(asset.asset)}
              </span>,
            ],
            [
              "Content",
              <span className="font-mono" title={asset.content_sha256}>
                sha256 {shortenedDigest(asset.content_sha256)}
              </span>,
            ],
            ["Size", byteLengthInWords(asset.content_byte_len)],
          ]}
        />
        <PropertySection title="Import settings">
          {importSettings.length === 0 ? (
            <p className="px-1 text-xs text-fg-3">None</p>
          ) : (
            <div className="px-1 pb-2">
              <KeyValueRows look="fields" rows={importSettings.map(([key, value]): KeyValueRow => [key, <span className="font-mono break-all">{JSON.stringify(value)}</span>])} />
            </div>
          )}
        </PropertySection>
      </div>
    </SidePanel>
  );
}

/** The folder of the open project's assets the Library shows, and the asset chosen in it. */
interface AssetsShownInTheLibrary {
  shownFolderId: string;
  chosenAssetUuid: string | null;
}

/** The open project's assets as the runtime lists them: its folders down the left, the chosen folder's assets as cards, and the chosen asset's details. */
function AssetsOfTheProject({
  assetsReading,
  searchText,
  assetsShown: { shownFolderId, chosenAssetUuid },
  onAssetsShownChanged,
}: {
  assetsReading: ProjectAssetsReading | null;
  searchText: string;
  assetsShown: AssetsShownInTheLibrary;
  onAssetsShownChanged: (assetsShown: AssetsShownInTheLibrary) => void;
}) {
  if (assetsReading === null) return <WaitingState title="Reading the project's assets" data-library-state="waiting" />;
  if (assetsReading.kind === "not_listed") {
    return (
      <WaitingState isFailure title="The runtime lists no assets" data-library-state="not_listed">
        <RuntimeFailureWords words={assetsReading.because} data-library-not-listed-because="" />
      </WaitingState>
    );
  }
  const assets = assetsTheLibraryLists(assetsReading.listing);
  const folders = libraryAssetFoldersOf(assets);
  const folderShown = assetFolderIdShownOf(folders, shownFolderId);
  const assetsInTheFolder = assetsShownInTheFolder(assets, folderShown, searchText);
  const chosenAsset = assetsInTheFolder.find((asset) => asset.asset === chosenAssetUuid) ?? null;
  const folderShownLabel = folders.find((folder) => folder.folder_id === folderShown)?.label ?? "this folder";
  const noAssetShown = noAssetShownWords(assets.length, folderShownLabel, searchText);
  return (
    <div className="flex min-h-0 flex-1" data-library-assets="">
      <SectionNavigationList
        label="Folders of the project's assets"
        width="wide"
        sectionGroups={[
          {
            groupLabel: "Folders",
            sections: folders.map((folder) => ({ section_id: folder.folder_id, label: folder.label, icon: folder.folder_id === EVERY_ASSET_FOLDER_ID ? Boxes : Folder, count: folder.asset_count })),
          },
        ]}
        shownSectionId={folderShown}
        onSectionChosen={(folderId) => onAssetsShownChanged({ shownFolderId: folderId, chosenAssetUuid })}
        dataAttributeOfEachSection="data-library-asset-folder"
      />
      <WorkAreaWithSidePanel
        sidePanel={chosenAsset === null ? null : <DetailsOfTheAsset asset={chosenAsset} onHidden={() => onAssetsShownChanged({ shownFolderId, chosenAssetUuid: null })} />}
      >
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto p-3">
          {assetsInTheFolder.length === 0 ? (
            <WaitingState title={noAssetShown.title} explanation={noAssetShown.explanation} data-library-state={assets.length === 0 ? "no_assets" : "no_asset_matches"} />
          ) : (
            <CardGrid size="studio_compact" label={`Assets in ${folderShownLabel}`}>
              {assetsInTheFolder.map((asset) => (
                <ProjectAssetCard
                  key={asset.asset}
                  name={assetFileName(asset.path)}
                  kindAndSizeWords={assetKindAndSizeWords(asset)}
                  pictureTone={assetPictureToneOf(asset)}
                  pictureWords={assetFormatWords(asset)}
                  isSelected={asset.asset === chosenAsset?.asset}
                  onSelected={() => onAssetsShownChanged({ shownFolderId, chosenAssetUuid: asset.asset })}
                  data-library-asset={asset.path}
                />
              ))}
            </CardGrid>
          )}
        </div>
      </WorkAreaWithSidePanel>
    </div>
  );
}

/** What the Library keeps for the project it shows: the asset search, the folder and asset shown, whether an import is under way, and the latest import's refusals. */
interface LibraryOfTheProjectChoices {
  projectFolder: string | null;
  searchText: string;
  assetsShown: AssetsShownInTheLibrary;
  isImporting: boolean;
  importRefusals: readonly LibraryImportRefusal[];
}

function libraryChoicesForANewProject(projectFolder: string | null): LibraryOfTheProjectChoices {
  return { projectFolder, searchText: "", assetsShown: { shownFolderId: EVERY_ASSET_FOLDER_ID, chosenAssetUuid: null }, isImporting: false, importRefusals: [] };
}

const WATCH_NOTHING = (): StopWatching => () => undefined;

/** The Library's body under its header row: why there is no project, or what Show chose of it. */
function LibraryBody({
  connection,
  openProject,
  shown,
  assetsReading,
  choices,
  onAssetsShownChanged,
}: {
  connection: TatoAppViewConnection;
  openProject: OpenProjectReading | null;
  shown: LibraryShown;
  assetsReading: ProjectAssetsReading | null;
  choices: LibraryOfTheProjectChoices;
  onAssetsShownChanged: (assetsShown: AssetsShownInTheLibrary) => void;
}) {
  if (openProject === null) return null;
  if (shown === "views") return <ViewsOfTheProject connection={connection} searchText={choices.searchText} />;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  const projectFolder = openProject.open_project.project.folder;
  if (shown !== "assets") return <DeclarationsOfTheProject key={`${projectFolder}/${shown}`} connection={connection} projectFolder={projectFolder} declarationsShown={shown} />;
  return (
    <>
      {choices.importRefusals.map((importRefusal, refusalIndex) => (
        <RefusalLine key={refusalIndex} layout="bar" lead={importRefusal.lead} words={importRefusal.because} data-library-import-refused="" />
      ))}
      <AssetsOfTheProject assetsReading={assetsReading} searchText={choices.searchText} assetsShown={choices.assetsShown} onAssetsShownChanged={onAssetsShownChanged} />
    </>
  );
}

/** The Library view's whole frame: what the project can use, as node types, generators or assets, chosen in its header row's Show menu, and for its assets a search and Import asset…. */
export function LibraryView({ connection }: { connection: TatoAppViewConnection }) {
  const [shown, setShown] = useState<LibraryShown>("node_types");
  const openProject = useViewReading(connection.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const watchTheProjectsAssets = useCallback(
    (listener: (reading: ProjectAssetsReading) => void): StopWatching => (projectFolder === null || shown !== "assets" ? WATCH_NOTHING() : connection.watchProjectAssets(projectFolder, listener)),
    [connection, projectFolder, shown],
  );
  const assetsReading = useViewReading(watchTheProjectsAssets);
  const [choicesKept, setChoicesKept] = useState<LibraryOfTheProjectChoices>(() => libraryChoicesForANewProject(projectFolder));
  const choices = choicesKept.projectFolder === projectFolder ? choicesKept : libraryChoicesForANewProject(projectFolder);
  const changeTheChoices = (change: Partial<LibraryOfTheProjectChoices>) =>
    setChoicesKept((latest) => ({ ...(latest.projectFolder === projectFolder ? latest : libraryChoicesForANewProject(projectFolder)), ...change }));
  const importTheFilesThePersonChooses = (folderOfTheProject: string) => {
    changeTheChoices({ isImporting: true, importRefusals: [] });
    void connection.importAssetsIntoTheProject(folderOfTheProject).then((importing) => {
      const firstImported = importing.kind === "imported" ? importing.assets_imported.imported[0] : undefined;
      setChoicesKept((latest) =>
        latest.projectFolder !== folderOfTheProject
          ? latest
          : {
              ...latest,
              isImporting: false,
              importRefusals: importRefusalsOf(importing),
              ...(firstImported === undefined ? {} : { searchText: "", assetsShown: { ...latest.assetsShown, chosenAssetUuid: firstImported.asset } }),
            },
      );
    });
  };
  const importDisabledReason = choices.isImporting ? "Importing the files chosen…" : assetsReading?.kind === "not_listed" ? "The runtime lists no assets for this project now." : null;
  return (
    <CoreViewFrame
      connection={connection}
      toolbarLabel="Library tools"
      toolbarTools={
        <>
          <StudioAreaHeaderChoiceMenu leadingWord="Show" words={LIBRARY_SHOWN_WORDS[shown]} label={`Show: ${LIBRARY_SHOWN_WORDS[shown]}`} data-library-shown={shown}>
            <MenuSingleChoiceGroup
              choices={LIBRARY_SHOWN_CHOICES}
              chosen={shown}
              onChosen={(shownNext) => {
                setShown(shownNext);
                changeTheChoices({ searchText: "" });
              }}
              dataAttributeOfEachChoice="data-library-shown-choice"
              closesTheMenuOnChoice
            />
          </StudioAreaHeaderChoiceMenu>
          {shown === "views" && (
            <span className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
              <SearchField label="Search views" placeholder="Search views" text={choices.searchText} onTextChanged={(searchText) => changeTheChoices({ searchText })} data-library-view-search="" />
            </span>
          )}
          {shown === "assets" && projectFolder !== null && (
            <span className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
              <SearchField label="Search assets" placeholder="Search assets" text={choices.searchText} onTextChanged={(searchText) => changeTheChoices({ searchText })} data-library-asset-search="" />
              <ActionButton
                appearance="quiet"
                size="small"
                icon={FilePlus2}
                label="Import asset…"
                tooltip="Copy files into the project, each into its kind's folder"
                disabledReason={importDisabledReason}
                onPressed={() => importTheFilesThePersonChooses(projectFolder)}
                data-library-import-asset=""
              >
                {choices.isImporting ? "Importing…" : "Import asset…"}
              </ActionButton>
            </span>
          )}
        </>
      }
    >
      <LibraryBody
        connection={connection}
        openProject={openProject}
        shown={shown}
        assetsReading={assetsReading}
        choices={choices}
        onAssetsShownChanged={(assetsShown) => changeTheChoices({ assetsShown })}
      />
    </CoreViewFrame>
  );
}
