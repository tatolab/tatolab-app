import type { ProjectPlaybackAsListed } from "../../shared/project_playback";

/** What the person asks of the open project's playback through the Run menu, its keys, or the title row's player control. */
export type ProjectPlaybackAskedFor = "run" | "pause" | "stop";

/** One thing the person can ask of the open project's playback: offered, or dim with why. */
export interface ProjectPlaybackChoice {
  asked_for: ProjectPlaybackAskedFor;
  label: "Play" | "Resume" | "Pause" | "Stop";
  unavailable_because: string | null;
}

/** What the Run menu and the title row's player control offer of the open project's playback, from one reading of the runtime's streams. */
export interface ProjectPlaybackControls {
  /** Play or Resume, Pause, then Stop, in the Run menu's order. */
  choices: readonly [ProjectPlaybackChoice, ProjectPlaybackChoice, ProjectPlaybackChoice];
  /** The choice the player control's button leads with: the next step from where the playback stands. */
  lead: ProjectPlaybackChoice;
  /** Whether the project is live, playing, paused or starting, which the player control shows on the brand's ground. */
  is_live: boolean;
}

/** The open project's playback as the runtime lists its streams, or why it lists none now. */
export type ProjectPlaybackReading = { kind: "listed"; listed: Pick<ProjectPlaybackAsListed, "playback" | "a_stream_has_failed"> } | { kind: "not_listed"; because: string };

/** Why Play waits while the project already plays. */
export const ALREADY_PLAYING_REASON = "Already playing";
/** Why Pause waits while the project is paused. */
export const ALREADY_PAUSED_REASON = "Already paused";
/** Why Stop waits while the project is stopped. */
export const ALREADY_STOPPED_REASON = "Already stopped";
/** Why Pause and Stop wait while the project's streams are not loaded. */
export const NOT_PLAYING_REASON = "The project isn't playing";
/** Why Play and Pause wait while the runtime starts the project. */
export const STARTING_REASON = "The project is starting";
/** Why every choice waits while the runtime stops the project. */
export const STOPPING_REASON = "The project is stopping";

/** The Run menu's and the player control's choices for `reading`: each one the runtime's state allows offered, the rest dim with why. */
export function presentProjectPlaybackControls(reading: ProjectPlaybackReading): ProjectPlaybackControls {
  if (reading.kind === "not_listed") {
    const run: ProjectPlaybackChoice = { asked_for: "run", label: "Play", unavailable_because: reading.because };
    return { choices: [run, { asked_for: "pause", label: "Pause", unavailable_because: reading.because }, { asked_for: "stop", label: "Stop", unavailable_because: reading.because }], lead: run, is_live: false };
  }
  const { playback, a_stream_has_failed: aStreamHasFailed } = reading.listed;
  const choicesWhileUnavailable = (
    runBecause: string | null,
    pauseBecause: string | null,
    stopBecause: string | null,
    runLabel: "Play" | "Resume" = "Play",
  ): ProjectPlaybackControls["choices"] => [
    { asked_for: "run", label: runLabel, unavailable_because: runBecause },
    { asked_for: "pause", label: "Pause", unavailable_because: pauseBecause },
    { asked_for: "stop", label: "Stop", unavailable_because: stopBecause },
  ];
  switch (playback) {
    case "closed": {
      const choices = choicesWhileUnavailable(null, NOT_PLAYING_REASON, NOT_PLAYING_REASON);
      return { choices, lead: choices[0], is_live: false };
    }
    case "stopped": {
      const choices = choicesWhileUnavailable(null, NOT_PLAYING_REASON, ALREADY_STOPPED_REASON);
      return { choices, lead: choices[0], is_live: false };
    }
    case "starting": {
      const choices = choicesWhileUnavailable(STARTING_REASON, STARTING_REASON, null);
      return { choices, lead: choices[2], is_live: true };
    }
    case "playing": {
      const choices = choicesWhileUnavailable(aStreamHasFailed ? null : ALREADY_PLAYING_REASON, null, null);
      return { choices, lead: choices[1], is_live: true };
    }
    case "paused": {
      const choices = choicesWhileUnavailable(null, ALREADY_PAUSED_REASON, null, "Resume");
      return { choices, lead: choices[0], is_live: true };
    }
    case "stopping": {
      const choices = choicesWhileUnavailable(STOPPING_REASON, STOPPING_REASON, STOPPING_REASON);
      return { choices, lead: choices[2], is_live: false };
    }
  }
}
