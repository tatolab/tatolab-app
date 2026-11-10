// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import type { ListedStream, ProjectLogNarrowing, ProjectLogRecord, StreamActionFollowed } from "../src/shared/tatolab_backend_contract";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";

afterEach(() => {
  vi.useRealTimers();
});

/** The mock streams' ids, which the runtime would compute from their locations. */
const MAIN = "pattern-main-bcd55b";
const CAMERA = "camera-main-b0a0e5";
const RECORDER = "pattern-recorder-077241";
const PATTERN_TWO = "pattern-pattern-two-346432";
const LOBBY_RECORDER = "lobby-recorder-main-d76949";
const HEAT_MAP = "heat-map-heat-map-68aac7";

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

  it("queues one stop of the open project, listing each of its running streams stopping, then stopped, and no stream of another project", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopping = await streamsAfterEachChange(() => backend.stopOpenProject());
    expect(stopping.answer).toEqual({ queued: true });
    const stopAction = listingWithTheId(stopping.streams, MAIN)?.action;
    expect(stopAction).toMatch(/^Rmockruntime7f3k2q9x4w1b8n-\d+$/);
    expect(listingWithTheId(stopping.streams, MAIN)).toMatchObject({ state: "stopping", step: "stopping" });
    expect(listingWithTheId(stopping.streams, RECORDER)).toMatchObject({ state: "stopping", action: stopAction });
    expect(listingWithTheId(stopping.streams, CAMERA)).toMatchObject({ state: "running" });
    const stopped = await streamsAfterEachChange(() => Promise.resolve(), 1000);
    expect(listingWithTheId(stopped.streams, MAIN)).toMatchObject({ state: "stopped", node_count: null, action: null, step: null });
    expect(listingWithTheId(stopped.streams, RECORDER)).toMatchObject({ state: "stopped" });
    expect(listingWithTheId(stopped.streams, CAMERA)).toMatchObject({ state: "running" });
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    await streamsAfterEachChange(() => backend.stopOpenProject());
    await streamsAfterEachChange(() => Promise.resolve(), 1000);
    const stoppedTwice = await streamsAfterEachChange(() => backend.stopOpenProject());
    expect(stoppedTwice.answer).toEqual({
      refusal: expect.stringMatching(/^Runtime error: no stream of the project in \/Users\/jonathanf\/streams\/pattern runs, so there is none to stop; `run` runs it\. Loaded: /),
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
      refusal: `set_stream_display_name failed: "   " cannot be a stream's display name: it shows nothing`,
    });
    expect(await settledRename("camera", "Desk")).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream with the id \`camera\` is loaded or recorded in this runtime\./) });
  });

  it("keeps a slider's live edits apart from its one commit under the gesture's key, records the commit as the person editing, and an undo puts the graph back", async () => {
    const { backend } = await runningMockBackend();
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const mainListed = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN);
    const streamAsset = mainListed?.location?.stream_asset ?? "";
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    const firstNode = graphBefore.nodes[0];
    if (firstNode === undefined) return expect.unreachable("the main stream holds a node");
    const setSoftness = (softness: number) => ({ operation: "set_node_config" as const, stream: streamAsset, node: firstNode.id, config: { ...firstNode.config, softness } });
    const gesture = "drag-1";

    await settled(backend.transactInTheOpenProject([setSoftness(0.2)], "live", gesture));
    const secondLiveEdit = await settled(backend.transactInTheOpenProject([setSoftness(0.4)], "live", gesture));
    expect(secondLiveEdit).toMatchObject({ kind: "applied", transaction: { mode: "live", transaction: null } });
    expect((await settled(backend.describeStreamGraph(MAIN))).nodes[0]?.config).toMatchObject({ softness: 0.4 });
    const committed = await settled(backend.transactInTheOpenProject([setSoftness(0.6)], "commit", gesture));
    const retried = await settled(backend.transactInTheOpenProject([setSoftness(0.6)], "commit", gesture));
    if (committed.kind !== "applied" || retried.kind !== "applied") return expect.unreachable("the commit applied");
    expect(committed.transaction.operations).toMatchObject([{ operation: "set_node_config", from: firstNode.config, to: { softness: 0.6 } }]);
    expect(retried.transaction.transaction).toBe(committed.transaction.transaction);
    expect(await settled(backend.readThePersonEditingInStudio())).toEqual({ kind: "person", name: "Sam" });

    const undone = await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    expect(undone).toMatchObject({ author_kind: "person", author_name: "Sam", undoes: committed.transaction.transaction });
    expect((await settled(backend.describeStreamGraph(MAIN))).nodes[0]?.config).toEqual(firstNode.config);
  });

  it("lists a record an earlier runtime wrote, failed with no location, with ?streams=earlier_record", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("streams=earlier_record")));
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect(listingWithTheId((await status).streams, "doorbell")).toMatchObject({ location: null, state: "failed", failed_because: expect.stringMatching(/^an earlier runtime recorded it/) });
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
    expect(statesOf(followed)).toEqual(["queued:", "in_progress:reading_the_graph_documents", "in_progress:starting", "done:"]);
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
    expect(statesOf(await followedToItsEnd(backend, drawn.answer.action))).toEqual(["queued:", "in_progress:reading_the_graph_documents", "in_progress:making_the_venv", "in_progress:starting", "done:"]);
    expect(await settled(() => backend.chooseStreamProjectFolder("new_project_directory"))).toEqual({ answer: "/Users/jonathanf/streams/lobby" });

    const existing = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_new_folder=existing")));
    await settled(() => existing.getTatolabStatus());
    await settled(() => existing.chooseStreamProjectFolder("new_project_directory"));
    const intoAProject = await settled(() => existing.createStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in intoAProject)) throw new Error("the creation was refused");
    expect((await followedToItsEnd(existing, intoAProject.answer.action)).at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ state: "failed", failed_because: expect.stringMatching(/already has pyproject.toml, and a new project's files would overwrite it/) }),
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
    expect(await backend.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: `${tatoStudioFolder}/Night Show`, name: "Night Show" } } });
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
  it("serves each port's family by default, as the runtime does, and none when asked", async () => {
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
    const unservedWhenAsked = await familiesOfMain("port_families=unserved");
    expect(new Set([...unservedWhenAsked.graph, ...unservedWhenAsked.catalog])).toEqual(new Set([null]));
    const servedByDefault = await familiesOfMain("");
    expect(servedByDefault.graph).not.toContain(null);
    expect(new Set(servedByDefault.graph)).toEqual(new Set(["image", "records", "array"]));
    expect(servedByDefault.catalog).not.toContain(null);
  });
});

/** The mock's status, once its fake timers have run past its answer's delay. */
async function statusAfterTheMockAnswers(backend: TatolabBackend) {
  const status = backend.getTatolabStatus();
  await vi.advanceTimersByTimeAsync(100);
  return status;
}

/** `answering` settled, once the mock's fake timers have run past its delay. */
async function answeredAfterTheMockAnswers(answering: Promise<void>) {
  await vi.advanceTimersByTimeAsync(100);
  return answering;
}

describe("the mock backend's update dialog", () => {
  it("announces the staged version with ?update=ready, and Install Update takes it away and installs", async () => {
    const { backend } = await runningMockBackend("update=ready");
    expect((await statusAfterTheMockAnswers(backend)).app_update_announcement).toEqual({ kind: "update_ready", version: "0.46.0" });

    await answeredAfterTheMockAnswers(backend.answerTheAppUpdateAnnouncement("update_ready", "0.46.0", "take_its_action"));

    const status = await statusAfterTheMockAnswers(backend);
    expect(status.app_update_announcement).toBeNull();
    expect(status.app_update).toEqual({ kind: "installing", version: "0.46.0" });
  });

  it("announces the version the app is now with ?update=landed, and OK takes it away", async () => {
    const { backend } = await runningMockBackend("update=landed");
    expect((await statusAfterTheMockAnswers(backend)).app_update_announcement).toEqual({
      kind: "update_landed",
      version: "0.45.0",
      release_notes_url: "https://github.com/tatolab/tatolab-app/releases/tag/v0.45.0",
    });

    await answeredAfterTheMockAnswers(backend.answerTheAppUpdateAnnouncement("update_landed", "0.45.0", "dismiss"));

    expect((await statusAfterTheMockAnswers(backend)).app_update_announcement).toBeNull();
  });
});
