// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { chooseSelectedStreamName } from "./stream_selection";
import {
  abbreviateHomeDirectory,
  countLabel,
  presentStreamPrimaryAction,
  presentStreamRunMode,
  presentStreamState,
  streamNotLoadedReason,
  streamStepCountLabel,
} from "./stream_presentation";

function listedStream(name: string, state: string, nodeCount: number | null): ListedStream {
  return { name, state, project_directory: `/Users/ada/streams/${name}`, node_count: nodeCount, failed_because: null };
}

describe("presentStreamState", () => {
  it("words a loaded stream Running, one still loading Starting, and a stopped or failed one as it is", () => {
    expect(presentStreamState(listedStream("main", "attached", 4))).toMatchObject({ label: "Running", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "kept", 4))).toMatchObject({ label: "Running", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "kept", null))).toMatchObject({ label: "Starting", emphasis: "starting" });
    expect(presentStreamState(listedStream("main", "stopped", null))).toMatchObject({ label: "Stopped", emphasis: "quiet" });
    expect(presentStreamState(listedStream("main", "failed", null))).toMatchObject({ label: "Failed", emphasis: "failure" });
  });

  it("says what each word means, and gives a failed stream's whole reason", () => {
    expect(presentStreamState(listedStream("main", "kept", 4)).meaning).toBe("Running: its graph is loaded in the runtime.");
    expect(presentStreamState(listedStream("pattern-two", "stopped", null)).meaning).toBe("Stopped: remembered, not loaded. Start loads it again.");
    const failed = { ...listedStream("lobby", "failed", null), failed_because: "camera access is denied" };
    expect(presentStreamState(failed).meaning).toBe("camera access is denied");
  });

  it("labels a state newer than this app plainly instead of failing", () => {
    expect(presentStreamState(listedStream("main", "awaiting_restart", 2))).toMatchObject({
      label: "Awaiting restart",
      emphasis: "plain",
    });
    expect(presentStreamState(listedStream("main", "", null)).label).toBe("Unknown");
  });
});

describe("presentStreamRunMode", () => {
  it("words a kept, stopped or failed stream Always on and an attached one Dev session, keeping the runtime's term", () => {
    for (const keptState of ["kept", "stopped", "failed"]) {
      expect(presentStreamRunMode(listedStream("main", keptState, null))).toMatchObject({ label: "Always on", runtimeTerm: keptState });
    }
    expect(presentStreamRunMode(listedStream("main", "attached", 4))).toMatchObject({ label: "Dev session", runtimeTerm: "attached" });
  });

  it("has no run mode for a state newer than this app", () => {
    expect(presentStreamRunMode(listedStream("main", "awaiting_restart", 2))).toBeNull();
  });
});

describe("streamStepCountLabel", () => {
  it("counts a loaded graph's steps and dashes a stream that is not loaded", () => {
    expect(streamStepCountLabel(listedStream("main", "kept", 4))).toBe("4");
    expect(streamStepCountLabel(listedStream("main", "stopped", null))).toBe("—");
  });
});

describe("presentStreamPrimaryAction", () => {
  it("stops a loaded stream, starts a stopped one and retries a failed one", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "kept", 4))).toMatchObject({ streamAction: "stop_stream", label: "Stop" });
    expect(presentStreamPrimaryAction(listedStream("main", "stopped", null))).toMatchObject({ streamAction: "start_stream", label: "Start" });
    expect(presentStreamPrimaryAction(listedStream("main", "failed", null))).toMatchObject({ streamAction: "start_stream", label: "Retry" });
  });

  it("stops an attached stream too, saying it ends the session that runs it", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "attached", 4))).toEqual({
      streamAction: "stop_stream",
      label: "Stop",
      meaning: "Stop: ends the tatolab dev session that runs it",
    });
  });

  it("offers nothing for a state newer than this app", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "awaiting_restart", 2))).toBeNull();
  });
});

describe("streamNotLoadedReason", () => {
  it("is null for a loaded stream and names why any other stream has no graph", () => {
    expect(streamNotLoadedReason(listedStream("main", "kept", 4))).toBeNull();
    expect(streamNotLoadedReason(listedStream("main", "stopped", null))).toBe("stopped");
    expect(streamNotLoadedReason(listedStream("main", "failed", null))).toBe("failed");
    expect(streamNotLoadedReason(listedStream("main", "kept", null))).toBe("loading");
    expect(streamNotLoadedReason(listedStream("main", "awaiting_restart", null))).toBe("not_loaded");
  });
});

describe("chooseSelectedStreamName", () => {
  const streamsNamed = (...names: string[]) => names.map((name) => listedStream(name, "kept", 1));

  it("selects the first stream when none was chosen", () => {
    expect(chooseSelectedStreamName(streamsNamed("a", "b"), null, [])).toBe("a");
  });

  it("keeps the chosen stream while it is listed", () => {
    expect(chooseSelectedStreamName(streamsNamed("a", "b", "c"), "b", ["a", "b", "c"])).toBe("b");
  });

  it("moves to the next stream when the chosen one disappears, or the one before it when it was last", () => {
    expect(chooseSelectedStreamName(streamsNamed("a", "c"), "b", ["a", "b", "c"])).toBe("c");
    expect(chooseSelectedStreamName(streamsNamed("a", "b"), "c", ["a", "b", "c"])).toBe("b");
  });

  it("selects nothing when nothing is listed", () => {
    expect(chooseSelectedStreamName([], "a", ["a"])).toBeNull();
  });
});

describe("display helpers", () => {
  it("shortens a home directory to ~", () => {
    expect(abbreviateHomeDirectory("/Users/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada")).toBe("~");
    expect(abbreviateHomeDirectory("/private/tmp/pattern")).toBe("/private/tmp/pattern");
    expect(abbreviateHomeDirectory("/srv/home/ada/pattern")).toBe("/srv/home/ada/pattern");
  });

  it("counts in the singular and the plural", () => {
    expect(countLabel(1, "stream", "streams")).toBe("1 stream");
    expect(countLabel(2000, "line", "lines")).toBe("2,000 lines");
  });
});
