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

test("a tab shows its stream's name alone, whatever the runtime lists it doing", () => {
  expect(streamTabsDrawnInTheStrip(OPEN_TABS)).toEqual([
    { tab_id: "main", name: "Main" },
    { tab_id: "recorder", name: "Recorder" },
  ]);
});

test("the + offers the open project's streams that no tab shows, other projects' streams aside", () => {
  const listedStreams = { kind: "listed" as const, streams: [listed("main", "/p", "running"), listed("lights", "/p", "stopped"), listed("other", "/q", "running")] };
  const offered = streamsOfTheProjectNoTabShows("/p", listedStreams, OPEN_TABS);
  expect(offered.kind === "to_open" && offered.streams.map((stream) => stream.stream)).toEqual(["lights"]);
  expect(streamsOfTheProjectNoTabShows(null, listedStreams, OPEN_TABS)).toEqual({ kind: "none_to_offer", because: "No project is open." });
});

test("the + says why it offers nothing, in the runtime's own words when it lists no streams", () => {
  expect(streamsOfTheProjectNoTabShows("/p", { kind: "not_listed", because: "No runtime answers." }, OPEN_TABS)).toEqual({ kind: "none_to_offer", because: "No runtime answers." });
  expect(streamsOfTheProjectNoTabShows("/p", { kind: "listed", streams: [listed("main", "/p", "running")] }, { tabs: [{ stream: "main", project_name: "pattern", display_name: "Main" }], active_stream: "main" })).toEqual({
    kind: "none_to_offer",
    because: "Every stream of the project is open.",
  });
});
