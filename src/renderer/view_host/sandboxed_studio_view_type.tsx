// A view people write, drawn in a sandboxed frame of its own: no Node, no preload and no shared
// origin with the window, its one channel to the studio the MessagePort its bridge answers.

import { useCallback, useEffect, useRef } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { StudioViewManifest } from "../../shared/studio_view_manifest";
import { WaitingState } from "../design_system/waiting_state";
import { useStudioViewReading } from "./in_window_view_host";
import { SandboxedStudioViewBridge } from "./sandboxed_studio_view_bridge";
import type { StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostConnection, StudioViewType } from "./studio_view_contract";
import { nodesOfTheStudioViewType, studioViewInputWiring, STUDIO_VIEW_NODE_ISSUE, type StudioViewInputWiring } from "./studio_view_node_wiring";
import { STUDIO_VIEW_PORT_HANDOVER } from "./studio_view_wire_protocol";

/** The browser permissions a frame is allowed, only those its manifest declares. */
function framePermissionsDeclaredBy(manifest: StudioViewManifest): string {
  return [manifest.capabilities.includes("camera") ? "camera" : null, manifest.capabilities.includes("microphone") ? "microphone" : null]
    .filter((permission) => permission !== null)
    .join("; ");
}

/** The view's frame, on its entry, served by a bridge that reads its inputs from `inputWiring`; a reload of the frame is served by a new one. */
function SandboxedStudioViewFrame({
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
  const bridgeRef = useRef<SandboxedStudioViewBridge | null>(null);
  const inputWiringRef = useRef(inputWiring);
  inputWiringRef.current = inputWiring;
  const inputWiringAsJson = JSON.stringify(inputWiring);

  useEffect(() => () => bridgeRef.current?.close(), []);
  useEffect(() => {
    bridgeRef.current?.rewireInputs(inputWiringRef.current);
  }, [inputWiringAsJson]);

  const handTheFrameItsPort = () => {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow === null || frameWindow === undefined) return;
    bridgeRef.current?.close();
    const channel = new MessageChannel();
    const bridge = new SandboxedStudioViewBridge(channel.port1, listed.view_type_id, manifest, connection, inputWiringRef.current);
    bridge.start();
    bridgeRef.current = bridge;
    // A sandboxed frame without allow-same-origin has an opaque origin, which no target origin but "*" names.
    frameWindow.postMessage({ kind: STUDIO_VIEW_PORT_HANDOVER }, "*", [channel.port2]);
  };

  return (
    <iframe
      ref={frameRef}
      title={manifest.title}
      src={new URL(manifest.entry_path, listed.folder_url).href}
      sandbox="allow-scripts"
      allow={framePermissionsDeclaredBy(manifest)}
      referrerPolicy="no-referrer"
      className="size-full border-0 bg-studio-area"
      onLoad={handTheFrameItsPort}
      data-sandboxed-studio-view={listed.view_type_id}
    />
  );
}

/** The view of the active tab's first node of its type, or what to do while the tab's graph has none. */
function SandboxedStudioViewOfTheTab({
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
  if (graphReading === null) return <WaitingState title={`Reading ${streamTab.display_name}'s graph`} data-sandboxed-studio-view-state="reading_the_graph" />;
  if (graphReading.kind === "not_read") {
    return <WaitingState isFailure title={`${streamTab.display_name}'s graph wasn't read`} explanation={graphReading.because} data-sandboxed-studio-view-state="graph_not_read" />;
  }
  const viewNode = nodesOfTheStudioViewType(graphReading.graph, listed.view_type_id)[0];
  if (viewNode === undefined) {
    return (
      <WaitingState
        title={`${streamTab.display_name} has no ${manifest.title} node`}
        explanation={`${manifest.title} shows its node in the stream's graph, each of its inputs reading what is wired into it.`}
        waitsOn={STUDIO_VIEW_NODE_ISSUE}
        data-sandboxed-studio-view-state="no_view_node"
      />
    );
  }
  return (
    <SandboxedStudioViewFrame
      key={viewNode.id}
      connection={connection}
      listed={listed}
      manifest={manifest}
      inputWiring={studioViewInputWiring(graphReading.graph, viewNode, manifest.inputs)}
    />
  );
}

function SandboxedStudioViewBody({ connection, listed, manifest }: { connection: StudioViewHostConnection<null>; listed: ListedStudioView; manifest: StudioViewManifest }) {
  const activeStreamTab = useStudioViewReading(connection.watchActiveStreamTab);
  if (activeStreamTab === null) {
    return <WaitingState title="No stream is open" explanation={`Open a stream with a ${manifest.title} node to show it here.`} data-sandboxed-studio-view-state="no_tab" />;
  }
  return <SandboxedStudioViewOfTheTab key={activeStreamTab.stream} connection={connection} listed={listed} manifest={manifest} streamTab={activeStreamTab} />;
}

/** The view type `listed`, declared by `manifest`, which the open project `projectName` or one of its imports brings. */
export function sandboxedStudioViewType(listed: ListedStudioView, manifest: StudioViewManifest, projectName: string): StudioViewType<null> {
  return {
    view_type_id: listed.view_type_id,
    title: manifest.title,
    icon: "project_view",
    brought_by: { kind: "project", project_name: projectName },
    default_settings: null,
    settingsFromSavedLayout: () => null,
    renderStudioView: (connection) => ({
      header_tools: null,
      body: <SandboxedStudioViewBody connection={connection} listed={listed} manifest={manifest} />,
    }),
  };
}
