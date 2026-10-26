import { describe, expect, it } from "vitest";
import { presentGraphLinkState } from "./stream_graph_presentation";

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
