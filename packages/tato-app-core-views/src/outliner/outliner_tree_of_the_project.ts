// The outliner's tree, derived from what the view is handed: the streams the runtime lists from the open
// project's folder, and each one's graph as the runtime renders it, its groups holding the nodes that name
// them as their `studio.group`.

import type { TreeRowPick, TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type { ListedStream, ListedStreamsReading, OpenProject, StreamGraphAction, StreamGraphNode, StreamGraphNodeKind, StreamGraphReading, StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";
import { shownStudioTreeRows, studioTreeNodesMatching, type StudioTreeNode } from "../shared/node_type_listing_tree";
import { nodeTitle } from "../shared/node_words";
import { editedStreamGraphOf, selectionFramedEdits } from "../shared/stream_graph_edits";
import { streamPreparingWords } from "../shared/stream_preparing_words";
import { nodesTheSelectionHolds, nodesTheSelectionHoldsInTheStream, selectionOfTheNodes } from "../shared/nodes_of_the_selection";

/** What a row stands for, so choosing it selects or opens the right thing. */
export type OutlinerRowMeaning =
  | { kind: "stream"; stream: string; display_name: string; project_name: string; project_folder: string }
  | { kind: "node"; stream: string; node: string; display_name: string; project_name: string }
  | { kind: "nothing_to_select" };

/** A row of the outliner and what it stands for. */
export interface OutlinerRow {
  row: TreeViewRow;
  meaning: OutlinerRowMeaning;
}

/** Rows the person opened or closed, by row id; every other row opens as the outliner opens it by default. */
export type OutlinerRowExpansionChoices = Readonly<Record<string, boolean>>;

/** Each stream's graph as last read, by stream id; a stream absent from it has not been read yet. */
export type OutlinerStreamGraphReadings = Readonly<Record<string, StreamGraphReading>>;

type OutlinerTreeNode = StudioTreeNode<OutlinerRowMeaning>;

/** The id of the outliner's row for the stream `stream`. */
function streamRowId(stream: string): string {
  return `stream:${stream}`;
}

/** The id of the outliner's row for the node named `node` of the stream `stream`. */
function nodeRowId(stream: string, node: string): string {
  return `node:${stream}/${node}`;
}

/** The rows that stand for `selection`: the one picked last, and every one selected with it. */
export function outlinerRowIdsOfTheSelection(selection: StudioSelection): { picked_last: string | null; all: ReadonlySet<string> } {
  switch (selection.kind) {
    case "nothing":
    case "project":
      return { picked_last: null, all: new Set() };
    case "stream":
      return { picked_last: streamRowId(selection.stream), all: new Set([streamRowId(selection.stream)]) };
    case "node":
      return { picked_last: nodeRowId(selection.stream, selection.node), all: new Set([nodeRowId(selection.stream, selection.node)]) };
    case "nodes": {
      const pickedLastNode = selection.nodes.at(-1);
      return { picked_last: pickedLastNode === undefined ? null : nodeRowId(selection.stream, pickedLastNode), all: new Set(selection.nodes.map((node) => nodeRowId(selection.stream, node))) };
    }
  }
}

/** The selection of `nodes` of `stream`, or nothing when there are none. */
function selectionOfTheNodesOrNothing(stream: string, nodes: readonly string[]): StudioSelection {
  return selectionOfTheNodes(stream, nodes) ?? { kind: "nothing" };
}

/**
 * What the window selects after the node row of `picked` is picked `pick` while `selection` is selected: on its own, the
 * node alone; toggled, the nodes of its stream selected with it, or without it if it was among them; extended, those nodes and
 * every node row of its stream in `rowsShown` from the one picked last to it.
 */
export function selectionAfterTheOutlinerPick(selection: StudioSelection, picked: { stream: string; node: string }, pick: TreeRowPick, rowsShown: readonly OutlinerRow[]): StudioSelection {
  const selectedBefore = nodesTheSelectionHoldsInTheStream(selection, picked.stream);
  if (pick === "toggled") {
    return selectedBefore.includes(picked.node) ? selectionOfTheNodesOrNothing(picked.stream, selectedBefore.filter((node) => node !== picked.node)) : selectionOfTheNodesOrNothing(picked.stream, [...selectedBefore, picked.node]);
  }
  const pickedBefore = selectedBefore.at(-1);
  if (pick === "extended" && pickedBefore !== undefined) {
    const nodeRowsOfTheStream = rowsShown.flatMap(({ meaning }) => (meaning.kind === "node" && meaning.stream === picked.stream ? [meaning.node] : []));
    const fromIndex = nodeRowsOfTheStream.indexOf(pickedBefore);
    const toIndex = nodeRowsOfTheStream.indexOf(picked.node);
    if (fromIndex !== -1 && toIndex !== -1) {
      const rowsBetween = nodeRowsOfTheStream.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
      const rowsBetweenEndingAtThePick = toIndex >= fromIndex ? rowsBetween : rowsBetween.reverse();
      return selectionOfTheNodesOrNothing(picked.stream, [...selectedBefore.filter((node) => !rowsBetweenEndingAtThePick.includes(node)), ...rowsBetweenEndingAtThePick]);
    }
  }
  return { kind: "node", stream: picked.stream, node: picked.node };
}

/** The edit Group selected nodes sends for `selection`: a labelled group of its nodes, as the Stream graph's F frames them; or why there is none to send. */
export function groupOfTheSelectedNodes(selection: StudioSelection | null, streamGraphs: OutlinerStreamGraphReadings): { kind: "groups"; actions: StreamGraphAction[] } | { kind: "cannot_group"; because: string } {
  const selectedNodes = nodesTheSelectionHolds(selection);
  if (selectedNodes === null) return { kind: "cannot_group", because: "Select the nodes to group first." };
  const graphReading = streamGraphs[selectedNodes.stream];
  if (graphReading === undefined) return { kind: "cannot_group", because: "The stream's graph isn't read yet." };
  if (graphReading.kind === "not_read") return { kind: "cannot_group", because: graphReading.because };
  const editedGraph = editedStreamGraphOf(graphReading.graph);
  if ("because" in editedGraph) return { kind: "cannot_group", because: editedGraph.because };
  const actions = selectionFramedEdits(editedGraph, selectedNodes.nodes);
  return actions.length === 0 ? { kind: "cannot_group", because: "The selected nodes aren't in the stream's graph." } : { kind: "groups", actions };
}

/** The outliner's Type column for a node of `kind`: how its code runs, a subgraph for a generator's stored output, and plain `node` where the runtime names no kind. */
const OUTLINER_TYPE_OF_THE_NODE_KIND: Record<StreamGraphNodeKind, string> = {
  shader: "shader",
  function: "function",
  process: "process",
  fragment: "subgraph",
};

/** What the outliner's Type column says for `node`. */
export function outlinerTypeOfTheNode(node: StreamGraphNode): string {
  return node.kind === null ? "node" : OUTLINER_TYPE_OF_THE_NODE_KIND[node.kind];
}

function leafNode(row: OutlinerTreeNode["row"]): OutlinerTreeNode {
  return { row, meaning: { kind: "nothing_to_select" }, isOpenByDefault: false, children: [] };
}

/** How a node's row reads: failed while it failed or its `process()` keeps raising, not ready while it reports itself so, plain otherwise. */
function nodeRowCondition(node: StreamGraphNode): Pick<OutlinerTreeNode["row"], "icon" | "tone"> {
  if (node.failed_because !== null || node.process_raising_because !== null) return { icon: "failed", tone: "failed" };
  if (node.not_ready_because !== null) return { icon: "not_ready", tone: "not_ready" };
  return { icon: "graph_node", tone: undefined };
}

function graphNodeRow(stream: ListedStream, projectName: string, node: StreamGraphNode): OutlinerTreeNode {
  return {
    row: {
      row_id: nodeRowId(stream.stream, node.name),
      label: nodeTitle(node.name, node.type),
      ...nodeRowCondition(node),
      aside: outlinerTypeOfTheNode(node),
    },
    meaning: { kind: "node", stream: stream.stream, node: node.name, display_name: stream.display_name, project_name: projectName },
    isOpenByDefault: false,
    children: [],
  };
}

/** The rows of the nodes in the group `group`, or a row saying it holds none. */
function groupChildren(stream: ListedStream, projectName: string, group: string, nodes: readonly StreamGraphNode[]): OutlinerTreeNode[] {
  const nodeRows = nodes.filter((node) => node.studio.group === group).map((node) => graphNodeRow(stream, projectName, node));
  return nodeRows.length > 0 ? nodeRows : [leafNode({ row_id: `group:${stream.stream}/${group}/empty`, label: "No nodes", icon: "waiting", tone: "waiting" })];
}

/** The rows under a stream: its groups, each holding its nodes, then the nodes in no group; or why none show. */
function streamChildren(stream: ListedStream, projectName: string, graphReading: StreamGraphReading | undefined): OutlinerTreeNode[] {
  const rowId = streamRowId(stream.stream);
  if (stream.state === "failed" && stream.failed_because !== null) {
    return [leafNode({ row_id: `${rowId}/failed`, label: stream.failed_because, icon: "unreadable", tone: "failed" })];
  }
  const preparingWords = streamPreparingWords(stream, stream.display_name);
  if (preparingWords !== null && (graphReading === undefined || graphReading.kind === "not_read")) {
    return [leafNode({ row_id: `${rowId}/preparing`, label: preparingWords.explanation, icon: "waiting", tone: "waiting" })];
  }
  if (graphReading === undefined) return [leafNode({ row_id: `${rowId}/waiting`, label: "Nodes not read yet", icon: "waiting", tone: "waiting" })];
  if (graphReading.kind === "not_read" && stream.state !== "running") return [leafNode({ row_id: `${rowId}/not-running`, label: "Not running", icon: "waiting", tone: "waiting" })];
  if (graphReading.kind === "not_read") return [leafNode({ row_id: `${rowId}/not-read`, label: graphReading.because, icon: "unreadable", tone: "unreadable" })];
  const { groups, nodes } = graphReading.graph;
  if (nodes.length === 0 && groups.length === 0) return [leafNode({ row_id: `${rowId}/empty`, label: "No nodes yet", icon: "waiting", tone: "waiting" })];
  const groupIds = new Set(groups.map((group) => group.id));
  const groupRows = groups.map(
    (group): OutlinerTreeNode => ({
      row: { row_id: `group:${stream.stream}/${group.id}`, label: group.title, icon: "graph_group", aside: "group" },
      meaning: { kind: "nothing_to_select" },
      isOpenByDefault: true,
      children: groupChildren(stream, projectName, group.id, nodes),
    }),
  );
  const ungroupedNodeRows = nodes.filter((node) => node.studio.group === null || !groupIds.has(node.studio.group)).map((node) => graphNodeRow(stream, projectName, node));
  return [...groupRows, ...ungroupedNodeRows];
}

/** The streams of `streams` the runtime loaded from `project`'s folder. */
function streamsOfTheOpenProject(project: OpenProject, streams: readonly ListedStream[]): ListedStream[] {
  return streams.filter((stream) => stream.location?.project_directory === project.project.folder);
}

/** The open project's streams, each holding its groups and nodes; a row saying none are listed yet, or why listing them failed. */
function projectStreamNodes(project: OpenProject, listedStreams: ListedStreamsReading, streamGraphs: OutlinerStreamGraphReadings, openStream: string | null): OutlinerTreeNode[] {
  const openProject = project.project;
  switch (listedStreams.kind) {
    case "listing_failed":
      return [leafNode({ row_id: "streams-not-listed", label: listedStreams.because, icon: "unreadable", tone: "unreadable" })];
    case "not_listed":
      return [leafNode({ row_id: "streams-waiting", label: "Streams not read yet", icon: "waiting", tone: "waiting" })];
    case "listed": {
      const streamsOfTheProject = streamsOfTheOpenProject(project, listedStreams.streams);
      if (streamsOfTheProject.length === 0) return [leafNode({ row_id: "streams-none", label: "No streams yet", icon: "waiting", tone: "waiting" })];
      return streamsOfTheProject.map(
        (stream): OutlinerTreeNode => ({
          row: {
            row_id: streamRowId(stream.stream),
            label: stream.display_name,
            icon: stream.state === "failed" ? "failed" : "stream",
            tone: stream.state === "failed" ? "failed" : undefined,
            isCurrent: stream.stream === openStream,
            aside: "stream",
          },
          meaning: { kind: "stream", stream: stream.stream, display_name: stream.display_name, project_name: openProject.name, project_folder: openProject.folder },
          isOpenByDefault: stream.stream === openStream,
          children: streamChildren(stream, openProject.name, streamGraphs[stream.stream]),
        }),
      );
    }
  }
}

/** The ids of the streams the outliner shows for `project`, whose graphs it reads. */
export function streamsTheOutlinerShows(project: OpenProject, listedStreams: ListedStreamsReading): string[] {
  return listedStreams.kind === "listed" ? streamsOfTheOpenProject(project, listedStreams.streams).map((stream) => stream.stream) : [];
}

/**
 * The outliner's rows that show for `project`, with what each stands for: a row shows when every row above it is open, and
 * the stream of the active tab, `openStream`, opens by default and reads as the current row. A search for `searchWords`
 * keeps only the rows whose name or type matches, with the rows above them, all open.
 */
export function outlinerTreeOfTheProject(
  project: OpenProject,
  listedStreams: ListedStreamsReading,
  streamGraphs: OutlinerStreamGraphReadings,
  openStream: string | null,
  expansionChoices: OutlinerRowExpansionChoices,
  searchWords = "",
): OutlinerRow[] {
  return shownStudioTreeRows(studioTreeNodesMatching(projectStreamNodes(project, listedStreams, streamGraphs, openStream), searchWords), expansionChoices);
}
