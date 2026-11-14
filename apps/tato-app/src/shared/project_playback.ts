import type { ListedStream } from "./tatolab_backend_contract.js";

/** The state the runtime lists each stream of a closed project in: unloaded until `open_project`. */
const STREAM_STATE_OF_A_CLOSED_PROJECT = "closed";

/**
 * A project's playback as the runtime lists its streams: `closed` while none is loaded, `paused` while one is `paused`, `stopping` while one is `stopping`,
 * `starting` while one is `preparing`, `playing` while one is `running`, else `stopped`.
 */
export type ProjectPlayback = "closed" | "stopped" | "starting" | "playing" | "paused" | "stopping";

/** A project's playback as the runtime lists its streams, and whether one of them failed. */
export interface ProjectPlaybackAsListed {
  playback: ProjectPlayback;
  a_stream_has_failed: boolean;
}

/** The streams of `listedStreams` whose project lives in `projectDirectory`. */
export function streamsOfTheProjectIn(listedStreams: readonly ListedStream[], projectDirectory: string): ListedStream[] {
  return listedStreams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
}

/** Whether `streamsOfTheProject` list their project open: any one of them in a state other than `closed`. */
export function theStreamsListTheProjectOpen(streamsOfTheProject: readonly ListedStream[]): boolean {
  return streamsOfTheProject.some((listedStream) => listedStream.state !== STREAM_STATE_OF_A_CLOSED_PROJECT);
}

/** The playback of the project in `projectDirectory` as `listedStreams` list it. */
export function projectPlaybackAsListed(listedStreams: readonly ListedStream[], projectDirectory: string): ProjectPlaybackAsListed {
  const streamsOfTheProject = streamsOfTheProjectIn(listedStreams, projectDirectory);
  const aStreamIs = (state: string) => streamsOfTheProject.some((listedStream) => listedStream.state === state);
  const aStreamHasFailed = aStreamIs("failed");
  if (!theStreamsListTheProjectOpen(streamsOfTheProject)) return { playback: "closed", a_stream_has_failed: aStreamHasFailed };
  if (aStreamIs("paused")) return { playback: "paused", a_stream_has_failed: aStreamHasFailed };
  if (aStreamIs("stopping")) return { playback: "stopping", a_stream_has_failed: aStreamHasFailed };
  if (aStreamIs("preparing")) return { playback: "starting", a_stream_has_failed: aStreamHasFailed };
  if (aStreamIs("running")) return { playback: "playing", a_stream_has_failed: aStreamHasFailed };
  return { playback: "stopped", a_stream_has_failed: aStreamHasFailed };
}
