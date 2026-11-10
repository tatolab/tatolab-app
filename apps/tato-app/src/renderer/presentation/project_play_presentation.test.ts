import { expect, test } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { playOrStopOfferedForTheProject } from "./project_play_presentation";

const listed = (projectDirectory: string, state: string): ListedStream => ({
  stream: `${projectDirectory}-${state}`,
  display_name: "main",
  state,
  node_count: null,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: null,
  step: null,
  location: { project: "p", project_directory: projectDirectory, stream_asset: "a"},
});

test("the button offers stop while any stream of the open project plays and play otherwise, other projects' streams aside", () => {
  expect(playOrStopOfferedForTheProject("/p", { kind: "listed", streams: [listed("/p", "stopped"), listed("/p", "running")] })).toBe("stop");
  expect(playOrStopOfferedForTheProject("/p", { kind: "listed", streams: [listed("/p", "paused")] })).toBe("stop");
  expect(playOrStopOfferedForTheProject("/p", { kind: "listed", streams: [listed("/p", "stopped"), listed("/p", "failed"), listed("/other", "running")] })).toBe("play");
  expect(playOrStopOfferedForTheProject("/p", { kind: "not_listed", because: "no runtime" })).toBe("play");
  expect(playOrStopOfferedForTheProject(null, { kind: "listed", streams: [listed("/p", "running")] })).toBe("play");
});
