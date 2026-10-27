// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import type { ListedStream, RelaysDescription, TatolabStatus } from "../../shared/tatolab_backend_contract";

afterEach(() => {
  vi.useRealTimers();
});

function listingNamed(streams: ListedStream[] | null, streamName: string): ListedStream | undefined {
  return streams?.find((stream) => stream.name === streamName);
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
  it("stops a kept stream as the runtime records it, and starts it again", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "camera"));
    expect(stopped.answer).toEqual({ notice: null });
    expect(listingNamed(stopped.streams, "camera")).toMatchObject({ state: "stopped", node_count: null });

    const started = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "camera"));
    expect(started.answer).toEqual({ notice: null });
    expect(listingNamed(started.streams, "camera")).toMatchObject({ state: "kept", node_count: 4 });
  });

  it("ends an attached stream's session when it is stopped", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "attached-demo"));

    expect(stopped.answer).toEqual({ notice: null });
    expect(listingNamed(stopped.streams, "attached-demo")).toBeUndefined();
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stoppedTwice = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "pattern-two"));
    expect(stoppedTwice.answer).toEqual({ refusal: "Runtime error: the kept stream `pattern-two` is already stopped; `start` loads it again" });
    const startedWhileLoaded = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "main"));
    expect(startedWhileLoaded.answer).toEqual({ refusal: expect.stringMatching(/^Runtime error: the stream `main` is already loaded in this runtime, kept;/) });
    const removedUnknown = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", "nope"));
    expect(removedUnknown.answer).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream named `nope` is loaded or kept in this runtime\./) });
  });

  it("keeps a failed stream failed when its retry does not load, with the retry's reason", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const retried = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "lobby-recorder"));

    expect(retried.answer).toEqual({ refusal: expect.any(String) });
    expect(listingNamed(retried.streams, "lobby-recorder")?.failed_because).toMatch(/^`start` retried it, and it did not load: /);
  });

  it("forgets a removed stream", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const removed = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", "pattern-two"));

    expect(removed.answer).toEqual({ notice: null });
    expect(listingNamed(removed.streams, "pattern-two")).toBeUndefined();
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

  it("runs the chosen folder kept, lists it, and refuses a folder it never handed the window", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_run=warning")));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";
    expect(folder).toBe("/Users/jonathanf/code/heat-map");

    const run = await settled(() => backend.runStreamProject(folder, null, "heat_map"));
    expect(run).toEqual({
      answer: {
        kind: "running",
        answer: expect.objectContaining({ stream: "heat_map", kept: true, project_directory: folder, node_count: 4, compile_warnings: ["tatolab: the cross-floor check found 1 thing binding this app to one floor.", "  nodes/heat_render.py:4: imports `cupy`"] }),
      },
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && listingNamed(status.answer.streams, "heat_map")).toMatchObject({ state: "kept", project_directory: folder });

    expect(await settled(() => backend.runStreamProject("/etc", null, "etc"))).toEqual({
      refusal: "Tatolab acts only on a folder chosen in its window. Choose /etc again.",
    });
  });

  it("answers a name a listed stream holds with the runtime's refusal and the first free name", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=taken")));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";

    expect(await settled(() => backend.runStreamProject(folder, null, "main"))).toEqual({
      answer: {
        kind: "name_taken",
        refusal: expect.stringMatching(/^Stream graph error: the stream name `main` is held by a kept stream from /),
        free_name: "main-2",
      },
    });
  });

  it("replaces the stream a folder already runs when it runs again, as the runtime replaces a kept record", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";
    await settled(() => backend.runStreamProject(folder, null, "heat_map"));

    expect(await settled(() => backend.runStreamProject(folder, null, "heat_map"))).toEqual({
      answer: { kind: "running", answer: expect.objectContaining({ stream: "heat_map", replaced_the_kept_record: true }) },
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && status.answer.streams?.filter((stream) => stream.name === "heat_map").length).toBe(1);
  });

  it("refuses a taken name the window did not send as the runtime does, with no free name offered", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=taken")));
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_run"));
    const folder = "answer" in chosen && chosen.answer !== null ? chosen.answer.folder : "";

    expect(await settled(() => backend.runStreamProject(folder, null, null))).toEqual({
      refusal: expect.stringMatching(/^Stream graph error: the stream name `main` is held by a kept stream from /),
    });
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
