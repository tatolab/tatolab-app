// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { GraphOutputPortAddress } from "./stream_graph_view";

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

/** What a navigation to a stream's Overview carries when Search opened it on one exposed output. */
export interface StreamPageNavigationState {
  previewedOutput: GraphOutputPortAddress;
}

/** The output a navigation's state asks the Overview to preview, or `null` when it asks none. */
export function previewedOutputAskedBy(navigationState: unknown): GraphOutputPortAddress | null {
  if (typeof navigationState !== "object" || navigationState === null || !("previewedOutput" in navigationState)) return null;
  const previewedOutput: unknown = navigationState.previewedOutput;
  if (typeof previewedOutput !== "object" || previewedOutput === null || !("node" in previewedOutput) || !("port" in previewedOutput)) return null;
  const { node, port } = previewedOutput;
  return typeof node === "string" && typeof port === "string" ? { node, port } : null;
}
