/** An output port, by its node and name, such as the one a navigation asks a stream's page to preview or pin. */
export interface GraphOutputPortAddress {
  node: string;
  port: string;
}

/** The tabs of a stream's page, in the order its header shows them. */
export const STREAM_PAGE_TABS = ["overview", "graph", "logs", "inspect"] as const;

/** One tab of a stream's page. */
export type StreamPageTab = (typeof STREAM_PAGE_TABS)[number];

/** The path of `streamId`'s page in the window's router, on `tab`; Overview is the page's own path. */
export function streamPagePath(streamId: string, tab: StreamPageTab = "overview"): string {
  const streamPath = `/streams/${encodeURIComponent(streamId)}`;
  return tab === "overview" ? streamPath : `${streamPath}/${tab}`;
}

/** The tab a stream page's path names after the stream: Overview when it names none, `null` when it names no tab. */
export function streamPageTabNamed(tabInThePath: string | undefined): StreamPageTab | null {
  if (tabInThePath === undefined) return "overview";
  return STREAM_PAGE_TABS.find((tab) => tab === tabInThePath && tab !== "overview") ?? null;
}

/** Whether the router shows a stream's page. */
export function isShowingAStreamPage(pathname: string): boolean {
  return pathname.startsWith("/streams/");
}

/** The tab the router shows of a stream's page; `null` off a stream page. */
export function streamPageTabShownAt(pathname: string): StreamPageTab | null {
  if (!isShowingAStreamPage(pathname)) return null;
  return streamPageTabNamed(pathname.split("/")[3]);
}

/** How a navigation asks Logs to open: narrowed to its errors, or with its search focused. */
export type AskedStreamLogView = "errors_only" | "search_focused";

/**
 * What a navigation to a stream's page carries: an exposed output Search opened it on, previewed in the Overview or
 * pinned on Graph; how Logs should open; or the step Graph should select.
 */
export type StreamPageNavigationState =
  | { previewedOutput: GraphOutputPortAddress }
  | { pinnedOutput: GraphOutputPortAddress }
  | { askedLogView: AskedStreamLogView }
  | { selectedStep: string };

function outputAddressUnder(navigationState: unknown, stateKey: "previewedOutput" | "pinnedOutput"): GraphOutputPortAddress | null {
  if (typeof navigationState !== "object" || navigationState === null) return null;
  const askedOutput: unknown = Reflect.get(navigationState, stateKey);
  if (typeof askedOutput !== "object" || askedOutput === null || !("node" in askedOutput) || !("port" in askedOutput)) return null;
  const { node, port } = askedOutput;
  return typeof node === "string" && typeof port === "string" ? { node, port } : null;
}

/** The output a navigation's state asks the Overview to preview, or `null` when it asks none. */
export function previewedOutputAskedBy(navigationState: unknown): GraphOutputPortAddress | null {
  return outputAddressUnder(navigationState, "previewedOutput");
}

/** The output a navigation's state asks Graph to pin, or `null` when it asks none. */
export function pinnedOutputAskedBy(navigationState: unknown): GraphOutputPortAddress | null {
  return outputAddressUnder(navigationState, "pinnedOutput");
}

/** How a navigation's state asks Logs to open, or `null` when it asks nothing of it. */
export function logViewAskedBy(navigationState: unknown): AskedStreamLogView | null {
  if (typeof navigationState !== "object" || navigationState === null) return null;
  const askedLogView: unknown = Reflect.get(navigationState, "askedLogView");
  return askedLogView === "errors_only" || askedLogView === "search_focused" ? askedLogView : null;
}

/** The step a navigation's state asks Graph to select, or `null` when it asks none. */
export function selectedStepAskedBy(navigationState: unknown): string | null {
  if (typeof navigationState !== "object" || navigationState === null) return null;
  const selectedStep: unknown = Reflect.get(navigationState, "selectedStep");
  return typeof selectedStep === "string" ? selectedStep : null;
}
