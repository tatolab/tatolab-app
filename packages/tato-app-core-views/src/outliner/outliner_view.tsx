import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { IconButtonMenu, MenuItem, MenuItemThatCannotBeChosen } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { Plus } from "lucide-react";
import { studioIconNamed } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import { useStreamGraphEditsSentToTheRuntime } from "../shared/stream_graph_edit_sending";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import {
  groupOfTheSelectedNodes,
  outlinerRowIdsOfTheSelection,
  outlinerTreeOfTheProject,
  selectionAfterTheOutlinerPick,
  streamsTheOutlinerShows,
  type OutlinerRowExpansionChoices,
  type OutlinerStreamGraphReadings,
} from "./outliner_tree_of_the_project";

const NO_STREAMS_LISTED: readonly string[] = [];
const NO_ROWS_SELECTED = { picked_last: null, all: new Set<string>() };

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
  const { sendTheGesture, refusalOfTheLatestEdit } = useStreamGraphEditsSentToTheRuntime(connection, openProject?.kind === "read" ? openProject.open_project.project.folder : null);
  const groupOfTheSelection = useMemo(() => groupOfTheSelectedNodes(selection, streamGraphs), [selection, streamGraphs]);
  const groupTheSelectedNodes = useCallback(() => {
    if (groupOfTheSelection.kind === "groups") void sendTheGesture(groupOfTheSelection.actions);
  }, [groupOfTheSelection, sendTheGesture]);
  const groupTheSelectedNodesOnFOrCommandG = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (groupOfTheSelection.kind !== "groups" || keyboardEvent.altKey) return;
    const isF = (keyboardEvent.key === "f" || keyboardEvent.key === "F") && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey;
    const isCommandG = (keyboardEvent.key === "g" || keyboardEvent.key === "G") && (keyboardEvent.metaKey || keyboardEvent.ctrlKey) && !keyboardEvent.shiftKey;
    if (!isF && !isCommandG) return;
    keyboardEvent.preventDefault();
    groupTheSelectedNodes();
  };
  const [searchWords, setSearchWords] = useState("");
  const [expansionChoicesWhileSearching, setExpansionChoicesWhileSearching] = useState<OutlinerRowExpansionChoices>({});
  const isSearching = searchWords.trim() !== "";
  const outlinerRows = useMemo(
    () =>
      openProject?.kind === "read"
        ? outlinerTreeOfTheProject(
            openProject.open_project,
            listedStreams ?? { kind: "not_listed", because: "" },
            streamGraphs,
            activeStreamTab?.stream ?? null,
            isSearching ? expansionChoicesWhileSearching : expansionChoices,
            searchWords,
          )
        : [],
    [openProject, listedStreams, streamGraphs, activeStreamTab, expansionChoices, expansionChoicesWhileSearching, isSearching, searchWords],
  );
  if (openProject === null) return null;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  const rowsOfTheSelection = selection === null ? NO_ROWS_SELECTED : outlinerRowIdsOfTheSelection(selection);
  const meaningOfRow = (rowId: string) => outlinerRows.find((outlinerRow) => outlinerRow.row.row_id === rowId)?.meaning ?? { kind: "nothing_to_select" as const };
  return (
    <>
      <StudioViewToolbarTools label="Outliner search">
        <SearchField
          label="Search the outliner"
          placeholder="Search streams and nodes"
          text={searchWords}
          onTextChanged={(typedWords) => {
            setSearchWords(typedWords);
            setExpansionChoicesWhileSearching({});
          }}
          width="fills_the_row"
          data-outliner-search=""
        />
        <IconButtonMenu icon={Plus} label="Add to the outliner" data-outliner-add-menu="">
          {groupOfTheSelection.kind === "groups" ? (
            <MenuItem icon={studioIconNamed("graph_group")} shortcutHint="F" onChosen={groupTheSelectedNodes} data-outliner-group-selected-nodes="">
              Group selected nodes
            </MenuItem>
          ) : (
            <MenuItemThatCannotBeChosen whyItCannotBeChosen={groupOfTheSelection.because} data-outliner-group-selected-nodes="">
              Group selected nodes
            </MenuItemThatCannotBeChosen>
          )}
        </IconButtonMenu>
      </StudioViewToolbarTools>
      <RefusalOfTheLatestAskBar refusal={askRefusal} />
      {refusalOfTheLatestEdit !== null && <RefusalLine layout="bar" lead={refusalOfTheLatestEdit.lead} words={refusalOfTheLatestEdit.words} />}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-outliner="" onKeyDown={groupTheSelectedNodesOnFOrCommandG}>
        {isSearching && outlinerRows.length === 0 ? (
          <WaitingState title={`Nothing matches “${searchWords.trim()}”`} data-outliner-state="no_row_matches" />
        ) : (
          <TreeView
            label="Outliner"
            rows={outlinerRows.map((outlinerRow) => outlinerRow.row)}
            selectedRowId={rowsOfTheSelection.picked_last}
            alsoSelectedRowIds={rowsOfTheSelection.all}
            onRowSelected={(rowId, pick) => {
              const meaning = meaningOfRow(rowId);
              if (meaning.kind === "stream") showTheRefusalOf("Didn't select:", connection.select({ kind: "stream", stream: meaning.stream, project_folder: meaning.project_folder }));
              if (meaning.kind === "node") showTheRefusalOf("Didn't select:", connection.select(selectionAfterTheOutlinerPick(selection ?? { kind: "nothing" }, meaning, pick, outlinerRows)));
            }}
            onRowActivated={(rowId) => {
              const meaning = meaningOfRow(rowId);
              if (meaning.kind === "stream" || meaning.kind === "node") {
                showTheRefusalOf("Didn't open the stream:", connection.openStreamTab({ stream: meaning.stream, project_name: meaning.project_name, display_name: meaning.display_name }));
              }
            }}
            onExpansionToggled={(rowId, expand) => (isSearching ? setExpansionChoicesWhileSearching((choicesSoFar) => ({ ...choicesSoFar, [rowId]: expand })) : toggleTheRow(rowId, expand))}
          />
        )}
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
