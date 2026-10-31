import { describe, expect, it } from "vitest";
import type { ListedStream, StreamActionDescription } from "../../shared/tatolab_backend_contract";
import { presentProjectReload } from "./project_page_presentation";

const HALLWAYS = "/Users/ada/code/hallways";

function reloadDescription(changes: Partial<StreamActionDescription>): StreamActionDescription {
  return { action: "R1-3", project_directory: HALLWAYS, kind: "load", state: "queued", step: null, streams: [], failed_because: null, ...changes };
}

function listedHallwaysStream(functionName: string, state: ListedStream["state"], failedBecause: string | null = null): ListedStream {
  return {
    stream: `hallways-${functionName}-58034f`,
    display_name: functionName,
    location: { project_directory: HALLWAYS, stream_function: `stream:${functionName}` },
    state,
    node_count: null,
    failed_because: failedBecause,
    action: null,
    step: null,
  };
}

describe("a project's Reload", () => {
  it("says its step while it is under way", () => {
    expect(presentProjectReload(HALLWAYS, { kind: "queuing" }, null)).toEqual({ kind: "under_way", words: "Reloading…", canCancel: false, cancelRefusal: null });
    expect(presentProjectReload(HALLWAYS, { kind: "following", action: "R1-3", description: null, cancel: null }, null)).toEqual({
      kind: "under_way",
      words: "Reloading: queued…",
      canCancel: true,
      cancelRefusal: null,
    });
    expect(
      presentProjectReload(HALLWAYS, { kind: "following", action: "R1-3", description: reloadDescription({ state: "in_progress", step: "making_the_venv" }), cancel: null }, null),
    ).toEqual({ kind: "under_way", words: "Reloading: making the environment…", canCancel: true, cancelRefusal: null });
  });

  it("says Cancelling while its cancel is asked or the runtime ends it, and keeps the runtime's refusal of one, Cancel pressable again", () => {
    const making = reloadDescription({ state: "in_progress", step: "making_the_venv" });
    for (const cancel of [{ kind: "asking" }, { kind: "answered" }] as const) {
      expect(presentProjectReload(HALLWAYS, { kind: "following", action: "R1-3", description: making, cancel }, null)).toEqual({
        kind: "under_way",
        words: "Cancelling the reload…",
        canCancel: false,
        cancelRefusal: null,
      });
    }
    const runningStopRefusal =
      "Invalid configuration: the stream action `Ra19ljkh20wimdvgya5udt9v1-13` is a running stop, which has begun unloading its streams and cannot be cut short; it ends done";
    expect(presentProjectReload(HALLWAYS, { kind: "following", action: "R1-3", description: making, cancel: { kind: "refused", words: runningStopRefusal } }, null)).toEqual({
      kind: "under_way",
      words: "Reloading: making the environment…",
      canCancel: true,
      cancelRefusal: runningStopRefusal,
    });
  });

  it("says what it came to, with the streams as the listing now shows them", () => {
    const tookInBoth = reloadDescription({
      state: "done",
      streams: [
        { stream: "hallways-front_door-58034f", display_name: "front_door", state: "running" },
        { stream: "hallways-back_door-58034f", display_name: "back_door", state: "running" },
      ],
    });
    const ended = { kind: "ended", action: "R1-3", description: tookInBoth } as const;

    expect(presentProjectReload(HALLWAYS, ended, [listedHallwaysStream("front_door", "running"), listedHallwaysStream("back_door", "running")])).toEqual({
      kind: "ended",
      tone: "plain",
      heading: "Reloaded: hallways is running",
      detail: "Its 2 streams are loaded.",
    });
    expect(presentProjectReload(HALLWAYS, ended, [listedHallwaysStream("front_door", "running"), listedHallwaysStream("back_door", "failed", "camera missing")])).toEqual({
      kind: "ended",
      tone: "warning",
      heading: "Reloaded: hallways is running, 1 of 2 streams failed",
      detail: "A failed stream's traceback is in its logs.",
    });
    expect(presentProjectReload(HALLWAYS, { kind: "ended", action: "R1-3", description: reloadDescription({ state: "done" }) }, [])).toMatchObject({
      tone: "warning",
      heading: "The reload loaded no stream from hallways",
    });
    expect(presentProjectReload(HALLWAYS, { kind: "ended", action: "R1-3", description: reloadDescription({ state: "cancelled" }) }, null)).toMatchObject({
      tone: "warning",
      heading: "The reload was cancelled",
    });
  });

  it("gives a failed, refused or no longer followed reload in the runtime's or Tatolab's own words", () => {
    expect(presentProjectReload(HALLWAYS, { kind: "ended", action: "R1-3", description: reloadDescription({ state: "failed", failed_because: "uv sync failed" }) }, null)).toEqual({
      kind: "refused",
      lead: "Reload failed:",
      words: "uv sync failed",
    });
    expect(presentProjectReload(HALLWAYS, { kind: "refused", words: "no stream from hallways" }, null)).toEqual({ kind: "refused", lead: "Reload was refused:", words: "no stream from hallways" });
    expect(presentProjectReload(HALLWAYS, { kind: "no_longer_followed", action: "R1-3", words: "not held" }, null)).toEqual({
      kind: "refused",
      lead: "Tatolab stopped following the reload:",
      words: "not held",
    });
  });
});
