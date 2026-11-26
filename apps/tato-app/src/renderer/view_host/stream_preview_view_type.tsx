// Preview: the active stream shown through whichever view node its graph holds — the Audio Video Preview the Core Nodes
// project brings, or a view the stream's own project brings to show and steer its picture, as Gulf Stream Neon's stage
// does — so the area a layout keeps for the picture shows each stream the way it was made to be seen, not one view type
// that most streams hold no node of.

import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { StudioAreaHeaderChoiceMenu, StudioAreaHeaderWords } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import { Fragment, useCallback } from "react";
import type { StopWatching, StreamGraph, StreamGraphNode, StreamGraphReading, StreamTabAddress, StudioViewHostServices } from "./studio_view_contract";
import { nodeShownByTheArea } from "./studio_view_node_wiring";
import { projectViewIdOf, type RegisteredStudioViewType, type StudioAreaOfTheView, type StudioViewTypeRegistry } from "./studio_view_type_registry";
import { useWatchedStudioValue } from "./watched_studio_value";
import { AddTheViewNode, TatolabViewWaiting } from "./tatolab_frame_view_type";

/** The id the Preview is registered under. */
export const STREAM_PREVIEW_VIEW_TYPE_ID = "stream_preview";

/** The UUID of the Core Nodes project, which every project imports. */
const CORE_NODES_PROJECT = "ba5fc2b1-df25-4e86-bec3-aba1564d6233";

/** The Audio Video Preview the Core Nodes project brings, found by that project's UUID and the view's folder. */
export const AUDIO_VIDEO_PREVIEW_VIEW_TYPE = projectViewIdOf(CORE_NODES_PROJECT, "audio_video_preview");

/** The view types the Preview finds each view node's type among, followed as the open project's views are listed again. */
export type StudioViewTypesForThePreview = Pick<StudioViewTypeRegistry, "viewTypeWithId" | "viewTypeIdOf" | "projectStudioViews">;

/** A node of a stream's graph that a `node` view shows, with that view's type. */
export interface StreamViewNode {
  node: StreamGraphNode;
  view_type: RegisteredStudioViewType;
}

/** The nodes of `graph` a `node` view of `viewTypes` shows, the Audio Video Preview's first, then the others in the graph's order. */
export function streamViewNodesOf(graph: StreamGraph, viewTypes: Pick<StudioViewTypesForThePreview, "viewTypeWithId" | "viewTypeIdOf">): StreamViewNode[] {
  const audioVideoPreviewId = viewTypes.viewTypeIdOf(AUDIO_VIDEO_PREVIEW_VIEW_TYPE);
  const viewNodes = graph.nodes.flatMap((node): StreamViewNode[] => {
    const viewType = viewTypes.viewTypeWithId(node.type);
    return viewType !== null && viewType.view_type_id === node.type && viewType.declared.placement === "node" ? [{ node, view_type: viewType }] : [];
  });
  return [...viewNodes.filter(({ view_type }) => view_type.view_type_id === audioVideoPreviewId), ...viewNodes.filter(({ view_type }) => view_type.view_type_id !== audioVideoPreviewId)];
}

/** The view node of `viewNodes` the area keeps showing, by `shownNodeId`, or the first; `null` when there are none. */
function streamViewNodeShown(viewNodes: readonly StreamViewNode[], shownNodeId: string | null): StreamViewNode | null {
  const shownNode = nodeShownByTheArea(
    viewNodes.map(({ node }) => node),
    shownNodeId,
  );
  return viewNodes.find(({ node }) => node === shownNode) ?? null;
}

/** The graph of the stream `streamTab` names, as the host reads it and each time it changes. */
function useGraphOfTheTab(streamTab: StreamTabAddress, hostServices: StudioViewHostServices): StreamGraphReading | null {
  const { stream } = streamTab;
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => hostServices.watchStreamGraph(stream, listener), [hostServices, stream]);
  return useViewReading(watchTheTabsGraph);
}

interface PreviewOfAnArea {
  area: StudioAreaOfTheView;
  hostServices: StudioViewHostServices;
  viewTypes: StudioViewTypesForThePreview;
}

/** What the Preview shows while `streamTab`'s graph holds no view node: why, and an Audio Video Preview node to add where Core Nodes brings one. */
function NothingToPreview({ streamTab, graph, hostServices, viewTypes }: Omit<PreviewOfAnArea, "area"> & { streamTab: StreamTabAddress; graph: StreamGraph }) {
  const openProject = useViewReading(hostServices.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const audioVideoPreview = viewTypes.viewTypeWithId(AUDIO_VIDEO_PREVIEW_VIEW_TYPE);
  return (
    <TatolabViewWaiting>
      <WaitingState
        title={`${streamTab.display_name} has no view node to preview`}
        explanation="Preview shows the stream through a view node in its graph: an Audio Video Preview, or a view its project brings. Add one, then wire the stream's picture into it."
        data-stream-preview-state="no_view_node"
      >
        {projectFolder !== null && audioVideoPreview !== null && (
          <AddTheViewNode projectFolder={projectFolder} graph={graph} viewTypeId={audioVideoPreview.view_type_id} viewTitle={audioVideoPreview.title} hostServices={hostServices} />
        )}
      </WaitingState>
    </TatolabViewWaiting>
  );
}

/** The view of the view node of `streamTab`'s graph the area shows, or why it shows none. */
function PreviewOfTheTab({ streamTab, area, hostServices, viewTypes }: PreviewOfAnArea & { streamTab: StreamTabAddress }) {
  useWatchedStudioValue(viewTypes.projectStudioViews);
  const graphReading = useGraphOfTheTab(streamTab, hostServices);
  if (graphReading === null) {
    return (
      <TatolabViewWaiting>
        <WaitingState title={`Reading ${streamTab.display_name}'s graph`} data-stream-preview-state="reading_the_graph" />
      </TatolabViewWaiting>
    );
  }
  if (graphReading.kind === "not_read") {
    return (
      <TatolabViewWaiting>
        <WaitingState isFailure title={`${streamTab.display_name}'s graph wasn't read`} explanation={graphReading.because} data-stream-preview-state="graph_not_read" />
      </TatolabViewWaiting>
    );
  }
  const shown = streamViewNodeShown(streamViewNodesOf(graphReading.graph, viewTypes), area.node_shown.node_id);
  if (shown === null) return <NothingToPreview streamTab={streamTab} graph={graphReading.graph} hostServices={hostServices} viewTypes={viewTypes} />;
  return (
    <Fragment key={`${shown.view_type.view_type_id}:${shown.node.id}`}>
      {shown.view_type.renderInAnArea({ ...area, node_shown: { ...area.node_shown, node_id: shown.node.id } }, hostServices)}
    </Fragment>
  );
}

function StreamPreview(preview: PreviewOfAnArea) {
  const activeStreamTab = useViewReading(preview.hostServices.watchActiveStreamTab);
  if (activeStreamTab === null) {
    return (
      <TatolabViewWaiting>
        <WaitingState title="No stream is open" explanation="Open a stream to preview it here." data-stream-preview-state="no_tab" />
      </TatolabViewWaiting>
    );
  }
  return <PreviewOfTheTab key={activeStreamTab.stream} {...preview} streamTab={activeStreamTab} />;
}

/** Which view node the Preview shows, as "<view> on the <node> node in <stream>", a menu of the others when the graph holds several; nothing while it shows none. */
function WhichViewNodeThePreviewShowsInTheTab({ streamTab, area, hostServices, viewTypes }: PreviewOfAnArea & { streamTab: StreamTabAddress }) {
  useWatchedStudioValue(viewTypes.projectStudioViews);
  const graphReading = useGraphOfTheTab(streamTab, hostServices);
  const viewNodes = graphReading?.kind === "read" ? streamViewNodesOf(graphReading.graph, viewTypes) : [];
  const shown = streamViewNodeShown(viewNodes, area.node_shown.node_id);
  if (shown === null) return null;
  const titleOf = ({ node }: StreamViewNode) => nodeTitle(node.name, node.type);
  const { show } = area.node_shown;
  if (viewNodes.length === 1 || show === undefined) {
    return (
      <StudioAreaHeaderWords data-stream-preview-shows={shown.node.id}>
        {shown.view_type.title} on the {titleOf(shown)} node in {streamTab.display_name}
      </StudioAreaHeaderWords>
    );
  }
  return (
    <StudioAreaHeaderChoiceMenu leadingWord="on" words={titleOf(shown)} label={`View node shown: ${titleOf(shown)}`} data-stream-preview-shows={shown.node.id}>
      <MenuSingleChoiceGroup
        closesTheMenuOnChoice
        choices={viewNodes.map((viewNode) => ({ choice: viewNode.node.id, label: `${titleOf(viewNode)} · ${viewNode.view_type.title}` }))}
        chosen={shown.node.id}
        onChosen={show}
        dataAttributeOfEachChoice="data-stream-preview-node-choice"
      />
    </StudioAreaHeaderChoiceMenu>
  );
}

function WhichViewNodeThePreviewShows(preview: PreviewOfAnArea) {
  const activeStreamTab = useViewReading(preview.hostServices.watchActiveStreamTab);
  if (activeStreamTab === null) return null;
  return <WhichViewNodeThePreviewShowsInTheTab key={activeStreamTab.stream} {...preview} streamTab={activeStreamTab} />;
}

/**
 * The Preview as a view type of Studio's own, finding each view node's type among `viewTypesOf()`'s, which is read when an area draws
 * it, so the registry that holds the Preview can be the one it reads.
 */
export function streamPreviewViewType(viewTypesOf: () => StudioViewTypesForThePreview): RegisteredStudioViewType {
  return {
    view_type_id: STREAM_PREVIEW_VIEW_TYPE_ID,
    title: "Preview",
    icon: "preview",
    brought_by: { kind: "tato_studio" },
    declared: {
      description: "The active stream through the view node its graph holds: an Audio Video Preview, or a view its project brings.",
      placement: "area",
      inputs: [],
      outputs: [],
    },
    renderInAnArea: (area, hostServices) => <StreamPreview area={area} hostServices={hostServices} viewTypes={viewTypesOf()} />,
    renderWordsAfterTheViewTypeMenu: (area, hostServices) => <WhichViewNodeThePreviewShows area={area} hostServices={hostServices} viewTypes={viewTypesOf()} />,
  };
}
