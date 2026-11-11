import { describe, expect, it } from "vitest";
import type { PortPickInTheStreamGraph } from "@tatolab/tato-app-view-sdk";
import { ANOTHER_PORT_PICK_STARTED, PortPickHeldInTheWindow } from "./port_pick_held_in_the_window";

const framesOfTheMeter: PortPickInTheStreamGraph = { stream: "main", node: "id-meter", port: "frames", direction: "input" };

describe("the pick held in the window", () => {
  it("is shown until answered, and the asking view gets the port picked", async () => {
    const held = new PortPickHeldInTheWindow();
    const picksShown: (PortPickInTheStreamGraph | null)[] = [];
    held.portPick.watch((pick) => picksShown.push(pick));
    const ending = held.start(framesOfTheMeter, null);
    expect(held.answer("id-camera", "video")).toEqual({ kind: "answered" });
    expect(await ending).toEqual({ kind: "picked", node: "id-camera", port: "video" });
    expect(picksShown).toEqual([null, framesOfTheMeter, null]);
  });

  it("ends the pick held when another starts, and refuses an answer with none held", async () => {
    const held = new PortPickHeldInTheWindow();
    const first = held.start(framesOfTheMeter, null);
    const second = held.start({ ...framesOfTheMeter, port: "gain" }, null);
    expect(await first).toEqual({ kind: "ended", because: ANOTHER_PORT_PICK_STARTED });
    held.end("Esc ended the pick.");
    expect(await second).toEqual({ kind: "ended", because: "Esc ended the pick." });
    expect(held.answer("id-camera", "video").kind).toBe("not_answered");
  });

  it("does not start, holding nothing, when the window cannot show the pick", async () => {
    const held = new PortPickHeldInTheWindow();
    expect(await held.start(framesOfTheMeter, "No area shows the Stream graph.")).toEqual({ kind: "not_started", because: "No area shows the Stream graph." });
    expect(held.portPick.readLatest()).toBeNull();
  });
});
