// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** An output port, by its node and name, such as the one a navigation asks a stream's page to preview or pin. */
export interface GraphOutputPortAddress {
  node: string;
  port: string;
}

/** The tabs of a stream's page, in the order its header shows them. */
export const STREAM_PAGE_TABS = ["overview", "graph", "logs", "inspect"] as const;

/** One tab of a stream's page. */
export type StreamPageTab = (typeof STREAM_PAGE_TABS)[number];

/** The path of `streamName`'s page in the window's router, on `tab`; Overview is the page's own path. */
export function streamPagePath(streamName: string, tab: StreamPageTab = "overview"): string {
  const streamPath = `/streams/${encodeURIComponent(streamName)}`;
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

/** What a navigation to a stream's page carries when Search opened it on one exposed output: previewed in the Overview, or pinned on Graph. */
export type StreamPageNavigationState = { previewedOutput: GraphOutputPortAddress } | { pinnedOutput: GraphOutputPortAddress };

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
