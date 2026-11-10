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

/** The streams of the project in `projectFolder` the runtime lists that no tab shows yet, in the order it lists them. */
export function streamsOfTheProjectNoTabShows(projectFolder: string | null, listedStreams: ListedStreamsReading, openStreamTabs: OpenStreamTabs): ListedStream[] {
  if (projectFolder === null || listedStreams.kind !== "listed") return [];
  const shownStreams = new Set(openStreamTabs.tabs.map((tab) => tab.stream));
  return listedStreams.streams.filter((stream) => stream.location?.project_directory === projectFolder && !shownStreams.has(stream.stream));
}
