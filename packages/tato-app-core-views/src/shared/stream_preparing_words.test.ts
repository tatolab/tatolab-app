import { expect, test } from "vitest";
import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamPreparingWords } from "./stream_preparing_words";

const listed = (state: string, step: string | null): ListedStream => ({
  stream: "night-show-main-b21feb",
  display_name: "main",
  location: null,
  state,
  node_count: null,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: state === "preparing" ? "start" : null,
  step,
});

test("names a preparing stream's step, waits in its queue, keeps a newer step's spelling, and says nothing of a stream at rest", () => {
  expect(streamPreparingWords(listed("preparing", "making_the_venv"), "main")).toEqual({ title: "main is preparing", explanation: "Installing the project's Python packages…" });
  expect(streamPreparingWords(listed("preparing", null), "main")?.explanation).toBe("Waiting for the project's other stream actions to finish…");
  expect(streamPreparingWords(listed("preparing", "warming_the_cache"), "main")?.explanation).toBe("warming_the_cache…");
  expect(streamPreparingWords(listed("stopping", null), "main")?.title).toBe("main is stopping");
  expect(streamPreparingWords(listed("stopped", null), "main")).toBeNull();
  expect(streamPreparingWords(undefined, "main")).toBeNull();
});
