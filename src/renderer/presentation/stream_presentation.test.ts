import { describe, expect, it } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { chooseSelectedStreamId } from "./stream_selection";
import {
  abbreviateHomeDirectory,
  countLabel,
  presentStreamActionCancel,
  presentStreamPrimaryAction,
  presentStreamState,
  listedStreamProjectDirectory,
  streamActionPendingWords,
  streamActionInTheListingWords,
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
    action: null,
    step: null,
  };
}

/** `displayName` while the action `action` works on it at `step`, or waits for its turn when `step` is `null`. */
function streamUnderAnAction(displayName: string, state: "preparing" | "stopping", step: string | null): ListedStream {
  return { ...listedStream(displayName, state, null), action: "Rnd53mwtsrixjyxk7h3jfq5j5-2", step };
}

describe("presentStreamState", () => {
  it("words a running, stopped or failed stream as it is", () => {
    expect(presentStreamState(listedStream("main", "running", 4))).toMatchObject({ label: "Running", emphasis: "plain" });
    expect(presentStreamState(listedStream("main", "stopped", null))).toMatchObject({ label: "Stopped", emphasis: "quiet" });
    expect(presentStreamState(listedStream("main", "failed", null))).toMatchObject({ label: "Failed", emphasis: "failure" });
  });

  it("words a preparing or stopping stream with its step in plain words, a spinner beside it, and queued while it waits its turn", () => {
    expect(
      [null, "making_the_venv", "compiling", "starting", "linking_ports"].map((step) => presentStreamState(streamUnderAnAction("main", "preparing", step)).label),
    ).toEqual(["Preparing · queued", "Preparing · making the environment", "Preparing · compiling", "Preparing · starting", "Preparing · linking ports"]);
    expect(presentStreamState(streamUnderAnAction("main", "preparing", "compiling"))).toMatchObject({
      emphasis: "starting",
      iconTone: "idle",
      meaning: "Preparing: compiling. It runs once it has loaded.",
    });
    expect(presentStreamState(streamUnderAnAction("main", "stopping", "stopping"))).toMatchObject({ label: "Stopping", emphasis: "starting" });
    expect(presentStreamState(streamUnderAnAction("main", "stopping", null)).label).toBe("Stopping · queued");
  });

  it("says what each word means, and gives a failed stream's whole reason", () => {
    expect(presentStreamState(listedStream("main", "running", 4)).meaning).toBe("Running: its graph is loaded in the runtime.");
    expect(presentStreamState(listedStream("pattern-two", "stopped", null)).meaning).toBe("Stopped: remembered, not loaded. Start loads it again.");
    const failed = { ...listedStream("lobby", "failed", null), failed_because: "camera access is denied" };
    expect(presentStreamState(failed).meaning).toBe("camera access is denied");
  });

  it("tones a stream's icon running only while loaded, failed once failed, and idle otherwise", () => {
    expect(
      [listedStream("a", "running", 4), streamUnderAnAction("c", "preparing", "starting"), listedStream("d", "stopped", null), listedStream("e", "failed", null)].map(
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

  it("offers nothing while an action works on it, or for a state newer than this app", () => {
    expect(presentStreamPrimaryAction(streamUnderAnAction("main", "preparing", "compiling"))).toBeNull();
    expect(presentStreamPrimaryAction(streamUnderAnAction("main", "stopping", null))).toBeNull();
    expect(presentStreamPrimaryAction(listedStream("main", "awaiting_restart", 2))).toBeNull();
  });
});

describe("a row's action words", () => {
  it("says what is under way, and leads a refusal with the action the person chose", () => {
    expect(streamActionPendingWords("stop_stream")).toBe("Stopping…");
    expect(streamActionPendingWords("start_stream")).toBe("Starting…");
    expect(streamActionPendingWords("remove_project")).toBe("Removing…");
    expect(streamActionPendingWords("cancel_stream_action")).toBe("Cancelling…");
    expect(streamActionRefusalLead("Retry")).toBe("Retry was refused:");
    expect(streamActionRefusalLead("Cancel")).toBe("Cancel was refused:");
    expect(streamActionRefusalLead("Remove project")).toBe("Remove project was refused:");
  });
});

describe("streamActionInTheListingWords", () => {
  it("shows the listed action and its step while one works on the stream, and nothing otherwise", () => {
    expect(streamActionInTheListingWords(streamUnderAnAction("main", "preparing", "making_the_venv"))).toBe("Preparing · making the environment");
    expect(streamActionInTheListingWords(streamUnderAnAction("main", "stopping", "stopping"))).toBe("Stopping");
    expect(streamActionInTheListingWords(listedStream("main", "running", 4))).toBeNull();
  });
});

describe("streamNotLoadedReason", () => {
  it("is null for a loaded stream and names why any other stream has no graph", () => {
    expect(streamNotLoadedReason(listedStream("main", "running", 4))).toBeNull();
    expect(streamNotLoadedReason(listedStream("main", "stopped", null))).toBe("stopped");
    expect(streamNotLoadedReason(listedStream("main", "failed", null))).toBe("failed");
    expect(streamNotLoadedReason(listedStream("main", "running", null))).toBe("loading");
    expect(streamNotLoadedReason(streamUnderAnAction("main", "preparing", "compiling"))).toBe("loading");
    expect(streamNotLoadedReason(streamUnderAnAction("main", "stopping", "stopping"))).toBe("not_loaded");
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

describe("presentStreamActionCancel", () => {
  it("offers Cancel on the action the listing names, dropping a queued one or stopping a running one at its step, and none while it names none", () => {
    expect(presentStreamActionCancel(streamUnderAnAction("main", "preparing", null))).toEqual({
      action: "Rnd53mwtsrixjyxk7h3jfq5j5-2",
      meaning: "Cancel: drops it from its project's queue",
    });
    expect(presentStreamActionCancel(streamUnderAnAction("main", "preparing", "making_the_venv"))).toEqual({
      action: "Rnd53mwtsrixjyxk7h3jfq5j5-2",
      meaning: "Cancel: stops it at the step it is on",
    });
    expect(presentStreamActionCancel(streamUnderAnAction("main", "stopping", "stopping"))).toEqual({
      action: "Rnd53mwtsrixjyxk7h3jfq5j5-2",
      meaning: "Cancel: a stop that has begun unloading runs to its end",
    });
    expect(presentStreamActionCancel(streamUnderAnAction("main", "stopping", null))?.meaning).toBe("Cancel: drops it from its project's queue");
    expect(presentStreamActionCancel(listedStream("main", "running", 4))).toBeNull();
    expect(presentStreamActionCancel({ ...listedStream("main", "failed", null), action: "Rnd53mwtsrixjyxk7h3jfq5j5-2" })).toBeNull();
  });
});
