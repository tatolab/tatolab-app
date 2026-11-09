import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useMemo, useState } from "react";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { NodeGraphPinMark, nodeGraphPinFamilyWords } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { PropertySection } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { ProjectNodeTypePort, ProjectNodeTypesReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { rowExpansionChoicesOf } from "../shared/row_expansion_settings";
import { whereTheModuleStoppedTheParser, type DeclarationRowMeaning } from "../shared/node_type_listing_tree";
import { paletteTreeOfTheListing, type PaletteRowMeaning } from "./palette_tree_of_the_listing";

function PortsOfTheDeclaration({ direction, ports }: { direction: "In" | "Out"; ports: ProjectNodeTypePort[] | null }) {
  if (ports === null) return <p className="px-1 text-xs text-fg-3">{direction === "In" ? "Inputs" : "Outputs"} stated only by its native half</p>;
  return ports.map((port) => (
    <div key={`${direction}:${port.name}`} className="flex h-6 min-w-0 items-center gap-2 text-xs" title={port.description === "" ? (port.annotation ?? undefined) : port.description} data-palette-port={port.name}>
      <span className="w-6 shrink-0 text-right text-2xs text-fg-3">{direction}</span>
      <NodeGraphPinMark family={port.family} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{port.name}</span>
      <span className="shrink-0 text-fg-3">{port.family === null ? (port.annotation ?? "Family not stated") : nodeGraphPinFamilyWords(port.family)}</span>
    </div>
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
          <PropertySection title="Node type" data-palette-details={nodeType.type}>
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
          <PropertySection title="Graph generator" data-palette-details={graphGenerator.generator}>
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
        <PropertySection title={`${declaration.unreadable_module.module} does not parse`} data-palette-details={declaration.unreadable_module.module}>
          <div className="px-1 pb-1 font-mono text-xs text-fg-3">{whereTheModuleStoppedTheParser(declaration.unreadable_module)}</div>
          <div className="px-1 pb-2">
            <RuntimeFailureWords words={declaration.unreadable_module.why} data-palette-unreadable-why={declaration.unreadable_module.module} />
          </div>
        </PropertySection>
      );
  }
}

/** The open project's node types and graph generators, by source and category, as the runtime reads them from source. */
function PaletteOfTheProject({ connection, projectFolder }: { connection: TatoAppViewConnection; projectFolder: string }) {
  const watchTheProjectsNodeTypes = useCallback(
    (listener: (reading: ProjectNodeTypesReading) => void): StopWatching => connection.watchProjectNodeTypes(projectFolder, listener),
    [connection, projectFolder],
  );
  const nodeTypesReading = useViewReading(watchTheProjectsNodeTypes);
  const settings = useViewReading(connection.watchSettings);
  const expansionChoices = useMemo(() => rowExpansionChoicesOf(settings), [settings]);
  const [chosenRowId, setChosenRowId] = useState<string | null>(null);
  const paletteRows = useMemo(
    () => (nodeTypesReading?.kind === "listed" ? paletteTreeOfTheListing(nodeTypesReading.listing, expansionChoices) : []),
    [nodeTypesReading, expansionChoices],
  );
  if (nodeTypesReading === null) return <WaitingState title="Reading the project's node types" data-palette-state="waiting" />;
  if (nodeTypesReading.kind === "not_listed") {
    return (
      <WaitingState isFailure title="The runtime lists no node types" data-palette-state="not_listed">
        <RuntimeFailureWords words={nodeTypesReading.because} data-palette-not-listed-because="" />
      </WaitingState>
    );
  }
  const meaningOfRow = (rowId: string): PaletteRowMeaning => paletteRows.find((paletteRow) => paletteRow.row.row_id === rowId)?.meaning ?? { kind: "nothing_to_select" };
  const chosenMeaning = chosenRowId === null ? null : meaningOfRow(chosenRowId);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-palette="">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <TreeView
          label="Palette"
          rows={paletteRows.map((paletteRow) => paletteRow.row)}
          selectedRowId={chosenMeaning === null || chosenMeaning.kind === "nothing_to_select" ? null : chosenRowId}
          onRowSelected={(rowId) => setChosenRowId(meaningOfRow(rowId).kind === "nothing_to_select" ? null : rowId)}
          onRowActivated={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind !== "nothing_to_select" && meaning.file !== null) void connection.openView("code", { kind: "file", file: meaning.file });
          }}
          onExpansionToggled={(rowId, expand) => void connection.rememberSettings({ row_expansion: { ...expansionChoices, [rowId]: expand } })}
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

function PaletteBody({ connection }: { connection: TatoAppViewConnection }) {
  const openProject = useViewReading(connection.watchOpenProject);
  if (openProject === null) return null;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  return <PaletteOfTheProject key={openProject.open_project.project.folder} connection={connection} projectFolder={openProject.open_project.project.folder} />;
}

/** The Palette view's whole frame: the node types the project can place, under its header row. */
export function PaletteView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection}>
      <PaletteBody connection={connection} />
    </CoreViewFrame>
  );
}
