// Whether the open project is playing, as the window's one Play/Stop button shows it: the button names the action
// the person can take, so a project with any stream the runtime lists running, paused or preparing shows Stop.

import type { ListedStreamsReading } from "../view_host/studio_view_contract";

/** The stream states in which the project counts as playing, so the button offers Stop. */
const STREAM_STATES_OF_A_PLAYING_PROJECT = new Set(["running", "paused", "preparing"]);

/** What the Play/Stop button offers for the project in `projectFolder`: Stop while any of its listed streams plays, else Play. */
export function playOrStopOfferedForTheProject(projectFolder: string | null, listedStreams: ListedStreamsReading): "play" | "stop" {
  if (projectFolder === null || listedStreams.kind !== "listed") return "play";
  const isPlaying = listedStreams.streams.some((stream) => stream.location?.project_directory === projectFolder && STREAM_STATES_OF_A_PLAYING_PROJECT.has(stream.state));
  return isPlaying ? "stop" : "play";
}
