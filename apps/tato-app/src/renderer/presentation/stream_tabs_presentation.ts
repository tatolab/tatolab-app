// The open streams' tabs as the window draws them: each marked while the runtime lists its stream running, and the
// open project's other streams that the + after the tabs offers to open.

import type { DocumentTab } from "@tatolab/tato-app-view-sdk/design_system/document_tabs";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import type { OpenStreamTabs } from "../studio_shell/studio_window_model";
import type { ListedStreamsReading } from "../view_host/studio_view_contract";

/** Each open tab as the strip draws it, running while the runtime lists its stream `running`. */
export function streamTabsDrawnInTheStrip(openStreamTabs: OpenStreamTabs, listedStreams: ListedStreamsReading): DocumentTab[] {
  const runningStreams = new Set(listedStreams.kind === "listed" ? listedStreams.streams.filter((stream) => stream.state === "running").map((stream) => stream.stream) : []);
  return openStreamTabs.tabs.map((tab) => ({ tab_id: tab.stream, context_words: tab.project_name, name: tab.display_name, is_running: runningStreams.has(tab.stream) }));
}

/** The streams of the project in `projectFolder` the runtime lists that no tab shows yet, in the order it lists them, or why there are none to offer. */
export type StreamsToOpenAsTabs = { kind: "to_open"; streams: ListedStream[] } | { kind: "none_to_offer"; because: string };

/** What the + after the tabs offers for the project in `projectFolder`. */
export function streamsOfTheProjectNoTabShows(projectFolder: string | null, listedStreams: ListedStreamsReading, openStreamTabs: OpenStreamTabs): StreamsToOpenAsTabs {
  if (projectFolder === null) return { kind: "none_to_offer", because: "No project is open." };
  if (listedStreams.kind !== "listed") return { kind: "none_to_offer", because: listedStreams.because };
  const shownStreams = new Set(openStreamTabs.tabs.map((tab) => tab.stream));
  const streams = listedStreams.streams.filter((stream) => stream.location?.project_directory === projectFolder && !shownStreams.has(stream.stream));
  return streams.length === 0 ? { kind: "none_to_offer", because: "Every stream of the project is open." } : { kind: "to_open", streams };
}
