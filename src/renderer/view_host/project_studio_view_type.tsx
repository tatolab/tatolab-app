// A view people write, drawn in a frame of its own so its styles and the window's never mix, its one
// channel to the studio the MessagePort its bridge answers. A full-access view's frame is on the
// window's origin; one that opts into the sandbox runs on an opaque origin with no Node, no preload
// and only the permissions its manifest lists.

import { useCallback, useEffect, useRef } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { StudioViewManifest } from "../../shared/studio_view_manifest";
import { WaitingState } from "../design_system/waiting_state";
import { useStudioViewReading } from "./in_window_view_host";
import { ProjectStudioViewBridge } from "./project_studio_view_bridge";
import type { StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostConnection, StudioViewType } from "./studio_view_contract";
import { nodesOfTheStudioViewType, studioViewInputWiring, STUDIO_VIEW_NODE_ISSUE, type StudioViewInputWiring } from "./studio_view_node_wiring";
import { STUDIO_VIEW_PORT_HANDOVER } from "./studio_view_wire_protocol";

/** The browser permissions a view's frame is allowed: every one for a full-access view, and only those a sandboxed view's manifest lists. */
function framePermissionsOf(manifest: StudioViewManifest): string {
  const isGranted = (capability: "camera" | "microphone") => !manifest.sandboxed || manifest.capabilities.includes(capability);
  return [isGranted("camera") ? "camera" : null, isGranted("microphone") ? "microphone" : null].filter((permission) => permission !== null).join("; ");
}

/** The view's frame, on its entry, served by a bridge that reads its inputs from `inputWiring`; a reload of the frame is served by a new one. */
function ProjectStudioViewFrame({
  connection,
  listed,
  manifest,
  inputWiring,
}: {
  connection: StudioViewHostConnection<null>;
  listed: ListedStudioView;
  manifest: StudioViewManifest;
  inputWiring: Record<string, StudioViewInputWiring>;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ProjectStudioViewBridge | null>(null);
  const inputWiringRef = useRef(inputWiring);
  inputWiringRef.current = inputWiring;
  const inputWiringAsJson = JSON.stringify(inputWiring);

  useEffect(() => () => bridgeRef.current?.close(), []);
  useEffect(() => {
    bridgeRef.current?.rewireInputs(inputWiringRef.current);
  }, [inputWiringAsJson]);

  const entryUrl = new URL(manifest.entry_path, listed.folder_url);
  const handTheFrameItsPort = () => {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow === null || frameWindow === undefined) return;
    bridgeRef.current?.close();
    const channel = new MessageChannel();
    const bridge = new ProjectStudioViewBridge(channel.port1, listed.view_type_id, manifest, connection, inputWiringRef.current);
    bridge.start();
    bridgeRef.current = bridge;
    // A sandboxed frame without allow-same-origin has an opaque origin, which no target origin but "*" names.
    frameWindow.postMessage({ kind: STUDIO_VIEW_PORT_HANDOVER }, manifest.sandboxed ? "*" : entryUrl.origin, [channel.port2]);
  };

  return (
    <iframe
      ref={frameRef}
      title={manifest.title}
      src={entryUrl.href}
      sandbox={manifest.sandboxed ? "allow-scripts" : undefined}
      allow={framePermissionsOf(manifest)}
      referrerPolicy="no-referrer"
      className="size-full border-0 bg-studio-area"
      onLoad={handTheFrameItsPort}
      data-project-studio-view={listed.view_type_id}
      data-project-studio-view-access={manifest.sandboxed ? "sandboxed" : "full"}
    />
  );
}

/** The view of the active tab's first node of its type, or what to do while the tab's graph has none. */
function ProjectStudioViewOfTheTab({
  connection,
  listed,
  manifest,
  streamTab,
}: {
  connection: StudioViewHostConnection<null>;
  listed: ListedStudioView;
  manifest: StudioViewManifest;
  streamTab: StreamTabAddress;
}) {
  const { stream } = streamTab;
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useStudioViewReading(watchTheTabsGraph);
  if (graphReading === null) return <WaitingState title={`Reading ${streamTab.display_name}'s graph`} data-project-studio-view-state="reading_the_graph" />;
  if (graphReading.kind === "not_read") {
    return <WaitingState isFailure title={`${streamTab.display_name}'s graph wasn't read`} explanation={graphReading.because} data-project-studio-view-state="graph_not_read" />;
  }
  const viewNode = nodesOfTheStudioViewType(graphReading.graph, listed.view_type_id)[0];
  if (viewNode === undefined) {
    return (
      <WaitingState
        title={`${streamTab.display_name} has no ${manifest.title} node`}
        explanation={`${manifest.title} shows its node in the stream's graph, each of its inputs reading what is wired into it.`}
        waitsOn={STUDIO_VIEW_NODE_ISSUE}
        data-project-studio-view-state="no_view_node"
      />
    );
  }
  return (
    <ProjectStudioViewFrame
      key={viewNode.id}
      connection={connection}
      listed={listed}
      manifest={manifest}
      inputWiring={studioViewInputWiring(graphReading.graph, viewNode, manifest.inputs)}
    />
  );
}

function ProjectStudioViewBody({ connection, listed, manifest }: { connection: StudioViewHostConnection<null>; listed: ListedStudioView; manifest: StudioViewManifest }) {
  const activeStreamTab = useStudioViewReading(connection.watchActiveStreamTab);
  if (activeStreamTab === null) {
    return <WaitingState title="No stream is open" explanation={`Open a stream with a ${manifest.title} node to show it here.`} data-project-studio-view-state="no_tab" />;
  }
  return <ProjectStudioViewOfTheTab key={activeStreamTab.stream} connection={connection} listed={listed} manifest={manifest} streamTab={activeStreamTab} />;
}

/** The view type `listed`, declared by `manifest`, which the open project `projectName` or one of its imports brings. */
export function projectStudioViewType(listed: ListedStudioView, manifest: StudioViewManifest, projectName: string): StudioViewType<null> {
  return {
    view_type_id: listed.view_type_id,
    title: manifest.title,
    icon: "project_view",
    brought_by: { kind: "project", project_name: projectName },
    default_settings: null,
    settingsFromSavedLayout: () => null,
    renderStudioView: (connection) => ({
      header_tools: null,
      body: <ProjectStudioViewBody connection={connection} listed={listed} manifest={manifest} />,
    }),
  };
}
