import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Boxes, FilePlus2, Folder, FolderInput, FolderTree, PencilLine, Trash2, Undo2 } from "lucide-react";
import { MenuItem, MenuSeparator, MenuSingleChoiceGroup, RightClickMenuItem, type MenuSingleChoice } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { ProjectAssetCard } from "@tatolab/tato-app-view-sdk/design_system/project_asset_card";
import { CardGrid } from "@tatolab/tato-app-view-sdk/design_system/card_grid";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { putTheNodeTypeOnTheDrag } from "@tatolab/tato-app-view-sdk/design_system/support/node_type_drag";
import { SectionNavigationList } from "@tatolab/tato-app-view-sdk/design_system/section_navigation_list";
import { StudioAreaHeaderChoiceMenu } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { PropertySection } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { ImportedProject, ProjectAssetPick, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { type NodeTypeDescribedOrWhyNot, type NodeTypePortDescribed, type OpenProjectReading, type ProjectAsset, type ProjectAssetsReading, type StudioViewListed } from "@tatolab/tato-app-view-sdk/studio_readings";
import { exactPinOfTheDeclaredPort } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { pinTypeWords, pinWords } from "@tatolab/tato-app-view-sdk/pin_model/pin_type_words";
import { studioIconNamed } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import { useNodeTypesOfTheProject } from "../shared/use_node_types_of_the_project";
import { CoreViewFrame } from "../shared/core_view_page";
import { codeOfTheNodeType, openTheCodeOfTheNodeType } from "../shared/code_of_the_node_type";
import { CODE_VIEW_TYPE_ID } from "../shared/files_the_code_view_opens";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import { NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS, nodeTypeCategoryPath } from "../shared/node_type_category_path";
import { whereTheModuleStoppedTheParser, type DeclarationRowMeaning } from "../shared/node_type_listing_tree";
import { inputsAWireReaches } from "../shared/stream_graph_edits";
import { LibraryAssetChangeForm, type LibraryAssetChange } from "./library_asset_change_form";
import { LibraryNodeTypeGroupForm, type NodeTypeTheLibraryLists } from "./library_node_type_group_form";
import { previewPictureNotReadBecauseOf, previewPictureUrlOf } from "./library_asset_preview_pictures";
import { useAssetPreviewPicturesOfTheProject } from "./use_asset_preview_pictures_of_the_project";
import { projectAssetMediaWords, projectAssetsTheFieldOffers } from "../shared/project_asset_media";
import { libraryTreeOfTheListing, type LibraryDeclarationsShown, type LibraryRowMeaning } from "./library_tree_of_the_listing";
import {
  assetFileName,
  assetFolderIdShownOf,
  assetFormatWords,
  assetKindAndSizeWords,
  assetPictureToneOf,
  assetsShownInTheFolder,
  assetsTheLibraryLists,
  EVERY_ASSET_FOLDER_ID,
  importRefusalsOf,
  libraryAssetFoldersOf,
  type LibraryImportRefusal,
  noAssetShownWords,
} from "./library_assets_of_the_listing";
import { libraryViewGroupsOf, libraryViewRowIdOf, studioViewPortsWords, studioViewShownWhereWords } from "./library_views_of_the_listing";

/** One declared port's row: which way it faces, its name, and its type in words. It draws no pin mark, since a type found with the graph is known only on the canvas. */
function LibraryPortRow({ direction, portName, typeWords, portTitle, dataAttribute }: { direction: "In" | "Out"; portName: string; typeWords: string; portTitle: string | undefined; dataAttribute: "data-library-port" | "data-library-view-port" }) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-2 text-xs" title={portTitle} {...{ [dataAttribute]: portName }}>
      <span className="w-6 shrink-0 text-right text-2xs text-fg-3">{direction}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{portName}</span>
      <span className="shrink-0 text-fg-3">{typeWords}</span>
    </div>
  );
}

/** What a described port carries, in words: the pin type it states exactly, else its annotation as written, else that it states no exact type. */
function describedPortTypeWords(port: NodeTypePortDescribed & { annotation?: string | null }): string {
  const pin = exactPinOfTheDeclaredPort(port);
  if (pin !== null) return pinTypeWords(pin.pin_type);
  return port.annotation === undefined || port.annotation === null || port.annotation === "" ? pinWords(null) : port.annotation;
}

function PortsOfTheDeclaration({ direction, ports }: { direction: "In" | "Out"; ports: readonly (NodeTypePortDescribed & { annotation?: string | null })[] }) {
  return ports.map((port) => (
    <LibraryPortRow
      key={`${direction}:${port.name}`}
      direction={direction}
      portName={port.name}
      typeWords={describedPortTypeWords(port)}
      portTitle={port.documentation === "" ? (port.annotation ?? undefined) : port.documentation}
      dataAttribute="data-library-port"
    />
  ));
}

/** A node type's ports as its description states them, each input a wire reaches and each output; why the runtime has no description, in its words. */
function PortsOfTheNodeType({ described }: { described: NodeTypeDescribedOrWhyNot | null }) {
  if (described === null) return <p className="px-1 text-xs text-fg-3">Not described</p>;
  if ("not_described_because" in described) {
    return (
      <div className="px-1 pb-2">
        <RuntimeFailureWords words={described.not_described_because.runtime_words} data-library-not-described-because={described.node_type} />
      </div>
    );
  }
  const inputs = inputsAWireReaches(described);
  if (inputs.length === 0 && described.outputs.length === 0) return <p className="px-1 text-xs text-fg-3">None</p>;
  return (
    <>
      <PortsOfTheDeclaration direction="In" ports={inputs} />
      <PortsOfTheDeclaration direction="Out" ports={described.outputs} />
    </>
  );
}

/** Who files a node type under its group, in words: the project, an import, or the author who declared it. */
const NODE_TYPE_FILED_BY_WORDS: Record<NonNullable<NodeTypeTheLibraryLists["category_from"]>, string> = { project: "This project", import: "An import", declaration: "Its author" };

function placeInWords(path: string | null, line: number | null): string {
  if (path === null) return "Not stated";
  return line === null ? path : `${path}:${line}`;
}

/** The chosen row's declaration: what it is, where it is declared, and its ports or promoted config; for a module that does not parse, why, in the parser's words. */
function DetailsOfTheDeclaration({ declaration, nodeTypeActions }: { declaration: DeclarationRowMeaning; nodeTypeActions: ReactNode }) {
  switch (declaration.kind) {
    case "node_type_declaration": {
      const { node_type: nodeType, described } = declaration;
      const declaredAt = described === null || "not_described_because" in described ? null : (described.declared_at ?? null);
      const facts: KeyValueRow[] = [
        ["Type", <span className="font-mono">{nodeType.node_type}</span>],
        ["Kind", nodeType.kind ?? "Not stated"],
        ["Group", nodeTypeCategoryPath(nodeType.category ?? null).join(" / ") || NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS],
        ...(nodeType.category_from === undefined || nodeType.category_from === null ? [] : [["Filed by", NODE_TYPE_FILED_BY_WORDS[nodeType.category_from]] satisfies KeyValueRow]),
        ["From", declaration.source_title],
        ["Declared", <span className="font-mono">{placeInWords(declaredAt?.path ?? null, declaredAt?.line ?? null)}</span>],
      ];
      return (
        <>
          <PropertySection title="Node type" data-library-details={nodeType.node_type}>
            {nodeType.documentation !== "" && <p className="px-1 pb-2 text-xs text-fg-2">{nodeType.documentation}</p>}
            <div className="px-1 pb-2">
              <KeyValueRows rows={facts} />
            </div>
            <div className="flex flex-wrap gap-2 px-1 pb-2">{nodeTypeActions}</div>
          </PropertySection>
          <PropertySection title="Ports">
            <PortsOfTheNodeType described={described} />
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
            {graphGenerator.promoted_settings.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              <div className="px-1 pb-2">
                <KeyValueRows look="fields" rows={graphGenerator.promoted_settings.map((setting): KeyValueRow => [setting.name, setting.annotation ?? ""])} />
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
      typeWords={pinTypeWords(port.pin_type)}
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
function DeclarationsOfTheProject({
  connection,
  projectFolder,
  imports,
  declarationsShown,
}: {
  connection: TatoAppViewConnection;
  projectFolder: string;
  imports: readonly ImportedProject[];
  declarationsShown: LibraryDeclarationsShown;
}) {
  const nodeTypesReading = useNodeTypesOfTheProject(connection, projectFolder);
  const settings = useViewReading(connection.watchSettings);
  const [expansionChoices, toggleTheRow] = useRowExpansionKeptInSettings(connection.rememberSettings, settings);
  const [chosenRow, setChosenRow] = useState<{ rowId: string; nodeType: string | null } | null>(null);
  const [openingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const [nodeTypeMoveAsked, setNodeTypeMoveAsked] = useState<NodeTypeTheLibraryLists | null>(null);
  const libraryRows = useMemo(
    () => (nodeTypesReading?.kind === "listed" ? libraryTreeOfTheListing(nodeTypesReading.node_types, expansionChoices, declarationsShown) : []),
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
  const chooseTheRow = (rowId: string) => {
    const meaning = meaningOfRow(rowId);
    setChosenRow(meaning.kind === "nothing_to_select" ? null : { rowId, nodeType: meaning.kind === "node_type_declaration" ? meaning.node_type.node_type : null });
  };
  // A node type moved into another group is listed under another row; the choice follows the node type there.
  const chosenRowId =
    chosenRow === null
      ? null
      : meaningOfRow(chosenRow.rowId).kind !== "nothing_to_select"
        ? chosenRow.rowId
        : (libraryRows.find(({ meaning }) => meaning.kind === "node_type_declaration" && meaning.node_type.node_type === chosenRow.nodeType)?.row.row_id ?? null);
  const chosenMeaning = chosenRowId === null ? null : meaningOfRow(chosenRowId);
  const putTheNodeTypeBack = (nodeType: NodeTypeTheLibraryLists) =>
    showTheRefusalOf("The node type wasn't put back:", connection.setNodeTypeGroupInTheProject(projectFolder, nodeType.node_type, null));
  const rightClickChoicesOfRow = (rowId: string) => {
    const meaning = meaningOfRow(rowId);
    if (meaning.kind !== "node_type_declaration") return null;
    const nodeType = meaning.node_type;
    return (
      <>
        <RightClickMenuItem icon={FolderTree} onChosen={() => setNodeTypeMoveAsked(nodeType)} data-library-node-type-choice="move_to_group">
          Move to group…
        </RightClickMenuItem>
        {nodeType.category_from === "project" && (
          <RightClickMenuItem icon={Undo2} onChosen={() => putTheNodeTypeBack(nodeType)} data-library-node-type-choice="put_back">
            Put back in its own group
          </RightClickMenuItem>
        )}
      </>
    );
  };
  const nodeTypeActionsOf = (declaration: DeclarationRowMeaning): ReactNode => {
    if (declaration.kind !== "node_type_declaration") return null;
    const nodeType = declaration.node_type;
    return (
      <>
        <ActionButton appearance="quiet" size="small" onPressed={() => setNodeTypeMoveAsked(nodeType)} data-library-node-type-action="move_to_group">
          Move to group…
        </ActionButton>
        {nodeType.category_from === "project" && (
          <ActionButton appearance="quiet" size="small" onPressed={() => putTheNodeTypeBack(nodeType)} data-library-node-type-action="put_back">
            Put back in its own group
          </ActionButton>
        )}
      </>
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-declarations={declarationsShown}>
      <RefusalOfTheLatestAskBar refusal={openingRefusal} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {nodeTypeMoveAsked !== null && (
          <LibraryNodeTypeGroupForm key={nodeTypeMoveAsked.node_type} nodeType={nodeTypeMoveAsked} projectFolder={projectFolder} connection={connection} onClosed={() => setNodeTypeMoveAsked((asked) => (asked?.node_type === nodeTypeMoveAsked.node_type ? null : asked))} />
        )}
        <TreeView
          label={LIBRARY_SHOWN_WORDS[declarationsShown]}
          rows={libraryRows.map((libraryRow) => libraryRow.row)}
          selectedRowId={chosenMeaning === null || chosenMeaning.kind === "nothing_to_select" ? null : chosenRowId}
          onRowSelected={chooseTheRow}
          onRowActivated={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind === "node_type_declaration") showTheRefusalOf("Didn't open the code:", openTheCodeOfTheNodeType(connection, codeOfTheNodeType(nodeTypesReading, imports, meaning.node_type.node_type)));
            else if (meaning.kind !== "nothing_to_select" && meaning.file !== null) showTheRefusalOf("Didn't open the file:", connection.openView(CODE_VIEW_TYPE_ID, { kind: "file", file: meaning.file }));
          }}
          onExpansionToggled={toggleTheRow}
          rightClickChoicesOfRow={rightClickChoicesOfRow}
          dragOfTheRow={(rowId) => {
            const meaning = meaningOfRow(rowId);
            return meaning.kind === "node_type_declaration" ? (dataTransfer) => putTheNodeTypeOnTheDrag(dataTransfer, meaning.node_type.node_type) : null;
          }}
        />
      </div>
      {chosenMeaning !== null && chosenMeaning.kind !== "nothing_to_select" && (
        <div className="scrollbar-thin max-h-[55%] shrink-0 overflow-y-auto border-t">
          <DetailsOfTheDeclaration declaration={chosenMeaning} nodeTypeActions={nodeTypeActionsOf(chosenMeaning)} />
        </div>
      )}
    </div>
  );
}

/** The folder of the open project's assets the Library shows, and the asset chosen in it. */
interface AssetsShownInTheLibrary {
  shownFolderId: string;
  chosenAssetUuid: string | null;
}

/** An asset whose card's ⋯ menu asked for Rename, Move or Delete, and which. */
interface LibraryAssetChangeAsked {
  asset: string;
  change: LibraryAssetChange;
}

/** The open project's assets as the runtime lists them: its folders down the left and the chosen folder's assets as cards; in the asset picker, only those of the media it asks for. */
function AssetsOfTheProject({
  connection,
  projectFolder,
  assetsReading,
  searchText,
  assetsShown,
  onAssetsShownChanged,
  assetPick,
}: {
  connection: TatoAppViewConnection;
  projectFolder: string;
  assetsReading: ProjectAssetsReading | null;
  searchText: string;
  assetsShown: AssetsShownInTheLibrary;
  onAssetsShownChanged: (assetsShown: AssetsShownInTheLibrary) => void;
  assetPick: ProjectAssetPick | null;
}) {
  if (assetsReading === null) return <WaitingState title="Reading the project's assets" data-library-state="waiting" />;
  if (assetsReading.kind === "not_listed") {
    return (
      <WaitingState isFailure title="The runtime lists no assets" data-library-state="not_listed">
        <RuntimeFailureWords words={assetsReading.because} data-library-not-listed-because="" />
      </WaitingState>
    );
  }
  const assetsListed = assetsTheLibraryLists(assetsReading.listing);
  return (
    <AssetsOfTheListedProject
      connection={connection}
      projectFolder={projectFolder}
      assets={assetPick === null ? assetsListed : projectAssetsTheFieldOffers(assetsListed, assetPick.media)}
      searchText={searchText}
      assetsShown={assetsShown}
      onAssetsShownChanged={onAssetsShownChanged}
      assetPick={assetPick}
    />
  );
}

/** The ⋯ menu of an asset's card in the Library: Rename…, Move… and Delete…, each opening its form over the cards. */
function LibraryAssetMoreActions({ onChangeAsked }: { onChangeAsked: (change: LibraryAssetChange) => void }) {
  return (
    <>
      <MenuItem icon={PencilLine} onChosen={() => onChangeAsked("rename")} data-library-asset-change="rename">
        Rename…
      </MenuItem>
      <MenuItem icon={FolderInput} onChosen={() => onChangeAsked("move")} data-library-asset-change="move">
        Move…
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Trash2} isDestructive onChosen={() => onChangeAsked("delete")} data-library-asset-change="delete">
        Delete…
      </MenuItem>
    </>
  );
}

/** The listed assets of the open project: its folders down the left and the chosen folder's assets as cards with their preview pictures, each with Rename, Move and Delete in its ⋯ menu; in the asset picker, pressing a card chooses it. */
function AssetsOfTheListedProject({
  connection,
  projectFolder,
  assets,
  searchText,
  assetsShown: { shownFolderId, chosenAssetUuid },
  onAssetsShownChanged,
  assetPick,
}: {
  connection: TatoAppViewConnection;
  projectFolder: string;
  assets: ProjectAsset[];
  searchText: string;
  assetsShown: AssetsShownInTheLibrary;
  onAssetsShownChanged: (assetsShown: AssetsShownInTheLibrary) => void;
  assetPick: ProjectAssetPick | null;
}) {
  const previewPictures = useAssetPreviewPicturesOfTheProject(connection, projectFolder);
  const [changeAsked, setChangeAsked] = useState<LibraryAssetChangeAsked | null>(null);
  const assetsBesideTheFolders = useRef<HTMLDivElement>(null);
  const [choosingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const folders = libraryAssetFoldersOf(assets);
  const folderShown = assetFolderIdShownOf(folders, shownFolderId);
  const assetsInTheFolder = assetsShownInTheFolder(assets, folderShown, searchText);
  const chosenAsset = assets.find((asset) => asset.asset === (assetPick === null ? chosenAssetUuid : assetPick.chosen_now)) ?? null;
  const assetToChange = changeAsked === null ? undefined : assets.find((asset) => asset.asset === changeAsked.asset);
  const folderShownLabel = folders.find((folder) => folder.folder_id === folderShown)?.label ?? "this folder";
  const noAssetShown = noAssetShownWords(assets.length, folderShownLabel, searchText, assetPick === null ? null : projectAssetMediaWords(assetPick.media));
  return (
    <div className="@container/library-assets flex min-h-0 flex-1" data-library-assets="">
      <div className="hidden @2xl/library-assets:flex">
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
      </div>
      <div ref={assetsBesideTheFolders} className="flex min-w-0 flex-1 flex-col">
        <RefusalOfTheLatestAskBar refusal={choosingRefusal} />
        {changeAsked !== null && assetToChange !== undefined && (
          <div className="shrink-0 border-b" data-library-asset-change-form-of={assetToChange.asset}>
            <LibraryAssetChangeForm
              key={`${assetToChange.asset}/${changeAsked.change}`}
              change={changeAsked.change}
              asset={assetToChange}
              projectFolder={projectFolder}
              connection={connection}
              onClosed={() => {
                setChangeAsked(null);
                returnTheFocusToTheMoreActionsMenuOf(assetsBesideTheFolders.current, assetToChange.asset);
              }}
            />
          </div>
        )}
        <div className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
          <div className="pb-2 @2xl/library-assets:hidden">
            <StudioAreaHeaderChoiceMenu leadingWord="Folder" words={folderShownLabel} label={`Folder: ${folderShownLabel}`} data-library-asset-folder-menu="">
              <MenuSingleChoiceGroup
                choices={folders.map((folder) => ({
                  choice: folder.folder_id,
                  label: (
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="truncate">{folder.label}</span>
                      <span className="ml-auto text-fg-3 tabular-nums">{folder.asset_count}</span>
                    </span>
                  ),
                }))}
                chosen={folderShown}
                onChosen={(folderId) => onAssetsShownChanged({ shownFolderId: folderId, chosenAssetUuid })}
                dataAttributeOfEachChoice="data-library-asset-folder-choice"
                closesTheMenuOnChoice
              />
            </StudioAreaHeaderChoiceMenu>
          </div>
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
                  previewPictureUrl={previewPictureUrlOf(previewPictures?.pictureOf(asset) ?? null)}
                  previewPictureNotReadBecause={previewPictureNotReadBecauseOf(previewPictures?.pictureOf(asset) ?? null)}
                  isSelected={asset.asset === chosenAsset?.asset}
                  onSelected={() =>
                    assetPick === null
                      ? onAssetsShownChanged({ shownFolderId, chosenAssetUuid: asset.asset })
                      : showTheRefusalOf("The asset wasn't chosen:", connection.answerTheProjectAssetPick(asset.asset))
                  }
                  moreActions={
                    assetPick === null
                      ? { label: `More for ${assetFileName(asset.path)}`, items: <LibraryAssetMoreActions onChangeAsked={(change) => setChangeAsked({ asset: asset.asset, change })} /> }
                      : undefined
                  }
                  data-library-asset={asset.path}
                  data-library-asset-uuid={asset.asset}
                />
              ))}
            </CardGrid>
          )}
        </div>
      </div>
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
  assetPick,
}: {
  connection: TatoAppViewConnection;
  openProject: OpenProjectReading | null;
  shown: LibraryShown;
  assetsReading: ProjectAssetsReading | null;
  choices: LibraryOfTheProjectChoices;
  onAssetsShownChanged: (assetsShown: AssetsShownInTheLibrary) => void;
  assetPick: ProjectAssetPick | null;
}) {
  if (openProject === null) return null;
  if (shown === "views") return <ViewsOfTheProject connection={connection} searchText={choices.searchText} />;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  const projectFolder = openProject.open_project.project.folder;
  if (shown !== "assets") return <DeclarationsOfTheProject key={`${projectFolder}/${shown}`} connection={connection} projectFolder={projectFolder} imports={openProject.open_project.imports} declarationsShown={shown} />;
  return (
    <>
      {choices.importRefusals.map((importRefusal, refusalIndex) => (
        <RefusalLine key={refusalIndex} layout="bar" lead={importRefusal.lead} words={importRefusal.because} data-library-import-refused="" />
      ))}
      <AssetsOfTheProject
        connection={connection}
        projectFolder={projectFolder}
        assetsReading={assetsReading}
        searchText={choices.searchText}
        assetsShown={choices.assetsShown}
        onAssetsShownChanged={onAssetsShownChanged}
        assetPick={assetPick}
      />
    </>
  );
}

/** The Library view's whole frame: what the project can use, as node types, generators or assets, chosen in its header row's Show menu, and for its assets a search and Import asset…; framed in Studio's asset picker, the assets of the media the pick asks for alone, a card pressed or a file imported answering it. */
/** Focuses the ⋯ menu of the card of the asset `assetUuid` among `cards` once the form over them has gone, so the keyboard carries on from the card it was opened from. */
function returnTheFocusToTheMoreActionsMenuOf(cards: HTMLElement | null, assetUuid: string): void {
  requestAnimationFrame(() => cards?.querySelector<HTMLElement>(`[data-library-asset-uuid="${CSS.escape(assetUuid)}"] ~ * [data-project-asset-more-actions]`)?.focus());
}

export function LibraryView({ connection }: { connection: TatoAppViewConnection }) {
  const [shownInTheMenu, setShown] = useState<LibraryShown>("node_types");
  const assetPick = useViewReading(connection.watchProjectAssetPick);
  const shown = assetPick === null ? shownInTheMenu : "assets";
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
    void connection.importAssetsIntoTheProject(folderOfTheProject, assetPick?.media ?? null).then((importing) => {
      const firstImported = importing.kind === "imported" ? importing.assets_imported.imported[0] : undefined;
      if (assetPick !== null && firstImported !== undefined) {
        void connection.answerTheProjectAssetPick(firstImported.asset).then((answering) => {
          if (answering.kind === "refused") setChoicesKept((latest) => ({ ...latest, importRefusals: [{ lead: "The imported asset wasn't chosen:", because: answering.because }] }));
        });
      }
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
          {assetPick === null && (
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
          )}
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
                tooltip={assetPick === null ? "Copy files into the project, each into its kind's folder" : "Copy a file into the project and choose it"}
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
        assetPick={assetPick}
      />
    </CoreViewFrame>
  );
}
