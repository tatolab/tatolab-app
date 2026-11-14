import { describe, expect, it } from "vitest";
import type { ListedStream } from "./tatolab_backend_contract.js";
import { projectPlaybackAsListed } from "./project_playback.js";

const PROJECT_FOLDER = "/Users/someone/Tato Studio/camera_to_screen";

function listedStreamOf(projectDirectory: string, state: string, streamName = "main"): ListedStream {
  return {
    stream: `camera_to_screen-${streamName}-${state}`,
    display_name: streamName,
    location: { project_directory: projectDirectory, project: "4be1ae19-0c7f-4cff-a959-d596c611e05b", stream_asset: `asset-${streamName}` },
    state,
    node_count: null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

describe("a project's playback as the runtime lists its streams", () => {
  it("reads each playback from its streams' states, a paused one first", () => {
    const playbackOf = (...states: string[]) => projectPlaybackAsListed(states.map((state, streamIndex) => listedStreamOf(PROJECT_FOLDER, state, `stream_${streamIndex}`)), PROJECT_FOLDER).playback;
    expect(playbackOf()).toBe("closed");
    expect(playbackOf("closed", "closed")).toBe("closed");
    expect(playbackOf("stopped", "stopped")).toBe("stopped");
    expect(playbackOf("running", "stopped")).toBe("playing");
    expect(playbackOf("running", "preparing")).toBe("starting");
    expect(playbackOf("running", "stopping")).toBe("stopping");
    expect(playbackOf("paused", "running")).toBe("paused");
  });

  it("reads only the streams of the project in the folder, and says when one of them failed", () => {
    const listedStreams = [listedStreamOf("/elsewhere", "running"), listedStreamOf(PROJECT_FOLDER, "stopped"), listedStreamOf(PROJECT_FOLDER, "failed", "broken")];
    expect(projectPlaybackAsListed(listedStreams, PROJECT_FOLDER)).toEqual({ playback: "stopped", a_stream_has_failed: true });
  });
});
