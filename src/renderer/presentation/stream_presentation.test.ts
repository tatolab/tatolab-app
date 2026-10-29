import { describe, expect, it } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { chooseSelectedStreamId } from "./stream_selection";
import {
  abbreviateHomeDirectory,
  countLabel,
  presentStreamPrimaryAction,
  presentStreamState,
  presentStreamStateAfterAStopNotRecorded,
  presentStreamStateAfterTheLastAction,
  listedStreamProjectDirectory,
  streamActionPendingWords,
  streamActionRefusalLead,
  streamNotLoadedReason,
} from "./stream_presentation";

/** A stream from `/Users/ada/streams/<displayName>` whose id is `<displayName>-main-<hash>`. */
function listedStream(displayName: string, state: string, nodeCount: number | null): ListedStream {
  return {
    stream: `${displayName}-main-6b1f3a`,
    display_name: displayName,
    location: { project_directory: `/Users/ada/streams/${displayName}`, stream_function: "stream:main" },
    state,
    node_count: nodeCount,
    failed_because: null,
  };
}

describe("presentStreamState", () => {
  it("words a loaded stream Running, one still loading Starting, and a stopped or failed one as it is", () => {
    expect(presentStreamState(listedStream("main", "running", 4))).toMatchObject({ label: "Running", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "running", null))).toMatchObject({ label: "Starting", emphasis: "starting" });
    expect(presentStreamState(listedStream("main", "stopped", null))).toMatchObject({ label: "Stopped", emphasis: "quiet" });
    expect(presentStreamState(listedStream("main", "failed", null))).toMatchObject({ label: "Failed", emphasis: "failure" });
  });

  it("says what each word means, and gives a failed stream's whole reason", () => {
    expect(presentStreamState(listedStream("main", "running", 4)).meaning).toBe("Running: its graph is loaded in the runtime.");
    expect(presentStreamState(listedStream("pattern-two", "stopped", null)).meaning).toBe("Stopped: remembered, not loaded. Start loads it again.");
    const failed = { ...listedStream("lobby", "failed", null), failed_because: "camera access is denied" };
    expect(presentStreamState(failed).meaning).toBe("camera access is denied");
  });

  it("tones a stream's icon running only while loaded, failed once failed, and idle otherwise", () => {
    expect(
      [listedStream("a", "running", 4), listedStream("c", "running", null), listedStream("d", "stopped", null), listedStream("e", "failed", null)].map(
        (stream) => presentStreamState(stream).iconTone,
      ),
    ).toEqual(["running", "idle", "idle", "failed"]);
  });

  it("labels a state newer than this app plainly instead of failing, its icon never toned as running", () => {
        expect(presentStreamState(listedStream("main", "awaiting_restart", 2))).toMatchObject({
      label: "Awaiting restart",
      emphasis: "plain",
      iconTone: "idle",
    });
    expect(presentStreamState(listedStream("main", "", null)).label).toBe("Unknown");
  });
});

describe("presentStreamStateAfterAStopNotRecorded", () => {
  it("reads Stopped for the running stream the runtime unloaded but could not record stopped, and leaves any other state as it is", () => {
    expect(presentStreamStateAfterAStopNotRecorded(listedStream("camera", "running", null))).toMatchObject({ label: "Stopped", emphasis: "quiet" });
    expect(presentStreamStateAfterAStopNotRecorded(listedStream("camera", "running", 4))).toMatchObject({ label: "Running" });
    expect(presentStreamStateAfterAStopNotRecorded(listedStream("camera", "stopped", null))).toMatchObject({ label: "Stopped" });
  });
});

describe("presentStreamStateAfterTheLastAction", () => {
  it("reads the listing's state, or Stopped once the last action was a stop the runtime could not record", () => {
    expect(presentStreamStateAfterTheLastAction(listedStream("camera", "running", null), false).label).toBe("Starting");
    expect(presentStreamStateAfterTheLastAction(listedStream("camera", "running", null), true).label).toBe("Stopped");
  });
});

describe("presentStreamPrimaryAction", () => {
  it("stops a loaded stream, starts a stopped one and retries a failed one", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "running", 4))).toMatchObject({ streamAction: "stop_stream", label: "Stop" });
    expect(presentStreamPrimaryAction(listedStream("main", "stopped", null))).toMatchObject({ streamAction: "start_stream", label: "Start" });
    expect(presentStreamPrimaryAction(listedStream("main", "failed", null))).toMatchObject({ streamAction: "start_stream", label: "Retry" });
  });

  it("stops a running stream whoever loaded it, saying it unloads it and remembers it stopped", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "running", 4))).toEqual({
      streamAction: "stop_stream",
      label: "Stop",
      meaning: "Stop: unloads it and remembers it stopped",
    });
  });

  it("offers nothing for a state newer than this app", () => {
    expect(presentStreamPrimaryAction(listedStream("main", "awaiting_restart", 2))).toBeNull();
  });
});

describe("a row's action words", () => {
  it("says what is under way, and leads a refusal with the action the person chose", () => {
    expect(streamActionPendingWords("stop_stream")).toBe("Stopping…");
    expect(streamActionPendingWords("start_stream")).toBe("Starting…");
    expect(streamActionPendingWords("remove_stream")).toBe("Removing…");
    expect(streamActionRefusalLead("Retry")).toBe("Retry was refused:");
  });
});

describe("streamNotLoadedReason", () => {
  it("is null for a loaded stream and names why any other stream has no graph", () => {
    expect(streamNotLoadedReason(listedStream("main", "running", 4))).toBeNull();
    expect(streamNotLoadedReason(listedStream("main", "stopped", null))).toBe("stopped");
    expect(streamNotLoadedReason(listedStream("main", "failed", null))).toBe("failed");
    expect(streamNotLoadedReason(listedStream("main", "running", null))).toBe("loading");
    expect(streamNotLoadedReason(listedStream("main", "awaiting_restart", null))).toBe("not_loaded");
  });
});

describe("chooseSelectedStreamId", () => {
  const streamsWithTheIds = (...streamIds: string[]) => streamIds.map((streamId) => ({ ...listedStream("main", "running", 1), stream: streamId }));

  it("selects the first stream when none was chosen", () => {
    expect(chooseSelectedStreamId(streamsWithTheIds("a", "b"), null, [])).toBe("a");
  });

  it("keeps the chosen stream while it is listed", () => {
    expect(chooseSelectedStreamId(streamsWithTheIds("a", "b", "c"), "b", ["a", "b", "c"])).toBe("b");
  });

  it("moves to the next stream when the chosen one disappears, or the one before it when it was last", () => {
    expect(chooseSelectedStreamId(streamsWithTheIds("a", "c"), "b", ["a", "b", "c"])).toBe("c");
    expect(chooseSelectedStreamId(streamsWithTheIds("a", "b"), "c", ["a", "b", "c"])).toBe("b");
  });

  it("selects nothing when nothing is listed", () => {
    expect(chooseSelectedStreamId([], "a", ["a"])).toBeNull();
  });
});

describe("display helpers", () => {
  it("shortens a home directory to ~", () => {
    expect(abbreviateHomeDirectory("/Users/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada/streams/pattern")).toBe("~/streams/pattern");
    expect(abbreviateHomeDirectory("/home/ada")).toBe("~");
    expect(abbreviateHomeDirectory("/private/tmp/pattern")).toBe("/private/tmp/pattern");
    expect(abbreviateHomeDirectory("/srv/home/ada/pattern")).toBe("/srv/home/ada/pattern");
  });

  it("reads a stream's project folder from its location, and none for an earlier runtime's record", () => {
    expect(listedStreamProjectDirectory(listedStream("main", "running", 4))).toBe("/Users/ada/streams/main");
    expect(listedStreamProjectDirectory({ ...listedStream("main", "failed", null), location: null })).toBeNull();
  });

  it("counts in the singular and the plural", () => {
    expect(countLabel(1, "stream", "streams")).toBe("1 stream");
    expect(countLabel(2000, "line", "lines")).toBe("2,000 lines");
  });
});
