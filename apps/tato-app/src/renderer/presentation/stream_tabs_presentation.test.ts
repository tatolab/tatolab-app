import { expect, test } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { streamsOfTheProjectNoTabShows, streamTabsDrawnInTheStrip } from "./stream_tabs_presentation";

const listed = (stream: string, projectDirectory: string, state: string): ListedStream => ({
  stream,
  display_name: stream,
  state,
  node_count: null,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: null,
  step: null,
  location: { project: "p", project_directory: projectDirectory, stream_asset: "a" },
});

const OPEN_TABS = {
  tabs: [
    { stream: "main", project_name: "pattern", display_name: "Main" },
    { stream: "recorder", project_name: "pattern", display_name: "Recorder" },
  ],
  active_stream: "main",
};

test("a tab is marked running only while the runtime lists its stream running", () => {
  const listedStreams = { kind: "listed" as const, streams: [listed("main", "/p", "running"), listed("recorder", "/p", "preparing")] };
  expect(streamTabsDrawnInTheStrip(OPEN_TABS, listedStreams).map((tab) => [tab.tab_id, tab.name, tab.is_running])).toEqual([
    ["main", "Main", true],
    ["recorder", "Recorder", false],
  ]);
  expect(streamTabsDrawnInTheStrip(OPEN_TABS, { kind: "not_listed", because: "no runtime" }).map((tab) => tab.is_running)).toEqual([false, false]);
});

test("the + offers the open project's streams that no tab shows, other projects' streams aside", () => {
  const listedStreams = { kind: "listed" as const, streams: [listed("main", "/p", "running"), listed("lights", "/p", "stopped"), listed("other", "/q", "running")] };
  expect(streamsOfTheProjectNoTabShows("/p", listedStreams, OPEN_TABS).map((stream) => stream.stream)).toEqual(["lights"]);
  expect(streamsOfTheProjectNoTabShows(null, listedStreams, OPEN_TABS)).toEqual([]);
});
