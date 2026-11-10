// A view made with the view SDK, drawn in a frame of its own so its styles and the window's never
// mix, its one channel to Studio the MessagePort its bridge answers. A project's full-access view is
// framed on an origin of its own, never the window's; one that opts into the sandbox runs on an
// opaque origin with only the permissions its manifest lists. Neither has Node or the preload.

import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { VIEW_PORT_HANDOVER, type TatolabViewManifest, type ViewGrant } from "@tatolab/tato-app-view-sdk";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import { StudioAreaHeaderRowOfAWaitingView, StudioAreaHeaderWords } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { JsonValue, StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostServices, StudioViewNodeAddress, StudioViewTypeSource } from "./studio_view_contract";
import { nodesOfTheStudioViewType, studioViewInputWiring, type StudioViewInputWiring } from "./studio_view_node_wiring";
import type { RegisteredStudioViewType, StudioAreaOfTheView } from "./studio_view_type_registry";
import { hostServicesHeldToTheViewsProject } from "./studio_view_project_file_scope";
import { TatolabViewBridge, type TatolabViewAreaServices } from "./tatolab_view_bridge";
import { WatchedStudioValue } from "./watched_studio_value";

/** The browser permissions a view's frame is allowed: every one for a full-access view, and only those a sandboxed view's manifest lists. */
function framePermissionsOf(manifest: TatolabViewManifest): string {
  const isGranted = (capability: "camera" | "microphone") => !manifest.sandbox || manifest.capabilities.includes(capability);
  return [isGranted("camera") ? "camera" : null, isGranted("microphone") ? "microphone" : null].filter((permission) => permission !== null).join("; ");
}

/** How an Image frame crosses into a view's frame: as the `VideoFrame` itself into a frame on the window's own origin, a core view's, and as an `ImageBitmap` into a project view's own origin or a sandboxed view's opaque one, another agent cluster. */
function picturesCrossTheFrameAs(entryUrl: URL, manifest: TatolabViewManifest): ViewGrant["pictures_cross_as"] {
  return !manifest.sandbox && entryUrl.origin === window.location.origin ? "video_frame" : "image_bitmap";
}

interface TatolabViewOfAnArea {
  listed: ListedStudioView;
  manifest: TatolabViewManifest;
  area: StudioAreaOfTheView;
  hostServices: StudioViewHostServices;
}

/** The view's frame, on its entry, served by a bridge that reads its inputs from `inputWiring` and writes its outputs onto `viewNode`; a reload of the frame is served by a new one. */
function TatolabViewFrame({
  listed,
  manifest,
  area,
  hostServices,
  inputWiring,
  viewNode,
}: TatolabViewOfAnArea & { inputWiring: Record<string, StudioViewInputWiring>; viewNode: StudioViewNodeAddress | null }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<TatolabViewBridge | null>(null);
  const inputWiringRef = useRef(inputWiring);
  inputWiringRef.current = inputWiring;
  const inputWiringAsJson = JSON.stringify(inputWiring);
  const rememberSettingsRef = useRef(area.rememberSettings);
  rememberSettingsRef.current = area.rememberSettings;
  const [savedSettings] = useState(() => new WatchedStudioValue<{ saved: JsonValue | undefined }>({ saved: area.saved_settings }));
  const savedSettingsAsJson = JSON.stringify(area.saved_settings) ?? "";
  const savedSettingsRef = useRef(area.saved_settings);
  savedSettingsRef.current = area.saved_settings;

  useEffect(() => () => bridgeRef.current?.close(), []);
  useEffect(() => {
    savedSettings.publish({ saved: savedSettingsRef.current });
  }, [savedSettings, savedSettingsAsJson]);
  useEffect(() => {
    bridgeRef.current?.rewireInputs(inputWiringRef.current);
  }, [inputWiringAsJson]);

  const entryUrl = new URL(manifest.entry, listed.folder_url);
  const handTheFrameItsPort = () => {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow === null || frameWindow === undefined) return;
    bridgeRef.current?.close();
    const areaServices: TatolabViewAreaServices = {
      watchSavedSettings: (listener) => savedSettings.watch(({ saved }) => listener(saved)),
      rememberSettings: (settings) => rememberSettingsRef.current(settings),
      watchHeaderRow: area.header_row.watch,
    };
    const channel = new MessageChannel();
    const hostServicesOfTheView = listed.project_folder === null ? hostServices : hostServicesHeldToTheViewsProject(hostServices, manifest.title, listed.project_folder);
    const bridge = new TatolabViewBridge(
      channel.port1,
      listed.view_type_id,
      manifest,
      hostServicesOfTheView,
      areaServices,
      picturesCrossTheFrameAs(entryUrl, manifest),
      inputWiringRef.current,
      viewNode,
    );
    bridge.start();
    bridgeRef.current = bridge;
    // A sandboxed frame without allow-same-origin has an opaque origin, which no target origin but "*" names.
    frameWindow.postMessage({ kind: VIEW_PORT_HANDOVER }, manifest.sandbox ? "*" : entryUrl.origin, [channel.port2]);
  };

  return (
    <iframe
      ref={frameRef}
      title={manifest.title}
      src={entryUrl.href}
      sandbox={manifest.sandbox ? "allow-scripts" : undefined}
      allow={framePermissionsOf(manifest)}
      referrerPolicy="no-referrer"
      className="size-full border-0 bg-studio-area"
      onLoad={handTheFrameItsPort}
      data-tatolab-view={listed.view_type_id}
      data-tatolab-view-access={manifest.sandbox ? "sandboxed" : "full"}
      data-tatolab-view-on-the-windows-origin={picturesCrossTheFrameAs(entryUrl, manifest) === "video_frame" ? "" : undefined}
    />
  );
}

/** What a `node` view's area shows while there is no node to show: a header row of its own, under the view-type menu, over why. */
function TatolabViewWaiting({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col">
      <StudioAreaHeaderRowOfAWaitingView />
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** The `node` view of the active tab's first node of its type, or what to do while the tab's graph has none. */
function TatolabNodeViewOfTheTab({ streamTab, ...view }: TatolabViewOfAnArea & { streamTab: StreamTabAddress }) {
  const { stream } = streamTab;
  const { hostServices, listed, manifest } = view;
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => hostServices.watchStreamGraph(stream, listener), [hostServices, stream]);
  const graphReading = useViewReading(watchTheTabsGraph);
  if (graphReading === null) {
    return (
      <TatolabViewWaiting>
        <WaitingState title={`Reading ${streamTab.display_name}'s graph`} data-tatolab-view-state="reading_the_graph" />
      </TatolabViewWaiting>
    );
  }
  if (graphReading.kind === "not_read") {
    return (
      <TatolabViewWaiting>
        <WaitingState isFailure title={`${streamTab.display_name}'s graph wasn't read`} explanation={graphReading.because} data-tatolab-view-state="graph_not_read" />
      </TatolabViewWaiting>
    );
  }
  const viewNode = nodesOfTheStudioViewType(graphReading.graph, listed.view_type_id)[0];
  if (viewNode === undefined) {
    return (
      <TatolabViewWaiting>
        <WaitingState
          title={`${streamTab.display_name} has no ${manifest.title} node`}
          explanation={`${manifest.title} shows its node in the stream's graph, each of its inputs reading what is wired into it.`}
          data-tatolab-view-state="no_view_node"
        />
      </TatolabViewWaiting>
    );
  }
  return (
    <TatolabViewFrame
      key={viewNode.id}
      {...view}
      inputWiring={studioViewInputWiring(graphReading.graph, viewNode, manifest.inputs)}
      viewNode={{ stream: graphReading.graph.stream, node_id: viewNode.id }}
    />
  );
}

function TatolabNodeView(view: TatolabViewOfAnArea) {
  const activeStreamTab = useViewReading(view.hostServices.watchActiveStreamTab);
  if (activeStreamTab === null) {
    return (
      <TatolabViewWaiting>
        <WaitingState title="No stream is open" explanation={`Open a stream with a ${view.manifest.title} node to show it here.`} data-tatolab-view-state="no_tab" />
      </TatolabViewWaiting>
    );
  }
  return <TatolabNodeViewOfTheTab key={activeStreamTab.stream} {...view} streamTab={activeStreamTab} />;
}

/** Where the active tab's node of the view type `viewTypeId` is, as "on the <node> node in <stream>", once the tab's graph has one; nothing before. */
function WhereTheNodeViewsNodeIsInTheTab({ streamTab, viewTypeId, hostServices }: { streamTab: StreamTabAddress; viewTypeId: string; hostServices: StudioViewHostServices }) {
  const { stream } = streamTab;
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => hostServices.watchStreamGraph(stream, listener), [hostServices, stream]);
  const graphReading = useViewReading(watchTheTabsGraph);
  const viewNode = graphReading?.kind === "read" ? nodesOfTheStudioViewType(graphReading.graph, viewTypeId)[0] : undefined;
  if (viewNode === undefined) return null;
  return (
    <StudioAreaHeaderWords data-node-view-whereabouts={viewNode.id}>
      on the {nodeTitle(viewNode.name, viewNode.type)} node in {streamTab.display_name}
    </StudioAreaHeaderWords>
  );
}

function WhereTheNodeViewsNodeIs({ viewTypeId, hostServices }: { viewTypeId: string; hostServices: StudioViewHostServices }) {
  const activeStreamTab = useViewReading(hostServices.watchActiveStreamTab);
  if (activeStreamTab === null) return null;
  return <WhereTheNodeViewsNodeIsInTheTab key={activeStreamTab.stream} streamTab={activeStreamTab} viewTypeId={viewTypeId} hostServices={hostServices} />;
}

/** The view type `listed`, declared by `manifest` and brought by `broughtBy`: an `area` view's frame fills its area, and a `node` view's shows the active tab's node of its type. */
export function tatolabFrameViewType(listed: ListedStudioView, manifest: TatolabViewManifest, broughtBy: StudioViewTypeSource): RegisteredStudioViewType {
  return {
    view_type_id: listed.view_type_id,
    title: manifest.title,
    icon: manifest.icon === undefined ? "project_view" : { image_url: new URL(manifest.icon, listed.folder_url).href },
    brought_by: broughtBy,
    renderInAnArea: (area, hostServices) =>
      manifest.placement === "area" ? (
        <TatolabViewFrame listed={listed} manifest={manifest} area={area} hostServices={hostServices} inputWiring={{}} viewNode={null} />
      ) : (
        <TatolabNodeView listed={listed} manifest={manifest} area={area} hostServices={hostServices} />
      ),
    renderWordsAfterTheViewTypeMenu:
      manifest.placement === "node" ? (hostServices) => <WhereTheNodeViewsNodeIs viewTypeId={listed.view_type_id} hostServices={hostServices} /> : undefined,
  };
}
