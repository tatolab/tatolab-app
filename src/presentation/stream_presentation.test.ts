// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { chooseSelectedStreamName } from "./stream_selection";
import { abbreviateHomeDirectory, countLabel, presentStreamState, streamNotLoadedReason } from "./stream_presentation";

function listedStream(name: string, state: string, nodeCount: number | null): ListedStream {
  return { name, state, project_directory: `/Users/ada/streams/${name}`, node_count: nodeCount, failed_because: null };
}

describe("presentStreamState", () => {
  it("words each state the runtime lists, plain while it runs, quiet when stopped and a failure when failed", () => {
    expect(presentStreamState(listedStream("main", "attached", 4))).toMatchObject({ label: "Attached", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "kept", 4))).toMatchObject({ label: "Kept", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "stopped", null))).toMatchObject({ label: "Stopped", emphasis: "quiet" });
    expect(presentStreamState(listedStream("main", "failed", null))).toMatchObject({ label: "Failed", emphasis: "failure" });
  });

  it("says what each word means, and gives a failed stream's whole reason", () => {
    expect(presentStreamState(listedStream("main", "kept", 4)).meaning).toBe(
      "Kept: Tatolab loads it every time the runtime starts, until you stop it.",
    );
    expect(presentStreamState(listedStream("pattern-two", "stopped", null)).meaning).toBe(
      "Stopped: remembered, not loaded. tatolab start pattern-two loads it.",
    );
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
