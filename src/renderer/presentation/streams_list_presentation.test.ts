import { describe, expect, it } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import {
  isStreamActionStillUnderWay,
  STREAMS_LIST_FILTERS,
  presentProjectRemovalConfirmation,
  streamsOfTheProject,
  streamMatchesFilterText,
  streamIsInListFilterState,
  streamMatchesListFilter,
  streamProjectFoldersOf,
} from "./streams_list_presentation";

/** A stream from `<projectDirectory>` (`/Users/ada/streams/<displayName>` by default) whose id is `<displayName>-main-<hash>`. */
function listedStream(displayName: string, state: string, nodeCount: number | null, projectDirectory = `/Users/ada/streams/${displayName}`): ListedStream {
  return {
    stream: `${displayName}-main-c40d17`,
    display_name: displayName,
    location: { project_directory: projectDirectory, stream_function: "stream:main" },
    state,
    node_count: nodeCount,
    failed_because: null,
    action: null,
    step: null,
  };
}

const listedStreams = [
  listedStream("main", "running", 4),
  listedStream("dev", "running", 3),
  listedStream("pattern-two", "stopped", null),
  listedStream("lobby", "failed", null),
  listedStream("newer", "awaiting_restart", 2),
];

describe("streamMatchesListFilter", () => {
  it("sorts running, stopped and failed streams under their own words, and a state newer than this app under All alone", () => {
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "all")).length).toBe(5);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "running")).map((stream) => stream.display_name)).toEqual(["main", "dev"]);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "stopped")).map((stream) => stream.display_name)).toEqual(["pattern-two"]);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "failed")).map((stream) => stream.display_name)).toEqual(["lobby"]);
  });

  it("shows a stream preparing or stopping under every filter, so a row does not vanish while its action runs", () => {
    const [someStream] = listedStreams;
    if (someStream === undefined) return expect.unreachable("the listing holds no stream");
    for (const state of ["preparing", "stopping"] as const) {
      const streamUnderAnAction = { ...someStream, state, action: "R1-7", step: null };
      expect(STREAMS_LIST_FILTERS.map(({ filter }) => streamMatchesListFilter(streamUnderAnAction, filter))).toEqual([true, true, true, true]);
      expect(STREAMS_LIST_FILTERS.map(({ filter }) => streamIsInListFilterState(streamUnderAnAction, filter))).toEqual([true, false, false, false]);
    }
  });
});

describe("streamMatchesFilterText", () => {
  it("matches a stream's display name or project folder, ignoring case, and never its id", () => {
    expect(streamMatchesFilterText(listedStream("Main", "running", 4), "mAI")).toBe(true);
    expect(streamMatchesFilterText(listedStream("main", "running", 4), "streams/ma")).toBe(true);
    expect(streamMatchesFilterText(listedStream("main", "running", 4), "lobby")).toBe(false);
    expect(streamMatchesFilterText(listedStream("main", "running", 4), "  ")).toBe(true);
    expect(streamMatchesFilterText(listedStream("main", "running", 4), "c40d17")).toBe(false);
    expect(streamMatchesFilterText({ ...listedStream("camera", "failed", null), location: null }, "camera")).toBe(true);
  });
});

describe("streamProjectFoldersOf", () => {
  function streamIn(displayName: string, projectDirectory: string): ListedStream {
    return listedStream(displayName, "running", 4, projectDirectory);
  }

  it("puts each stream under the folder it was added from, in the order the runtime lists them", () => {
    const folders = streamProjectFoldersOf([
      streamIn("main", "/Users/ada/streams/pattern"),
      streamIn("camera", "/Users/ada/streams/camera"),
      streamIn("recorder", "/Users/ada/streams/pattern"),
    ]);

    expect(folders.map(({ folderName, streams }) => [folderName, streams.map((stream) => stream.display_name)])).toEqual([
      ["pattern", ["main", "recorder"]],
      ["camera", ["camera"]],
    ]);
    expect(folders[0]?.projectDirectory).toBe("/Users/ada/streams/pattern");
  });

  it("marks a folder that holds a failed stream", () => {
    const folders = streamProjectFoldersOf([
      streamIn("main", "/Users/ada/streams/pattern"),
      { ...streamIn("lobby", "/Users/ada/streams/lobby"), state: "failed", node_count: null },
    ]);

    expect(folders.map(({ folderName, holdsAFailedStream }) => [folderName, holdsAFailedStream])).toEqual([
      ["pattern", false],
      ["lobby", true],
    ]);
  });

  it("names two folders that share a name by their parent too", () => {
    const folders = streamProjectFoldersOf([streamIn("a", "/Users/ada/work/demo"), streamIn("b", "/Users/ada/play/demo/"), streamIn("c", "/Users/ada/camera")]);

    expect(folders.map((folder) => folder.folderName)).toEqual(["work/demo", "play/demo", "camera"]);
  });

  it("puts an earlier runtime's records, which have no location, under a folder of their own named for them, with no path", () => {
    const folders = streamProjectFoldersOf([streamIn("main", "/Users/ada/streams/pattern"), { ...streamIn("camera", "/x"), location: null }]);

    expect(folders.map(({ projectDirectory, folderName, streams }) => [projectDirectory, folderName, streams.map((stream) => stream.display_name)])).toEqual([
      ["/Users/ada/streams/pattern", "pattern", ["main"]],
      [null, "From an earlier runtime", ["camera"]],
    ]);
  });

  it("has no folders when the runtime lists no streams", () => {
    expect(streamProjectFoldersOf([])).toEqual([]);
  });
});

describe("presentProjectRemovalConfirmation", () => {
  const patternFolder = "/Users/ada/streams/pattern";
  const streamsOfPattern = [listedStream("main", "running", 4, patternFolder), listedStream("recorder", "stopped", null, patternFolder), listedStream("pattern-two", "failed", null, patternFolder)];

  it("finds every stream the listing holds from the folder, in the order it lists them", () => {
    expect(streamsOfTheProject([listedStream("camera", "running", 3), ...streamsOfPattern], patternFolder).map((stream) => stream.display_name)).toEqual([
      "main",
      "recorder",
      "pattern-two",
    ]);
  });

  it("names the folder and every stream the runtime forgets, and says the folder and its log stay", () => {
    expect(presentProjectRemovalConfirmation(patternFolder, streamsOfPattern)).toEqual({
      title: "Remove the project pattern?",
      explanation:
        "The runtime stops and forgets its 3 streams, main, recorder and pattern-two, so they no longer load when the runtime starts. The folder ~/streams/pattern and its log stay as they are.",
    });
    expect(presentProjectRemovalConfirmation(patternFolder, streamsOfPattern.slice(0, 1)).explanation).toBe(
      "The runtime stops and forgets its stream main, so it no longer loads when the runtime starts. The folder ~/streams/pattern and its log stay as they are.",
    );
  });
});

describe("isStreamActionStillUnderWay", () => {
  const stopped = listedStream("main", "stopped", null);
  const running = listedStream("main", "running", 4);

  it("stays under way until the runtime answers, whatever the listing shows", () => {
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: false }, stopped)).toBe(true);
  });

  it("ends once the runtime has answered and the listing shows something else, or nothing", () => {
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: true }, running)).toBe(true);
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: true }, stopped)).toBe(false);
    expect(isStreamActionStillUnderWay({ streamAction: "remove_project", listingWhenAsked: running, isAnswered: true }, null)).toBe(false);
  });
});
