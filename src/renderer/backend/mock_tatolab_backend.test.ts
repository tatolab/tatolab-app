// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import type { ListedStream, RelaysDescription, TatolabStatus } from "../../shared/tatolab_backend_contract";

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

async function runningMockBackend() {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
  const streamsAfterEachChange = async (act: () => Promise<string | null>) => {
    const settledAnswer = act().then(
      (notice) => ({ notice }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(100);
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);
    return { answer: await settledAnswer, streams: (await status).streams };
  };
  return { backend, streamsAfterEachChange };
}

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

  it("stops a running stream as the runtime records it, and starts it again", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", CAMERA));
    expect(stopped.answer).toEqual({ notice: null });
    expect(listingWithTheId(stopped.streams, CAMERA)).toMatchObject({ state: "stopped", node_count: null });

    const started = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", CAMERA));
    expect(started.answer).toEqual({ notice: null });
    expect(listingWithTheId(started.streams, CAMERA)).toMatchObject({ state: "running", node_count: 4 });
  });

  it("stops the recorder that reads another stream like any other, and it stays listed stopped", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", RECORDER));

    expect(stopped.answer).toEqual({ notice: null });
    expect(listingWithTheId(stopped.streams, RECORDER)).toMatchObject({ state: "stopped", node_count: null });
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stoppedTwice = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", PATTERN_TWO));
    expect(stoppedTwice.answer).toEqual({ refusal: `Runtime error: the stream \`${PATTERN_TWO}\` is already stopped; \`start\` loads it again` });
    const startedWhileLoaded = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", MAIN));
    expect(startedWhileLoaded.answer).toEqual({ refusal: `Runtime error: the stream \`${MAIN}\` is already loaded in this runtime, running; only a stopped or failed stream starts` });
    const removedByItsDisplayName = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", "main"));
    expect(removedByItsDisplayName.answer).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream with the id `main` is loaded or recorded in this runtime\. Loaded: /) });
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
    expect(await settledRename("camera", "Desk")).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream with the id `camera` is loaded or recorded in this runtime\./) });
  });

  it("lists a record an earlier runtime wrote, failed with no location, with ?streams=earlier_record", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("streams=earlier_record")));
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect(listingWithTheId((await status).streams, "doorbell")).toMatchObject({ location: null, state: "failed", failed_because: expect.stringMatching(/^an earlier runtime recorded it/) });
  });

  it("keeps a failed stream failed when its retry does not load, with the retry's reason", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const retried = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", LOBBY_RECORDER));

    expect(retried.answer).toEqual({ refusal: expect.any(String) });
    expect(listingWithTheId(retried.streams, LOBBY_RECORDER)?.failed_because).toMatch(/^`start` retried it, and it did not load: /);
  });

  it("forgets a removed stream", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const removed = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", PATTERN_TWO));

    expect(removed.answer).toEqual({ notice: null });
    expect(listingWithTheId(removed.streams, PATTERN_TWO)).toBeUndefined();
  });
});

describe("the mock backend's Add stream", () => {
  async function settled<Answer>(act: () => Promise<Answer>, waitMilliseconds = 3000): Promise<{ answer: Answer } | { refusal: unknown }> {
    const settledAnswer = act().then(
      (answer) => ({ answer }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(waitMilliseconds);
    return settledAnswer;
  }

  it("runs the chosen folder under the id its location computes to, lists it running, and refuses a folder it never handed the window", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_run=warning")));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";
    expect(folder).toBe("/Users/jonathanf/code/heat-map");

    const run = await settled(() => backend.runStreamProject(folder, null, "heat map"));
    expect(run).toEqual({
      answer: {
        kind: "running",
        answer: expect.objectContaining({
          stream: HEAT_MAP,
          display_name: "heat map",
          location: { project_directory: folder, stream_function: "stream:heat_map" },
          node_count: 4,
          replaced_a_recorded_stream: false,
          compile_warnings: ["tatolab: the cross-floor check found 1 thing binding this app to one floor.", "  nodes/heat_render.py:4: imports `cupy`"],
        }),
      },
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && listingWithTheId(status.answer.streams, HEAT_MAP)).toMatchObject({ display_name: "heat map", state: "running" });

    expect(await settled(() => backend.runStreamProject("/etc", null, "etc"))).toEqual({
      refusal: "Tatolab acts only on a folder chosen in its window. Choose /etc again.",
    });
  });

  it("replaces the stream a folder already runs when it runs again, under the same id, keeping its display name unless one is given", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=recorded")));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";

    expect(await settled(() => backend.runStreamProject(folder, null, null))).toEqual({
      answer: { kind: "running", answer: expect.objectContaining({ stream: MAIN, display_name: "main", replaced_a_recorded_stream: true }) },
    });
    expect(await settled(() => backend.runStreamProject(folder, null, "front door"))).toEqual({
      answer: { kind: "running", answer: expect.objectContaining({ stream: MAIN, display_name: "front door", replaced_a_recorded_stream: true }) },
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && status.answer.streams?.filter((stream) => stream.stream === MAIN).map((stream) => stream.display_name)).toEqual(["front door"]);
  });

  it("creates a project, then makes its .venv with the Python for new environments as it runs it", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    const proposal = await settled(() => backend.proposeNewStreamProjectFolder());
    const folder = "answer" in proposal ? proposal.answer.folder : "";
    expect(folder).toBe("/Users/jonathanf/streams/hello");

    const created = await settled(() => backend.createStreamProject(folder));
    expect(created).toEqual({ answer: expect.objectContaining({ stream_functions: ["main"], python_environment: { kind: "missing" } }) });
    expect(await settled(() => backend.runStreamProject(folder, null, "hello"), 7000)).toEqual({ answer: expect.objectContaining({ kind: "running" }) });
  });

  it("answers uv's refusal as python_environment_not_made with ?add_venv=refused, and a build with no Python with its reason", async () => {
    vi.useFakeTimers();
    for (const [query, words] of [
      ["add_venv=refused&add_folder=no-venv", expect.stringMatching(/^error: Failed to fetch: `https:\/\/pypi.org\/simple\/tatolab-stream\/`/)],
      ["python=not_offered&add_folder=no-venv", expect.stringMatching(/^This build of Tatolab carries no uv or Python of its own/)],
    ] as const) {
      const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(query)));
      const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
      const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";
      expect(await settled(() => backend.runStreamProject(folder, null, "heat_map"), 4000)).toEqual({ answer: { kind: "python_environment_not_made", words } });
    }
  });

  it("chooses the Python for new environments: one the file dialog picks, Tatolab's again, and a pick that is no Python refused", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    const statuses: TatolabStatus[] = [];
    await backend.onTatolabStatusChanged((status) => statuses.push(status));

    await settled(() => backend.choosePythonForNewEnvironments("chosen_in_a_file_dialog"));
    expect(statuses.at(-1)?.python_for_new_environments).toEqual({ kind: "chosen", interpreter: "/opt/homebrew/bin/python3.12" });
    await settled(() => backend.choosePythonForNewEnvironments("built_in"));
    expect(statuses.at(-1)?.python_for_new_environments).toEqual({ kind: "built_in", python_version: "3.12.12" });

    const notAPython = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("python_pick=not_python")));
    expect(await settled(() => notAPython.choosePythonForNewEnvironments("chosen_in_a_file_dialog"))).toEqual({
      refusal: "/usr/bin/ruby is not a Python interpreter: ruby 3.3.0",
    });
  });

  it("refuses creating a project in a build with no tatolab command, and answers a cancelled dialog with null", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_cli=missing&add_folder=cancel")));
    const proposal = await settled(() => backend.proposeNewStreamProjectFolder());
    const folder = "answer" in proposal ? proposal.answer.folder : "";
    expect(await settled(() => backend.createStreamProject(folder))).toEqual({
      refusal: "This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead.",
    });
    expect(await settled(() => backend.chooseStreamProjectFolder("project_to_run"))).toEqual({ answer: null });
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

  it("refuses a restart while Run Tatolab is off, and names no log folder for a runtime keeping none", async () => {
    vi.useFakeTimers();
    const stopped = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=stopped")));
    const restart = stopped.restartRuntime().catch((refusal: unknown) => refusal);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await restart).toBe("Run Tatolab is off, so there is no runtime to restart. Turn Run Tatolab on to start it.");

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
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=stopped")));

    const outcome = await settled(backend.describeRelays());

    expect("refusal" in outcome && String(outcome.refusal).startsWith("no runtime answers at ")).toBe(true);
  });
});
