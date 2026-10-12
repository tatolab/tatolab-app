import { describe, expect, it } from "vitest";
import { presentGraphLinkState, presentGraphNodeState } from "./stream_graph_presentation";

describe("presentGraphNodeState", () => {
  it("draws a running node, or one with no state, plainly with no foot", () => {
    expect(presentGraphNodeState("Running", true)).toEqual({ look: "running", footText: null, isFailure: false });
    expect(presentGraphNodeState(null, true)).toEqual({ look: "running", footText: null, isFailure: false });
  });

  it("words starting, idle and paused nodes quietly, and an errored node as the failure it is", () => {
    expect(presentGraphNodeState("Pending", true)).toEqual({ look: "starting", footText: "Starting…", isFailure: false });
    expect(presentGraphNodeState("Idle", true)).toEqual({ look: "idle", footText: "Idle", isFailure: false });
    expect(presentGraphNodeState("Paused", true)).toEqual({ look: "paused", footText: "Paused", isFailure: false });
    expect(presentGraphNodeState("Error", true)).toEqual({
      look: "error",
      footText: "In error. The reason is in the logs.",
      isFailure: true,
    });
  });

  it("shows a state newer than this app as its raw word, and a node in another stream apart", () => {
    expect(presentGraphNodeState("Draining", true)).toEqual({ look: "running", footText: "Draining", isFailure: false });
    expect(presentGraphNodeState("Running", false).look).toBe("outside_this_stream");
  });
});

describe("presentGraphLinkState", () => {
  it("strokes and words each link state", () => {
    expect(presentGraphLinkState({ state: "wired", source_node: "a" })).toEqual({ look: "wired", sentence: "Wired" });
    expect(presentGraphLinkState({ state: "pending", source_node: "a" })).toEqual({ look: "pending", sentence: "Wiring…" });
    expect(presentGraphLinkState({ state: "awaiting_remote", source_node: "camerasource" })).toEqual({
      look: "pending",
      sentence: "Waiting for camerasource to be exposed",
    });
    expect(presentGraphLinkState({ state: "error", source_node: "a" })).toEqual({ look: "error", sentence: "This link failed" });
    expect(presentGraphLinkState({ state: "disconnecting", source_node: "a" }).look).toBe("ending");
    expect(presentGraphLinkState({ state: "disconnected", source_node: "a" })).toEqual({ look: "ending", sentence: "Disconnected" });
  });

  it("dashes a link state newer than this app and says its raw word", () => {
    expect(presentGraphLinkState({ state: "rewiring", source_node: "a" })).toEqual({ look: "pending", sentence: "rewiring" });
  });
});
