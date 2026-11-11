import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useEffect, useMemo, useState } from "react";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import {
  outlinerRowIdOfTheSelection,
  outlinerTreeOfTheProject,
  streamsTheOutlinerShows,
  type OutlinerRowExpansionChoices,
  type OutlinerStreamGraphReadings,
} from "./outliner_tree_of_the_project";

const NO_STREAMS_LISTED: readonly string[] = [];

/** The latest graph of each stream of `streams`, by stream id, watched for as long as the stream is among them. */
function useGraphsOfTheStreams(connection: TatoAppViewConnection, streams: readonly string[]): OutlinerStreamGraphReadings {
  const [graphsByStream, setGraphsByStream] = useState<OutlinerStreamGraphReadings>({});
  const streamsKey = streams.join("\n");
  useEffect(() => {
    const watchedStreams = streamsKey === "" ? [] : streamsKey.split("\n");
    setGraphsByStream((graphsSoFar) =>
      Object.keys(graphsSoFar).every((stream) => watchedStreams.includes(stream)) ? graphsSoFar : Object.fromEntries(Object.entries(graphsSoFar).filter(([stream]) => watchedStreams.includes(stream))),
    );
    const stopWatchingEach = watchedStreams.map((stream) =>
      connection.watchStreamGraph(stream, (reading: StreamGraphReading) => setGraphsByStream((graphsSoFar) => ({ ...graphsSoFar, [stream]: reading }))),
    );
    return () => {
      for (const stopWatching of stopWatchingEach) stopWatching();
    };
  }, [connection, streamsKey]);
  return graphsByStream;
}

/** The open project's streams as a tree, each holding its groups and its nodes. */
function OutlinerBody({ connection }: { connection: TatoAppViewConnection }) {
  const openProject = useViewReading(connection.watchOpenProject);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const selection = useViewReading(connection.watchSelection);
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const shownStreams = useMemo(
    () => (openProject?.kind === "read" && listedStreams !== null ? streamsTheOutlinerShows(openProject.open_project, listedStreams) : NO_STREAMS_LISTED),
    [openProject, listedStreams],
  );
  const streamGraphs = useGraphsOfTheStreams(connection, shownStreams);
  const settings = useViewReading(connection.watchSettings);
  const [expansionChoices, toggleTheRow]: [OutlinerRowExpansionChoices, (rowId: string, expand: boolean) => void] = useRowExpansionKeptInSettings(connection.rememberSettings, settings);
  const [askRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const outlinerRows = useMemo(
    () =>
      openProject?.kind === "read"
        ? outlinerTreeOfTheProject(openProject.open_project, listedStreams ?? { kind: "not_listed", because: "" }, streamGraphs, activeStreamTab?.stream ?? null, expansionChoices)
        : [],
    [openProject, listedStreams, streamGraphs, activeStreamTab, expansionChoices],
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
            if (meaning.kind === "stream") showTheRefusalOf("Didn't select:", connection.select({ kind: "stream", stream: meaning.stream, project_folder: meaning.project_folder }));
            if (meaning.kind === "node") showTheRefusalOf("Didn't select:", connection.select({ kind: "node", stream: meaning.stream, node: meaning.node }));
          }}
          onRowActivated={(rowId) => {
            const meaning = meaningOfRow(rowId);
            if (meaning.kind === "stream" || meaning.kind === "node") {
              showTheRefusalOf("Didn't open the stream:", connection.openStreamTab({ stream: meaning.stream, project_name: meaning.project_name, display_name: meaning.display_name }));
            }
          }}
          onExpansionToggled={toggleTheRow}
        />
      </div>
    </>
  );
}

/** The Outliner view's whole frame: the open project's streams as a tree, under its header row. */
export function OutlinerView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Outliner tools">
      <OutlinerBody connection={connection} />
    </CoreViewFrame>
  );
}
