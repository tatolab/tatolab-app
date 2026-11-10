import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useMemo } from "react";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { ProjectNodeTypesReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheProject, type OutlinerRowExpansionChoices } from "./outliner_tree_of_the_project";

const NO_PROJECT_FOLDER_TO_LIST: StopWatching = () => undefined;

/** The open project as a tree: the open project, its streams and node types, then its read-only imports. */
function OutlinerBody({ connection }: { connection: TatoAppViewConnection }) {
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
  const settings = useViewReading(connection.watchSettings);
  const [expansionChoices, toggleTheRow]: [OutlinerRowExpansionChoices, (rowId: string, expand: boolean) => void] = useRowExpansionKeptInSettings(connection.rememberSettings, settings);
  const [askRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
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
    <>
      <RefusalOfTheLatestAskBar refusal={askRefusal} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-outliner="">
        <TreeView
          label="Outliner"
          rows={outlinerRows.map((outlinerRow) => outlinerRow.row)}
          selectedRowId={selection === null ? null : outlinerRowIdOfTheSelection(selection)}
          onRowSelected={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind === "project") showTheRefusalOf("Didn't select:", connection.select({ kind: "project", project_name: meaning.project_name, project_folder: meaning.project_folder }));
            if (meaning.kind === "stream") showTheRefusalOf("Didn't select:", connection.select({ kind: "stream", stream: meaning.stream, project_folder: meaning.project_folder }));
          }}
          onRowActivated={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind === "stream") showTheRefusalOf("Didn't open the stream:", connection.openStreamTab({ stream: meaning.stream, project_name: meaning.project_name, display_name: meaning.display_name }));
            if ((meaning.kind === "node_type_declaration" || meaning.kind === "graph_generator_declaration" || meaning.kind === "unreadable_module") && meaning.file !== null) {
              showTheRefusalOf("Didn't open the file:", connection.openView("code", { kind: "file", file: meaning.file }));
            }
          }}
          onExpansionToggled={toggleTheRow}
        />
      </div>
    </>
  );
}

/** The Outliner view's whole frame: the open project as a tree, under its header row. */
export function OutlinerView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection}>
      <OutlinerBody connection={connection} />
    </CoreViewFrame>
  );
}
