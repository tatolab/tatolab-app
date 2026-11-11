import { expect, test } from "vitest";
import { streamTabsDrawnInTheStrip } from "./stream_tabs_presentation";

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
