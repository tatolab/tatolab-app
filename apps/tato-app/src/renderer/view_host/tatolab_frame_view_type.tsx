// A view made with the view SDK, drawn in a frame of its own so its styles and the window's never
// mix, its one channel to Studio the MessagePort its bridge answers. Every view runs with full access,
// framed on the window's origin so its Image frames cross as `VideoFrame`s with no copy. A project
// view whose newer version is blocked keeps its frame on the version that last passed, under a bar
// saying why the newer one is blocked; the frame keeps its URL, so it does not reload.

import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { VIEW_PORT_HANDOVER, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import { StudioAreaHeaderRowOfAWaitingView, StudioAreaHeaderWords } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { JsonValue, StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostServices, StudioViewNodeAddress, StudioViewTypeSource } from "./studio_view_contract";
import type { InputWiring } from "@tatolab/tato-app-view-sdk/pin_model/input_wiring";
import { nodesOfTheStudioViewType, settingsTheViewNodeHolds, studioViewInputWiring, studioViewNodeAddressOf } from "./studio_view_node_wiring";
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

/**
 * The view's frame, on its entry, served by a bridge that reads its inputs from `inputWiring`, writes its outputs onto `viewNode` and
 * reads its settings from `settingsHeld`, each followed as it changes; a reload of the frame is served by a new one. An `area` view's
 * settings are its area's; a `node` view's are what its node holds.
 */
function TatolabViewFrame({
  listed,
  manifest,
  area,
  hostServices,
  inputWiring,
  viewNode,
  settingsHeld,
}: TatolabViewOfAnArea & { inputWiring: Record<string, InputWiring>; viewNode: StudioViewNodeAddress | null; settingsHeld: JsonValue | undefined }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<TatolabViewBridge | null>(null);
  const inputWiringRef = useRef(inputWiring);
  inputWiringRef.current = inputWiring;
  const inputWiringAsJson = JSON.stringify(inputWiring);
  const viewNodeRef = useRef(viewNode);
  viewNodeRef.current = viewNode;
  const viewNodeAsJson = JSON.stringify(viewNode);
  const rememberSettingsRef = useRef(area.rememberSettings);
  rememberSettingsRef.current = area.rememberSettings;
  const [savedSettings] = useState(() => new WatchedStudioValue<{ saved: JsonValue | undefined }>({ saved: settingsHeld }));
  const savedSettingsAsJson = JSON.stringify(settingsHeld) ?? "";
  const savedSettingsRef = useRef(settingsHeld);
  savedSettingsRef.current = settingsHeld;

  useEffect(() => () => bridgeRef.current?.close(), []);
  useEffect(() => {
    savedSettings.publish({ saved: savedSettingsRef.current });
  }, [savedSettings, savedSettingsAsJson]);
  useEffect(() => {
    bridgeRef.current?.rewireInputs(inputWiringRef.current);
  }, [inputWiringAsJson]);
  useEffect(() => {
    bridgeRef.current?.readdress(viewNodeRef.current);
  }, [viewNodeAsJson]);

  const entryUrl = new URL(manifest.entry, listed.folder_url);
  const handTheFrameItsPort = () => {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow === null || frameWindow === undefined) return;
    bridgeRef.current?.close();
    const areaServices: TatolabViewAreaServices = {
      areaId: area.area_id,
      watchSavedSettings: (listener) => savedSettings.watch(({ saved }) => listener(saved)),
      readSavedSettings: () => savedSettings.readLatest().saved,
      rememberSettings: (settings) => rememberSettingsRef.current(settings),
      watchHeaderRow: area.header_row.watch,
      expansion: area.expansion,
    };
    const channel = new MessageChannel();
    const bridge = new TatolabViewBridge(channel.port1, listed.view_type_id, manifest, hostServices, areaServices, inputWiringRef.current, viewNodeRef.current);
    bridge.start();
    bridgeRef.current = bridge;
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
  const openProject = useViewReading(hostServices.watchOpenProject);
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
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  return (
    <TatolabViewFrame
      key={viewNode.id}
      {...view}
      inputWiring={studioViewInputWiring(streamTab.stream, graphReading.graph, viewNode, manifest.inputs)}
      viewNode={studioViewNodeAddressOf(projectFolder, graphReading.graph, viewNode, streamTab.display_name)}
      settingsHeld={settingsTheViewNodeHolds(manifest, viewNode)}
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

/**
 * The area of the view `listed` around `children`: the bar saying its newer version is blocked over them, while the Studio keeps
 * serving the version that last passed. The frame's place in the tree is the same with the bar or without, so it never reloads.
 */
function TatolabViewUnderItsNotice({ listed, children }: { listed: ListedStudioView; children: ReactNode }) {
  const newerVersionBlockedBecause = listed.newer_version_blocked_because;
  return (
    <div className="flex size-full flex-col">
      {newerVersionBlockedBecause !== null && <RefusalLine tone="warning" layout="bar" words={newerVersionBlockedBecause} data-newer-version-blocked={listed.view_type_id} />}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** The view type `listed`, declared by `manifest` and brought by `broughtBy`: an `area` view's frame fills its area, and a `node` view's shows the active tab's node of its type. */
export function tatolabFrameViewType(listed: ListedStudioView, manifest: TatolabViewManifest, broughtBy: StudioViewTypeSource): RegisteredStudioViewType {
  return {
    view_type_id: listed.view_type_id,
    title: manifest.title,
    icon: manifest.icon === undefined ? "project_view" : { image_url: new URL(manifest.icon, listed.folder_url).href },
    brought_by: broughtBy,
    manifest,
    renderInAnArea: (area, hostServices) => (
      <TatolabViewUnderItsNotice listed={listed}>
        {manifest.placement === "area" ? (
          <TatolabViewFrame listed={listed} manifest={manifest} area={area} hostServices={hostServices} inputWiring={{}} viewNode={null} settingsHeld={area.saved_settings} />
        ) : (
          <TatolabNodeView listed={listed} manifest={manifest} area={area} hostServices={hostServices} />
        )}
      </TatolabViewUnderItsNotice>
    ),
    renderWordsAfterTheViewTypeMenu:
      manifest.placement === "node" ? (hostServices) => <WhereTheNodeViewsNodeIs viewTypeId={listed.view_type_id} hostServices={hostServices} /> : undefined,
  };
}
