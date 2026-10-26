import { describe, expect, it } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import {
  isStreamActionStillUnderWay,
  presentStreamRemovalConfirmation,
  streamMatchesFilterText,
  streamMatchesListFilter,
} from "./streams_list_presentation";

function listedStream(name: string, state: string, nodeCount: number | null): ListedStream {
  return { name, state, project_directory: `/Users/ada/streams/${name}`, node_count: nodeCount, failed_because: null };
}

const listedStreams = [
  listedStream("main", "kept", 4),
  listedStream("dev", "attached", 3),
  listedStream("pattern-two", "stopped", null),
  listedStream("lobby", "failed", null),
];

describe("streamMatchesListFilter", () => {
  it("sorts kept and attached streams under Running, and stopped and failed ones under their own words", () => {
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "all")).length).toBe(4);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "running")).map((stream) => stream.name)).toEqual(["main", "dev"]);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "stopped")).map((stream) => stream.name)).toEqual(["pattern-two"]);
    expect(listedStreams.filter((stream) => streamMatchesListFilter(stream, "failed")).map((stream) => stream.name)).toEqual(["lobby"]);
  });
});

describe("streamMatchesFilterText", () => {
  it("matches a stream's name or project folder, ignoring case", () => {
    expect(streamMatchesFilterText(listedStream("Main", "kept", 4), "mAI")).toBe(true);
    expect(streamMatchesFilterText(listedStream("main", "kept", 4), "streams/ma")).toBe(true);
    expect(streamMatchesFilterText(listedStream("main", "kept", 4), "lobby")).toBe(false);
    expect(streamMatchesFilterText(listedStream("main", "kept", 4), "  ")).toBe(true);
  });
});

describe("presentStreamRemovalConfirmation", () => {
  it("says the runtime forgets the stream and its project folder stays", () => {
    expect(presentStreamRemovalConfirmation(listedStream("main", "kept", 4))).toEqual({
      title: "Remove main?",
      explanation:
        "The runtime unloads it and forgets it, so it no longer loads when the runtime starts. Its project folder, ~/streams/main, stays as it is.",
    });
  });
});

describe("isStreamActionStillUnderWay", () => {
  const stopped = listedStream("main", "stopped", null);
  const running = listedStream("main", "kept", 4);

  it("stays under way until the runtime answers, whatever the listing shows", () => {
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: false }, stopped)).toBe(true);
  });

  it("ends once the runtime has answered and the listing shows something else, or nothing", () => {
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: true }, running)).toBe(true);
    expect(isStreamActionStillUnderWay({ streamAction: "stop_stream", listingWhenAsked: running, isAnswered: true }, stopped)).toBe(false);
    expect(isStreamActionStillUnderWay({ streamAction: "remove_stream", listingWhenAsked: running, isAnswered: true }, null)).toBe(false);
  });
});
