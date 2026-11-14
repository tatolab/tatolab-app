import { describe, expect, it } from "vitest";
import type { ProjectPlayback } from "../../shared/project_playback";
import {
  ALREADY_PAUSED_REASON,
  ALREADY_PLAYING_REASON,
  ALREADY_STOPPED_REASON,
  NOT_PLAYING_REASON,
  presentProjectPlaybackControls,
  STARTING_REASON,
  STOPPING_REASON,
  type ProjectPlaybackControls,
} from "./project_playback_presentation";

function controlsOf(playback: ProjectPlayback, aStreamHasFailed = false): ProjectPlaybackControls {
  return presentProjectPlaybackControls({ kind: "listed", listed: { playback, a_stream_has_failed: aStreamHasFailed } });
}

function offeredOf(controls: ProjectPlaybackControls): string[] {
  return controls.choices.filter((choice) => choice.unavailable_because === null).map((choice) => choice.label);
}

describe("the open project's playback controls", () => {
  it("offer only the steps the runtime's state allows, leading with the next one", () => {
    expect([offeredOf(controlsOf("closed")), controlsOf("closed").lead.label, controlsOf("closed").is_live]).toEqual([["Play"], "Play", false]);
    expect([offeredOf(controlsOf("stopped")), controlsOf("stopped").lead.label, controlsOf("stopped").is_live]).toEqual([["Play"], "Play", false]);
    expect([offeredOf(controlsOf("starting")), controlsOf("starting").lead.label, controlsOf("starting").is_live]).toEqual([["Stop"], "Stop", true]);
    expect([offeredOf(controlsOf("playing")), controlsOf("playing").lead.label, controlsOf("playing").is_live]).toEqual([["Pause", "Stop"], "Pause", true]);
    expect([offeredOf(controlsOf("paused")), controlsOf("paused").lead.label, controlsOf("paused").is_live]).toEqual([["Resume", "Stop"], "Resume", true]);
    expect([offeredOf(controlsOf("stopping")), controlsOf("stopping").lead.label, controlsOf("stopping").is_live]).toEqual([[], "Stop", false]);
  });

  it("say why each step the runtime's state refuses waits", () => {
    expect(controlsOf("stopped").choices.map((choice) => choice.unavailable_because)).toEqual([null, NOT_PLAYING_REASON, ALREADY_STOPPED_REASON]);
    expect(controlsOf("playing").choices[0].unavailable_because).toBe(ALREADY_PLAYING_REASON);
    expect(controlsOf("paused").choices[1].unavailable_because).toBe(ALREADY_PAUSED_REASON);
    expect(controlsOf("starting").choices[0].unavailable_because).toBe(STARTING_REASON);
    expect(controlsOf("stopping").lead.unavailable_because).toBe(STOPPING_REASON);
  });

  it("keep Play offered while a stream of a playing project has failed, since playing again retries it", () => {
    expect(offeredOf(controlsOf("playing", true))).toEqual(["Play", "Pause", "Stop"]);
  });

  it("wait, in the reason the runtime gives, while it lists no streams", () => {
    const controls = presentProjectPlaybackControls({ kind: "not_listed", because: "The runtime is starting" });
    expect(controls.choices.map((choice) => choice.unavailable_because)).toEqual(["The runtime is starting", "The runtime is starting", "The runtime is starting"]);
    expect(controls.is_live).toBe(false);
  });
});
