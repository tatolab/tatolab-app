import { useViewReading } from "@tatolab/tato-app-view-sdk/kit/view_readings";
import { useCallback, useMemo } from "react";
import { TreeView } from "@tatolab/tato-app-view-sdk/kit/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/kit/waiting_state";
import type { JsonValue, ProjectNodeTypesReading, StopWatching, StudioViewHostConnection, StudioViewType } from "../../view_host/studio_view_contract";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheProject, type OutlinerRowExpansionChoices } from "./outliner_tree_of_the_project";

/** What an outliner area keeps with the layout: the rows the person opened or closed. */
export type OutlinerSettings = { row_expansion: { [rowId: string]: boolean } };

function outlinerSettingsFrom(savedSettings: JsonValue): OutlinerSettings | null {
  if (typeof savedSettings !== "object" || savedSettings === null || Array.isArray(savedSettings)) return null;
  const rowExpansion = savedSettings["row_expansion"];
  if (typeof rowExpansion !== "object" || rowExpansion === null || Array.isArray(rowExpansion)) return null;
  const choices: { [rowId: string]: boolean } = {};
  for (const [rowId, isOpen] of Object.entries(rowExpansion)) {
    if (typeof isOpen !== "boolean") return null;
    choices[rowId] = isOpen;
  }
  return { row_expansion: choices };
}

const NO_PROJECT_FOLDER_TO_LIST: StopWatching = () => undefined;

/** The open project as a tree: the open project, its streams and node types, then its read-only imports. */
function OutlinerBody({ connection }: { connection: StudioViewHostConnection<OutlinerSettings> }) {
  const openProject = useViewReading(connection.watchOpenProject);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const selection = useViewReading(connection.watchSelection);
  const openProjectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const watchTheOpenProjectsNodeTypes = useCallback(
    (listener: (reading: ProjectNodeTypesReading) => void): StopWatching =>
      openProjectFolder === null ? NO_PROJECT_FOLDER_TO_LIST : connection.watchProjectNodeTypes(openProjectFolder, listener),
    [connection, openProjectFolder],
  );
  const projectNodeTypes = useViewReading(watchTheOpenProjectsNodeTypes);
  const expansionChoices: OutlinerRowExpansionChoices = connection.settings.row_expansion;
  const outlinerRows = useMemo(
    () =>
      openProject?.kind === "read"
        ? outlinerTreeOfTheProject(openProject.open_project, listedStreams ?? { kind: "not_listed", because: "" }, projectNodeTypes, expansionChoices)
        : [],
    [openProject, listedStreams, projectNodeTypes, expansionChoices],
  );
  if (openProject === null) return null;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  const meaningOfRow = (rowId: string) => outlinerRows.find((outlinerRow) => outlinerRow.row.row_id === rowId)?.meaning ?? { kind: "nothing_to_select" as const };
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-outliner="">
      <TreeView
        label="Outliner"
        rows={outlinerRows.map((outlinerRow) => outlinerRow.row)}
        selectedRowId={selection === null ? null : outlinerRowIdOfTheSelection(selection)}
        onRowSelected={(rowId) => {
          const meaning = meaningOfRow(rowId);
          if (meaning.kind === "project") connection.select({ kind: "project", project_name: meaning.project_name, project_folder: meaning.project_folder });
          if (meaning.kind === "stream") connection.select({ kind: "stream", stream: meaning.stream, project_folder: meaning.project_folder });
        }}
        onRowActivated={(rowId) => {
          const meaning = meaningOfRow(rowId);
          if (meaning.kind === "stream") connection.openStreamTab({ stream: meaning.stream, project_name: meaning.project_name, display_name: meaning.display_name });
          if ((meaning.kind === "node_type_declaration" || meaning.kind === "graph_generator_declaration" || meaning.kind === "unreadable_module") && meaning.file !== null) {
            connection.openCodeFile(meaning.file);
          }
        }}
        onExpansionToggled={(rowId, expand) => connection.rememberSettings({ row_expansion: { ...expansionChoices, [rowId]: expand } })}
      />
    </div>
  );
}

/** The outliner: the open project, its streams and node types, and its imports. */
export const OUTLINER_VIEW_TYPE: StudioViewType<OutlinerSettings> = {
  view_type_id: "outliner",
  title: "Outliner",
  icon: "outliner",
  brought_by: { kind: "built_in" },
  default_settings: { row_expansion: {} },
  settingsFromSavedLayout: outlinerSettingsFrom,
  renderStudioView: (connection) => ({ header_tools: null, body: <OutlinerBody connection={connection} /> }),
};
