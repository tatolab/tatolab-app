// A view made with the view SDK, drawn in a frame of its own so its styles and the window's never
// mix, its one channel to Studio the MessagePort its bridge answers. Every view runs with full access,
// framed on the window's origin so its Image frames cross as `VideoFrame`s with no copy.

import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { VIEW_PORT_HANDOVER, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import { StudioAreaHeaderRowOfAWaitingView, StudioAreaHeaderWords } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { JsonValue, StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostServices, StudioViewNodeAddress, StudioViewTypeSource } from "./studio_view_contract";
import { nodesOfTheStudioViewType, studioViewInputWiring, type StudioViewInputWiring } from "./studio_view_node_wiring";
import type { RegisteredStudioViewType, StudioAreaOfTheView } from "./studio_view_type_registry";
import { TatolabViewBridge, type TatolabViewAreaServices } from "./tatolab_view_bridge";
import { WatchedStudioValue } from "./watched_studio_value";

const SYSTEM_DEVICES_A_VIEW_MAY_DECLARE = ["camera", "microphone"] as const;

/** The frame's permissions policy: the camera and microphone its manifest declares, and `'none'` for each it leaves out, since a frame on the window's origin otherwise inherits both. */
export function framePermissionsPolicyOf(manifest: TatolabViewManifest): string {
  return SYSTEM_DEVICES_A_VIEW_MAY_DECLARE.map((device) => (manifest.capabilities.includes(device) ? device : `${device} 'none'`)).join("; ");
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
  const offerGraphToolsRef = useRef(area.offerGraphTools);
  offerGraphToolsRef.current = area.offerGraphTools;
  const personWorksInTheAreaRef = useRef(area.personWorksInTheArea);
  personWorksInTheAreaRef.current = area.personWorksInTheArea;
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
      offerGraphTools: (onToolPressed) => offerGraphToolsRef.current(onToolPressed),
    };
    const channel = new MessageChannel();
    const bridge = new TatolabViewBridge(channel.port1, listed.view_type_id, manifest, hostServices, areaServices, inputWiringRef.current, viewNode);
    bridge.start();
    bridgeRef.current = bridge;
    // The window's own pointer and focus listeners never see events inside a frame, so the frame's document reports them; every view is on the window's origin.
    const personWorkedInTheFrame = () => personWorksInTheAreaRef.current?.();
    frameWindow.addEventListener("pointerdown", personWorkedInTheFrame, true);
    frameWindow.addEventListener("focusin", personWorkedInTheFrame);
    frameWindow.postMessage({ kind: VIEW_PORT_HANDOVER }, entryUrl.origin, [channel.port2]);
  };

  return (
    <iframe
      ref={frameRef}
      title={manifest.title}
      src={entryUrl.href}
      allow={framePermissionsPolicyOf(manifest)}
      referrerPolicy="no-referrer"
      className="size-full border-0 bg-studio-area"
      onLoad={handTheFrameItsPort}
      data-tatolab-view={listed.view_type_id}
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
