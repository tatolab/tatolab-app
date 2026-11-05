import { useMemo } from "react";
import { TreeView } from "../../design_system/tree_view";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import type { JsonValue, StudioViewHostConnection, StudioViewType } from "../../view_host/studio_view_contract";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheWorkspace, type OutlinerRowExpansionChoices } from "./outliner_tree_of_the_workspace";

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

/** The open workspace as a tree: the workspace project and its streams, then its read-only imports. */
function OutlinerBody({ connection }: { connection: StudioViewHostConnection<OutlinerSettings> }) {
  const openWorkspace = useStudioViewReading(connection.watchOpenWorkspace);
  const listedStreams = useStudioViewReading(connection.watchListedStreams);
  const selection = useStudioViewReading(connection.watchSelection);
  const expansionChoices: OutlinerRowExpansionChoices = connection.settings.row_expansion;
  const outlinerRows = useMemo(
    () => (openWorkspace?.kind === "read" ? outlinerTreeOfTheWorkspace(openWorkspace.workspace, listedStreams ?? { kind: "not_listed", because: "" }, expansionChoices) : []),
    [openWorkspace, listedStreams, expansionChoices],
  );
  if (openWorkspace === null) return null;
  if (openWorkspace.kind === "none_open") return <WaitingState title="No workspace is open" explanation="Open or create one from the File menu." />;
  if (openWorkspace.kind === "unreadable") return <WaitingState isFailure title={`${openWorkspace.folder} can't be read`} explanation={openWorkspace.refusal} />;
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
        }}
        onExpansionToggled={(rowId, expand) => connection.rememberSettings({ row_expansion: { ...expansionChoices, [rowId]: expand } })}
      />
    </div>
  );
}

/** The outliner: the open workspace's projects, streams and imports. */
export const OUTLINER_VIEW_TYPE: StudioViewType<OutlinerSettings> = {
  view_type_id: "outliner",
  title: "Outliner",
  icon: "outliner",
  brought_by: { kind: "built_in" },
  default_settings: { row_expansion: {} },
  settingsFromSavedLayout: outlinerSettingsFrom,
  renderStudioView: (connection) => ({ header_tools: null, body: <OutlinerBody connection={connection} /> }),
};
