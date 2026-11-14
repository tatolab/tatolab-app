import type { ListedStream } from "./tatolab_backend_contract.js";

/** The state the runtime lists each stream of a closed project in: unloaded until `open_project`. */
const STREAM_STATE_OF_A_CLOSED_PROJECT = "closed";

/**
 * A project's playback as the runtime lists its streams: `closed` while none is loaded, `paused` while one is `paused`, `stopping` while one is `stopping`,
 * `playing` while one is `running`, `preparing` while one is `preparing` under an action that opens, loads or starts the project, else `stopped`.
 */
export type ProjectPlayback = "closed" | "stopped" | "preparing" | "playing" | "paused" | "stopping";

/** A project's playback as the runtime lists its streams, whether one of them failed, and whether one of them runs. */
export interface ProjectPlaybackAsListed {
  readonly playback: ProjectPlayback;
  readonly a_stream_has_failed: boolean;
  readonly a_stream_is_running: boolean;
}

/** The streams of `listedStreams` whose project lives in `projectDirectory`. */
export function streamsOfTheProjectIn(listedStreams: readonly ListedStream[], projectDirectory: string): ListedStream[] {
  return listedStreams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
}

/** Whether `streamsOfTheProject` list their project open: any one of them in a state other than `closed`. */
export function theStreamsListTheProjectOpen(streamsOfTheProject: readonly ListedStream[]): boolean {
  return streamsOfTheProject.some((listedStream) => listedStream.state !== STREAM_STATE_OF_A_CLOSED_PROJECT);
}

function aStreamOfTheProjectIs(streamsOfTheProject: readonly ListedStream[], state: string): boolean {
  return streamsOfTheProject.some((listedStream) => listedStream.state === state);
}

function projectPlaybackOfTheStreams(streamsOfTheProject: readonly ListedStream[]): ProjectPlayback {
  if (!theStreamsListTheProjectOpen(streamsOfTheProject)) return "closed";
  if (aStreamOfTheProjectIs(streamsOfTheProject, "paused")) return "paused";
  if (aStreamOfTheProjectIs(streamsOfTheProject, "stopping")) return "stopping";
  if (aStreamOfTheProjectIs(streamsOfTheProject, "running")) return "playing";
  if (aStreamOfTheProjectIs(streamsOfTheProject, "preparing")) return "preparing";
  return "stopped";
}

/** The playback of the project in `projectDirectory` as `listedStreams` list it. */
export function projectPlaybackAsListed(listedStreams: readonly ListedStream[], projectDirectory: string): ProjectPlaybackAsListed {
  const streamsOfTheProject = streamsOfTheProjectIn(listedStreams, projectDirectory);
  return {
    playback: projectPlaybackOfTheStreams(streamsOfTheProject),
    a_stream_has_failed: aStreamOfTheProjectIs(streamsOfTheProject, "failed"),
    a_stream_is_running: aStreamOfTheProjectIs(streamsOfTheProject, "running"),
  };
}
