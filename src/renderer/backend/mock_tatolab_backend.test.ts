// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import type { ListedStream, ProjectLogNarrowing, ProjectLogRecord, RelaysDescription, StreamActionFollowed } from "../../shared/tatolab_backend_contract";
import type { TatolabBackend } from "./tatolab_backend";

afterEach(() => {
  vi.useRealTimers();
});

/** The mock streams' ids, which the runtime would compute from their locations. */
const MAIN = "pattern-main-645dbe";
const CAMERA = "camera-main-018da9";
const RECORDER = "pattern-recorder-7d11b1";
const PATTERN_TWO = "pattern-pattern-two-e6043c";
const LOBBY_RECORDER = "lobby-recorder-main-3fc45e";
const HEAT_MAP = "heat-map-heat-map-1acf70";

function listingWithTheId(streams: ListedStream[] | null, streamId: string): ListedStream | undefined {
  return streams?.find((stream) => stream.stream === streamId);
}

async function runningMockBackend(pageQuery = "") {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery)));
  const streamsAfterEachChange = async (act: () => Promise<void>, millisecondsToWait = 100) => {
    const settledAnswer = act().then(
      () => ({ queued: true }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(millisecondsToWait);
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);
    return { answer: await settledAnswer, streams: (await status).streams };
  };
  return { backend, streamsAfterEachChange };
}

/** Reads every record of `projectDirectory`'s log narrowed as asked, page after page. */
async function everyProjectLogRecord(backend: TatolabBackend, projectDirectory: string, narrowing: ProjectLogNarrowing): Promise<ProjectLogRecord[]> {
  const page = backend.readProjectLogRecords(projectDirectory, narrowing, null);
  await vi.advanceTimersByTimeAsync(100);
  return (await page).records;
}

const PATTERN_FOLDER = "/Users/jonathanf/streams/pattern";
const LOBBY_RECORDER_FOLDER = "/Users/jonathanf/streams/lobby-recorder";

describe("the mock backend's stream actions", () => {
  it("lists every stream by its id and display name, running, stopped or failed, and none attached", async () => {
    const { backend } = await runningMockBackend();
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect((await status).streams?.map((stream) => [stream.stream, stream.display_name, stream.state])).toEqual([
      [MAIN, "main", "running"],
      [CAMERA, "camera", "running"],
      [RECORDER, "recorder", "running"],
      [PATTERN_TWO, "pattern-two", "stopped"],
      [LOBBY_RECORDER, "lobby-recorder", "failed"],
    ]);
  });

  it("queues a stop, lists the stream stopping, then stopped; and queues a start, listing it preparing at each step, then running", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopping = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", CAMERA));
    expect(stopping.answer).toEqual({ queued: true });
    expect(listingWithTheId(stopping.streams, CAMERA)).toMatchObject({ state: "stopping", step: "stopping", action: expect.stringMatching(/^Rmockruntime7f3k2q9x4w1b8n-\d+$/) });
    const stopped = await streamsAfterEachChange(() => Promise.resolve(), 1000);
    expect(listingWithTheId(stopped.streams, CAMERA)).toMatchObject({ state: "stopped", node_count: null, action: null, step: null });

    const compiling = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", CAMERA));
    expect(listingWithTheId(compiling.streams, CAMERA)).toMatchObject({ state: "preparing", step: "compiling" });
    const starting = await streamsAfterEachChange(() => Promise.resolve(), 600);
    expect(listingWithTheId(starting.streams, CAMERA)).toMatchObject({ state: "preparing", step: "starting" });
    const running = await streamsAfterEachChange(() => Promise.resolve(), 1000);
    expect(listingWithTheId(running.streams, CAMERA)).toMatchObject({ state: "running", node_count: 4, action: null, step: null });
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stoppedTwice = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", PATTERN_TWO));
    expect(stoppedTwice.answer).toEqual({ refusal: `Runtime error: the stream \`${PATTERN_TWO}\` is already stopped; \`start\` loads it again` });
    const startedWhileLoaded = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", MAIN));
    expect(startedWhileLoaded.answer).toEqual({
      refusal: `Runtime error: the stream \`${MAIN}\` is already loaded in this runtime, recorded by the runtime; only a stopped or failed stream starts`,
    });
    const removedAFolderOfNoStream = await streamsAfterEachChange(() => backend.removeProject("/Users/jonathanf/streams/nothing-here"));
    expect(removedAFolderOfNoStream.answer).toEqual({
      refusal: expect.stringMatching(/^Resource not found: this runtime holds no stream of the project in \/Users\/jonathanf\/streams\/nothing-here, so there is none to remove\. Loaded: /),
    });
  });

  it("renames a stream under the same id, and refuses a name that shows nothing or an id it does not hold, in the runtime's words", async () => {
    const { backend } = await runningMockBackend();
    const settledRename = async (streamId: string, displayName: string) => {
      const answer = backend.renameStream(streamId, displayName).then(
        () => ({ renamed: true }),
        (refusal: unknown) => ({ refusal }),
      );
      await vi.advanceTimersByTimeAsync(100);
      return answer;
    };

    expect(await settledRename(CAMERA, "Desk camera")).toEqual({ renamed: true });
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);
    expect(listingWithTheId((await status).streams, CAMERA)).toMatchObject({ display_name: "Desk camera", state: "running" });
    expect(await settledRename(CAMERA, "   ")).toEqual({
      refusal: `Invalid configuration: "   " cannot be a stream's display name: it shows nothing; a display name is any text with something to show`,
    });
    expect(await settledRename("camera", "Desk")).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream with the id \`camera\` is loaded or recorded in this runtime\./) });
  });

  it("lists a record an earlier runtime wrote, failed with no location, with ?streams=earlier_record", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("streams=earlier_record")));
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect(listingWithTheId((await status).streams, "doorbell")).toMatchObject({ location: null, state: "failed", failed_because: expect.stringMatching(/^an earlier runtime recorded it/) });
  });

  it("queues a retry of a failed stream, which fails again with the retry's reason when it does not load", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const retried = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", LOBBY_RECORDER));
    expect(retried.answer).toEqual({ queued: true });
    expect(listingWithTheId(retried.streams, LOBBY_RECORDER)).toMatchObject({ state: "preparing" });
    const failedAgain = await streamsAfterEachChange(() => Promise.resolve(), 2000);
    expect(listingWithTheId(failedAgain.streams, LOBBY_RECORDER)?.failed_because).toMatch(/^`start` retried it, and it did not load: /);
  });

  it("removes a project: each of its streams stopping, then forgotten, and no other", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const removing = await streamsAfterEachChange(() => backend.removeProject(PATTERN_FOLDER));
    expect(removing.answer).toEqual({ queued: true });
    expect([MAIN, RECORDER, PATTERN_TWO].map((streamId) => listingWithTheId(removing.streams, streamId)?.state)).toEqual(["stopping", "stopping", "stopping"]);
    const removed = await streamsAfterEachChange(() => Promise.resolve(), 1000);
    expect(removed.streams?.map((stream) => stream.stream)).toEqual([CAMERA, LOBBY_RECORDER]);
  });
});

describe("the mock backend's project logs", () => {
  it("holds a failed stream's error under the action that failed it", async () => {
    const { backend } = await runningMockBackend();

    const records = await everyProjectLogRecord(backend, LOBBY_RECORDER_FOLDER, { stream: LOBBY_RECORDER, action: null });

    expect(records.map((record) => record.level)).toEqual(["info", "error"]);
    expect(new Set(records.map((record) => record.action)).size).toBe(1);
  });

  it("narrows a project's log to one stream, and pages on from each cursor", async () => {
    const { backend } = await runningMockBackend();

    const wholeProject = await everyProjectLogRecord(backend, PATTERN_FOLDER, { stream: null, action: null });
    const mainOnly = await everyProjectLogRecord(backend, PATTERN_FOLDER, { stream: MAIN, action: null });
    expect(new Set(wholeProject.map((record) => record.stream))).toEqual(new Set([MAIN, RECORDER]));
    expect(mainOnly.length).toBeGreaterThan(0);
    expect(mainOnly.every((record) => record.stream === MAIN)).toBe(true);

    const firstPage = backend.readProjectLogRecords(PATTERN_FOLDER, { stream: null, action: null }, null);
    await vi.advanceTimersByTimeAsync(100);
    const pageAfterIt = backend.readProjectLogRecords(PATTERN_FOLDER, { stream: null, action: null }, (await firstPage).next_after);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pageAfterIt).records.length).toBeLessThan(wholeProject.length);
  });

  it("marks records no longer held once the log's retention deleted some, with ?held_records=", async () => {
    const { backend } = await runningMockBackend("held_records=5");

    const page = backend.readProjectLogRecords(PATTERN_FOLDER, { stream: null, action: null }, null);
    await vi.advanceTimersByTimeAsync(100);

    expect(await page).toMatchObject({ records_no_longer_held: true });
    expect((await page).records).toHaveLength(5);
  });
});

describe("the mock backend's New project and Import project", () => {
  async function settled<Answer>(act: () => Promise<Answer>, waitMilliseconds = 3000): Promise<{ answer: Answer } | { refusal: unknown }> {
    const settledAnswer = act().then(
      (answer) => ({ answer }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(waitMilliseconds);
    return settledAnswer;
  }

  /** Follows `action` until it ends, advancing the mock's clock a beat at a time, answering every description read along the way. */
  async function followedToItsEnd(backend: ReturnType<typeof createMockTatolabBackend>, action: string): Promise<StreamActionFollowed[]> {
    const followed: StreamActionFollowed[] = [];
    for (let beat = 0; beat < 20; beat += 1) {
      const description = await settled(() => backend.describeStreamAction(action), 500);
      if (!("answer" in description)) throw new Error("the mock refused to describe the action");
      followed.push(description.answer);
      if (description.answer.kind === "not_held" || ["done", "failed", "cancelled"].includes(description.answer.description.state)) return followed;
    }
    return followed;
  }

  function statesOf(followed: readonly StreamActionFollowed[]): string[] {
    return [...new Set(followed.map((answer) => (answer.kind === "described" ? `${answer.description.state}:${answer.description.step ?? ""}` : answer.kind)))];
  }

  it("imports the chosen folder as a queued load, lists its stream preparing then running, and refuses a folder it never handed the window", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    await settled(() => backend.getTatolabStatus());
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    expect(chosen).toEqual({ answer: "/Users/jonathanf/code/heat-map" });

    const queued = await settled(() => backend.runStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queued)) throw new Error("the run was refused");
    expect(queued.answer.project_directory).toBe("/Users/jonathanf/code/heat-map");
    const followed = await followedToItsEnd(backend, queued.answer.action);
    expect(statesOf(followed)).toEqual(["queued:", "in_progress:compiling", "in_progress:starting", "done:"]);
    expect(followed.at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ state: "done", streams: [{ stream: HEAT_MAP, display_name: "heat_map", state: "running" }] }),
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && listingWithTheId(status.answer.streams, HEAT_MAP)).toMatchObject({ state: "running" });

    expect(await settled(() => backend.runStreamProject("/etc"))).toEqual({ refusal: "Tato Studio acts only on a folder chosen in its window. Choose /etc again." });
  });

  it("imports a folder with two streams, one failing, and makes a .venv first for a folder with none", async () => {
    vi.useFakeTimers();
    const doorways = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=several")));
    await settled(() => doorways.getTatolabStatus());
    await settled(() => doorways.chooseStreamProjectFolder("project_to_run"));
    const queued = await settled(() => doorways.runStreamProject("/Users/jonathanf/code/doorways"), 50);
    if (!("answer" in queued)) throw new Error("the run was refused");
    const ending = (await followedToItsEnd(doorways, queued.answer.action)).at(-1);
    expect(ending?.kind === "described" && ending.description.streams.map((stream) => [stream.display_name, stream.state])).toEqual([
      ["front_door", "running"],
      ["back_door", "failed"],
    ]);

    const noVenv = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=no-venv")));
    await settled(() => noVenv.getTatolabStatus());
    await settled(() => noVenv.chooseStreamProjectFolder("project_to_run"));
    const queuedWithNoVenv = await settled(() => noVenv.runStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queuedWithNoVenv)) throw new Error("the run was refused");
    expect(statesOf(await followedToItsEnd(noVenv, queuedWithNoVenv.answer.action))).toContain("in_progress:making_the_venv");
  });

  it("creates a project in a folder it draws under ~/streams, or the chosen one, making its .venv; a folder holding a project fails the load in the runtime's words", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    await settled(() => backend.getTatolabStatus());
    const drawn = await settled(() => backend.createStreamProject(null), 50);
    expect(drawn).toEqual({ answer: { action: expect.any(String), stream: expect.stringMatching(/^kind-butte-main-/), project_directory: "/Users/jonathanf/streams/kind-butte" } });
    if (!("answer" in drawn)) throw new Error("the creation was refused");
    expect(statesOf(await followedToItsEnd(backend, drawn.answer.action))).toEqual(["queued:", "in_progress:making_the_venv", "in_progress:compiling", "in_progress:starting", "done:"]);
    expect(await settled(() => backend.chooseStreamProjectFolder("new_project_directory"))).toEqual({ answer: "/Users/jonathanf/streams/lobby" });

    const existing = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_new_folder=existing")));
    await settled(() => existing.getTatolabStatus());
    await settled(() => existing.chooseStreamProjectFolder("new_project_directory"));
    const intoAProject = await settled(() => existing.createStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in intoAProject)) throw new Error("the creation was refused");
    expect((await followedToItsEnd(existing, intoAProject.answer.action)).at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ state: "failed", failed_because: expect.stringMatching(/already has pyproject.toml, stream.py, and a new project's files would overwrite it/) }),
    });
  });

  it("fails the load when the runtime's uv cannot make the .venv with ?add_venv=refused, answers no load held with ?add_action=not_held, and a cancelled dialog with null", async () => {
    vi.useFakeTimers();
    const refused = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_venv=refused&add_folder=no-venv")));
    await settled(() => refused.getTatolabStatus());
    await settled(() => refused.chooseStreamProjectFolder("project_to_run"));
    const queued = await settled(() => refused.runStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queued)) throw new Error("the run was refused");
    expect((await followedToItsEnd(refused, queued.answer.action)).at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ state: "failed", failed_because: expect.stringMatching(/^error: Failed to fetch: `https:\/\/pypi.org\/simple\/tatolab-stream\/`/) }),
    });

    const notHeld = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_action=not_held&add_folder=cancel")));
    await settled(() => notHeld.getTatolabStatus());
    expect(await settled(() => notHeld.describeStreamAction("R-1"))).toEqual({ answer: { kind: "not_held", words: expect.stringMatching(/^Invalid configuration: the stream action `R-1` is not held/) } });
    expect(await settled(() => notHeld.chooseStreamProjectFolder("project_to_run"))).toEqual({ answer: null });
  });

  it("suggests an untitled project in Documents/Tato Studio past the one there, makes and opens a new one, and refuses a taken folder or a name that is no folder name", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("project=none")));
    const tatoStudioFolder = "/Users/jonathanf/Documents/Tato Studio";
    expect(await settled(() => backend.readNewProjectDefaults())).toEqual({ answer: { location: tatoStudioFolder, name: "Untitled project 2" } });
    expect(await settled(() => backend.chooseNewProjectLocation(tatoStudioFolder))).toEqual({ answer: "/Users/jonathanf/Shows" });
    expect(await settled(() => backend.createNewProject("Untitled project", tatoStudioFolder))).toEqual({
      refusal: `${tatoStudioFolder}/Untitled project already exists. Choose another name or location.`,
    });
    expect(await settled(() => backend.createNewProject(".hidden", tatoStudioFolder))).toEqual({ refusal: "A project's name can't start with a dot, which hides its folder." });

    const created = await settled(() => backend.createNewProject("Night Show", tatoStudioFolder));
    expect(created).toMatchObject({ answer: { folder: `${tatoStudioFolder}/Night Show`, project_creation: { project_directory: `${tatoStudioFolder}/Night Show` } } });
    expect(await backend.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: `${tatoStudioFolder}/Night Show`, name: "night-show" } } });
    expect(await settled(() => backend.readNewProjectDefaults())).toEqual({ answer: { location: tatoStudioFolder, name: "Untitled project 2" } });
  });
});

describe("the mock backend's runtime", () => {
  it("describes itself while it runs, and a restart goes through starting and counts its uptime again from 0", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    const settled = async <Answer>(answer: Promise<Answer>, milliseconds: number): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(milliseconds);
      return answer;
    };

    const described = await settled(backend.describeRuntime(), 100);
    expect(described).toMatchObject({ version: "0.55.2", runtime_log_directory: "/Users/jonathanf/Library/Application Support/Tatolab/logs" });
    expect(described.up_for_ms).toBeGreaterThan(3 * 24 * 60 * 60_000);

    await settled(backend.restartRuntime(), 1_000);
    expect((await settled(backend.getTatolabStatus(), 100)).runtime_state).toBe("starting");
    const describedWhileStarting = backend.describeRuntime().catch((refusal: unknown) => refusal);
    expect(await settled(describedWhileStarting, 100)).toBe("no runtime answers at /tmp/streamlib-501/local-api.sock: connect ENOENT /tmp/streamlib-501/local-api.sock");

    await vi.advanceTimersByTimeAsync(3_000);
    expect((await settled(backend.getTatolabStatus(), 100)).runtime_state).toBe("running");
    expect((await settled(backend.describeRuntime(), 100)).up_for_ms).toBeLessThan(5_000);
  });

  it("refuses a restart of a runtime Tato Studio did not start with ?restart=refused, and names no log folder for a runtime keeping none", async () => {
    vi.useFakeTimers();
    const notStartedByTheApp = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("restart=refused")));
    const restart = notStartedByTheApp.restartRuntime().catch((refusal: unknown) => refusal);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await restart).toBe("The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.");

    const withoutAnOwnLog = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("runtime_log=none")));
    const described = withoutAnOwnLog.describeRuntime();
    await vi.advanceTimersByTimeAsync(100);
    expect((await described).runtime_log_directory).toBeNull();
  });
});

describe("the mock backend's relays", () => {
  /** `call`'s outcome once the mock's timers have run long enough for it to answer. */
  async function settled<Answer>(call: Promise<Answer>): Promise<{ answer: Answer } | { refusal: unknown }> {
    const outcome = call.then(
      (answer) => ({ answer }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    return outcome;
  }

  /** What `describeRelays` answers once the mock's timers have run. */
  async function describedRelays(backend: ReturnType<typeof createMockTatolabBackend>): Promise<RelaysDescription> {
    const described = await settled(backend.describeRelays());
    return "answer" in described ? described.answer : expect.unreachable(String(described.refusal));
  }

  it("lists the local relay's two listeners first, and adds a relay as the runtime does, keeping its secret only as set", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("relays=local")));
    const typedSecret = "https://draft-16.cloudflare.mediaoverquic.com/typed-in-the-test";

    expect(await settled(backend.addRelay("cloudflare", { relay_url: typedSecret }))).toEqual({ answer: "cloudflare-1" });
    const described = await describedRelays(backend);

    expect(described.relays.map((relay) => [relay.relay_id, relay.built_in, relay.connection_state.state])).toEqual([
      ["local-loopback", true, "joined"],
      ["local-every-interface", true, "joined"],
      ["cloudflare-1", false, "joining"],
    ]);
    expect(described.relays[2]?.secrets).toEqual({ relay_url: "set" });
    expect(JSON.stringify(described)).not.toContain("typed-in-the-test");
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await describedRelays(backend)).relays[2]?.connection_state).toEqual({ state: "joined" });
  });

  it("refuses what the runtime refuses, in its words, and returns a port to its default for null", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));

    expect(await settled(backend.removeRelay("local-every-interface"))).toEqual({ refusal: "the relay `local-every-interface` is built in and is never removed" });
    expect(await settled(backend.addRelay("local", {}))).toEqual({
      refusal:
        "no `local` relay is added: the local relay is built in: its listeners `local-loopback` and `local-every-interface` are on every machine, and where a listener binds is never a setting",
    });
    expect(await settled(backend.addRelay("moqpro", { project_id: "desk/a", signing_key: "typed-in-the-test" }))).toEqual({
      refusal: "the settings of the relay `moqpro-2` are refused: `project_id` `desk/a` is not a moq.pro project id: one path segment, non-empty, with no `/`",
    });
    expect(await settled(backend.configureRelay("local-loopback", { bind: "0.0.0.0" }))).toEqual({
      refusal: "the settings of the relay `local-loopback` are refused: unknown field `bind`, expected `port`",
    });

    await settled(backend.configureRelay("local-every-interface", { port: 14447 }));
    expect((await describedRelays(backend)).relays[1]?.settings).toEqual({ port: 14447 });
    await settled(backend.configureRelay("local-every-interface", { port: null }));
    expect((await describedRelays(backend)).relays[1]?.settings).toEqual({ port: 4445 });
    await settled(backend.removeRelay("moqpro-1"));
    expect((await describedRelays(backend)).relays.map((relay) => relay.relay_id)).toEqual(["local-loopback", "local-every-interface", "cloudflare-1"]);
  });

  it("refuses every relay call while the runtime is down", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=not-running")));

    const outcome = await settled(backend.describeRelays());

    expect("refusal" in outcome && String(outcome.refusal).startsWith("no runtime answers at ")).toBe(true);
  });
});

describe("the mock backend's node catalog", () => {
  it("lists every type its streams' graphs name, each graph node with its config", async () => {
    const { backend } = await runningMockBackend();
    let graphsRead = 0;
    for (const streamId of [MAIN, CAMERA, RECORDER, PATTERN_TWO, LOBBY_RECORDER, HEAT_MAP]) {
      const graph = backend.describeStreamGraph(streamId).then(
        (summary) => summary,
        () => null,
      );
      const catalog = backend.describeNodeCatalog(streamId).then(
        (listed) => listed,
        () => null,
      );
      await vi.advanceTimersByTimeAsync(200);
      const graphRead = await graph;
      const catalogListed = await catalog;
      if (graphRead === null) continue;
      graphsRead += 1;
      expect(catalogListed?.stream).toBe(streamId);
      const typesListed = new Set(catalogListed?.node_types.map((entry) => entry.type));
      for (const node of graphRead.nodes) expect([node.name, typesListed.has(node.type)]).toEqual([node.name, true]);
    }
    expect(graphsRead).toBeGreaterThan(0);
  });
});

describe("the mock backend's port families", () => {
  it("serves no family by default, as the runtime does today, and each port's family when asked", async () => {
    const familiesOfMain = async (pageQuery: string) => {
      const { backend } = await runningMockBackend(pageQuery);
      const graph = backend.describeStreamGraph(MAIN);
      const catalog = backend.describeNodeCatalog(MAIN);
      await vi.advanceTimersByTimeAsync(200);
      const read = await graph;
      const listed = await catalog;
      return {
        graph: read.nodes.flatMap((node) => [...node.input_ports, ...node.output_ports].map((port) => port.family)),
        catalog: listed.node_types.flatMap((entry) => [...entry.inputs, ...entry.outputs].map((port) => port.family)),
      };
    };
    const servedByDefault = await familiesOfMain("");
    expect(new Set([...servedByDefault.graph, ...servedByDefault.catalog])).toEqual(new Set([null]));
    const servedWhenAsked = await familiesOfMain("port_families=served");
    expect(servedWhenAsked.graph).not.toContain(null);
    expect(new Set(servedWhenAsked.graph)).toEqual(new Set(["image"]));
    expect(servedWhenAsked.catalog).not.toContain(null);
  });
});
