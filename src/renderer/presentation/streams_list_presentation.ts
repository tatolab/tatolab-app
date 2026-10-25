// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream, TatolabPlatform, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";
import { presentPlatform } from "./platform_presentation";
import { abbreviateHomeDirectory, isStreamLoaded } from "./stream_presentation";

/** Which streams the Streams list shows. */
export type StreamsListFilter = "all" | "running" | "stopped" | "failed";

/** The Streams list's filters, in the order the segmented control shows them. */
export const STREAMS_LIST_FILTERS: readonly { filter: StreamsListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "running", label: "Running" },
  { filter: "stopped", label: "Stopped" },
  { filter: "failed", label: "Failed" },
];

/** Whether `stream` is one `filter` shows: kept and attached streams count as Running. */
export function streamMatchesListFilter(stream: ListedStream, filter: StreamsListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return stream.state === "kept" || stream.state === "attached";
    case "stopped":
    case "failed":
      return stream.state === filter;
  }
}

/** Whether `stream`'s name or project folder holds `filterText`, ignoring case; blank text matches every stream. */
export function streamMatchesFilterText(stream: ListedStream, filterText: string): boolean {
  const wantedText = filterText.trim().toLowerCase();
  return wantedText === "" || `${stream.name}\n${stream.project_directory}`.toLowerCase().includes(wantedText);
}

/** `5 of 7 loaded on studio-mac`, `None of 2 …`, or `Nothing loaded on …` with no streams at all. */
export function streamsListHeadline(streams: readonly ListedStream[], machineName: string | null, platform: TatolabPlatform): string {
  const machineWords = machineName ?? presentPlatform(platform).thisMachineMidSentence;
  if (streams.length === 0) return `Nothing loaded on ${machineWords}`;
  const loadedCount = streams.filter(isStreamLoaded).length;
  return `${loadedCount === 0 ? "None" : loadedCount} of ${streams.length} loaded on ${machineWords}`;
}

/** What the dialog asking to remove a stream says. */
export interface StreamRemovalConfirmationPresentation {
  title: string;
  explanation: string;
}

/** The question before `remove_stream`, the one action that loses a stream. */
export function presentStreamRemovalConfirmation(stream: ListedStream): StreamRemovalConfirmationPresentation {
  return {
    title: `Remove ${stream.name}?`,
    explanation: `The runtime unloads it and forgets it, so it no longer loads when the runtime starts. Its project folder, ${abbreviateHomeDirectory(stream.project_directory)}, stays as it is.`,
  };
}

/** A stream action the window asked for, with the listing it saw when it asked and whether the runtime has answered. */
export interface StreamActionUnderWay {
  streamAction: TatolabStreamActionName;
  listingWhenAsked: ListedStream | null;
  isAnswered: boolean;
}

function sameListing(firstListing: ListedStream | null, secondListing: ListedStream | null): boolean {
  return JSON.stringify(firstListing) === JSON.stringify(secondListing);
}

/** Whether a row still shows its action as under way: until the runtime answers, then until the listing differs from the one seen when asking. */
export function isStreamActionStillUnderWay(actionUnderWay: StreamActionUnderWay, listingNow: ListedStream | null): boolean {
  return !actionUnderWay.isAnswered || sameListing(actionUnderWay.listingWhenAsked, listingNow);
}
