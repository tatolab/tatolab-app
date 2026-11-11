// The outliner's tree, derived from what the view is handed: the streams the runtime lists from the open
// project's folder, and each one's graph as the runtime renders it, its groups holding the nodes that name
// them as their `studio.group`.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type { ListedStream, ListedStreamsReading, OpenProject, StreamGraphNode, StreamGraphReading, StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";
import { shownStudioTreeRows, type StudioTreeNode } from "../shared/node_type_listing_tree";
import { nodeTitle, nodeTypeClassName } from "../shared/node_words";

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

/** The id of the row that stands for `selection`, or `null` when no row does. */
export function outlinerRowIdOfTheSelection(selection: StudioSelection): string | null {
  switch (selection.kind) {
    case "nothing":
    case "project":
      return null;
    case "stream":
      return streamRowId(selection.stream);
    case "node":
      return nodeRowId(selection.stream, selection.node);
  }
}

function leafNode(row: OutlinerTreeNode["row"]): OutlinerTreeNode {
  return { row, meaning: { kind: "nothing_to_select" }, isOpenByDefault: false, children: [] };
}

function graphNodeRow(stream: ListedStream, projectName: string, node: StreamGraphNode): OutlinerTreeNode {
  return {
    row: {
      row_id: nodeRowId(stream.stream, node.name),
      label: nodeTitle(node.name, node.type),
      icon: node.failed_because === null && node.process_raising_because === null ? "graph_node" : "failed",
      tone: node.failed_because === null && node.process_raising_because === null ? undefined : "failed",
      aside: nodeTypeClassName(node.type),
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
  if (graphReading === undefined) return [leafNode({ row_id: `${rowId}/waiting`, label: "Nodes not read yet", icon: "waiting", tone: "waiting" })];
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

/** The outliner's rows that show for `project`, with what each stands for: a row shows when every row above it is open, and the stream of the active tab, `openStream`, opens by default. */
export function outlinerTreeOfTheProject(
  project: OpenProject,
  listedStreams: ListedStreamsReading,
  streamGraphs: OutlinerStreamGraphReadings,
  openStream: string | null,
  expansionChoices: OutlinerRowExpansionChoices,
): OutlinerRow[] {
  return shownStudioTreeRows(projectStreamNodes(project, listedStreams, streamGraphs, openStream), expansionChoices);
}
