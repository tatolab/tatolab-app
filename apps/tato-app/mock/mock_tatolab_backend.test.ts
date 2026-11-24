// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend } from "./mock_tatolab_backend";
import { readMockTatolabOptions } from "./mock_tatolab_options";
import type { ListedStream, ProjectLogNarrowing, ProjectLogRecord, StreamActionFollowed, StreamGraph } from "../src/shared/tatolab_backend_contract";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import { familyOfThePort, inputValueReadOfThePort, jsonObjectMembersOf } from "@tatolab/tato-app-view-sdk/studio_readings";
import { suggestedGraphEditOf } from "@tatolab/tato-app-view-sdk/suggested_graph_edit_of_a_refusal";

afterEach(() => {
  vi.useRealTimers();
});

/** The mock streams' ids, which the runtime would compute from their locations. */
const MAIN = "pulse-stage-main-111b09";
const CAMERA = "camera-main-b0a0e5";
const RECORDER = "pulse-stage-recorder-f382aa";
const REHEARSAL = "pulse-stage-rehearsal-8d090c";
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
  const page = backend.readProjectLogRecords(projectDirectory, narrowing, null, null);
  await vi.advanceTimersByTimeAsync(100);
  return (await page).records;
}

const PULSE_STAGE_FOLDER = "/Users/jonathanf/streams/pulse-stage";
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
      [REHEARSAL, "rehearsal", "stopped"],
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
    expect(listingWithTheId(stopped.streams, MAIN)).toMatchObject({ state: "stopped", action: null, step: null });
    expect(listingWithTheId(stopped.streams, RECORDER)).toMatchObject({ state: "stopped" });
    expect(listingWithTheId(stopped.streams, CAMERA)).toMatchObject({ state: "running" });
  });

  it("pauses every running stream of the open project at once, resumes them on Live, and stops a paused project", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const paused = await streamsAfterEachChange(() => backend.pauseOpenProject());
    expect(paused.answer).toEqual({ queued: true });
    expect(listingWithTheId(paused.streams, MAIN)).toMatchObject({ state: "paused", action: null });
    expect(listingWithTheId(paused.streams, RECORDER)).toMatchObject({ state: "paused" });
    expect(listingWithTheId(paused.streams, CAMERA)).toMatchObject({ state: "running" });
    const resumed = await streamsAfterEachChange(() => backend.runOpenProject());
    expect(resumed.answer).toEqual({ queued: true });
    expect(listingWithTheId(resumed.streams, MAIN)).toMatchObject({ state: "running" });
    expect(listingWithTheId(resumed.streams, RECORDER)).toMatchObject({ state: "running" });
    await streamsAfterEachChange(() => backend.pauseOpenProject());
    await streamsAfterEachChange(() => backend.stopOpenProject());
    const stopped = await streamsAfterEachChange(() => Promise.resolve(), 1000);
    expect(listingWithTheId(stopped.streams, MAIN)).toMatchObject({ state: "stopped" });
    const pausedWhileStopped = await streamsAfterEachChange(() => backend.pauseOpenProject());
    expect(pausedWhileStopped.answer).toEqual({
      refusal: expect.stringMatching(/^Runtime error: no stream of the project in \/Users\/jonathanf\/streams\/pulse-stage plays, so there is none to pause; `start_playback` plays it\. Loaded: /),
    });
    await streamsAfterEachChange(() => backend.runOpenProject());
    const playedAgain = await streamsAfterEachChange(() => Promise.resolve(), 3000);
    expect(listingWithTheId(playedAgain.streams, MAIN)).toMatchObject({ state: "running" });
    expect(listingWithTheId(playedAgain.streams, RECORDER)).toMatchObject({ state: "running" });
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    await streamsAfterEachChange(() => backend.stopOpenProject());
    await streamsAfterEachChange(() => Promise.resolve(), 1000);
    const stoppedTwice = await streamsAfterEachChange(() => backend.stopOpenProject());
    expect(stoppedTwice.answer).toEqual({
      refusal: expect.stringMatching(/^Runtime error: no stream of the project in \/Users\/jonathanf\/streams\/pulse-stage plays, so there is none to stop; `start_playback` plays it\. Loaded: /),
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
    const setSoftness = (softness: number) => ({ operation: "set_node_config" as const, stream: streamAsset, node: firstNode.id, config: { ...jsonObjectMembersOf(firstNode.config), softness } });
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

  it("gives a committed group the same id in the running graph as in the saved one, so a later edit of it applies", async () => {
    const { backend } = await runningMockBackend();
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const firstNode = (await settled(backend.describeStreamGraph(MAIN))).nodes[0];
    if (firstNode === undefined) return expect.unreachable("the main stream holds a node");

    const grouped = await settled(backend.transactInTheOpenProject([{ operation: "add_group", stream: streamAsset, title: "Frame", nodes: [firstNode.id] }], "commit", null));
    if (grouped.kind !== "applied") return expect.unreachable("the group was added");
    const group = (await settled(backend.describeStreamGraph(MAIN))).groups?.at(-1);
    expect(group?.id).toBe(grouped.transaction.added_groups[0]?.group);
    const coloured = await settled(backend.transactInTheOpenProject([{ operation: "set_group_fields", stream: streamAsset, group: group?.id ?? "", colour: "#3fcf8e", description: "The source" }], "commit", null));
    expect(coloured.kind).toBe("applied");
    expect((await settled(backend.describeStreamGraph(MAIN))).groups?.at(-1)).toMatchObject({ colour: "#3fcf8e", description: "The source" });
  });

  it("answers a wire drag's question about the sample's pins with the runtime's recorded answer, unchanged, and refuses one it holds no recording of, judging none", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const graph = await settled(backend.describeStreamGraph(MAIN));
    const idOf = (name: string) => graph.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the sample`);

    const answered = await settled(backend.checkLinkCandidatesInTheOpenProject({ stream: streamAsset, from: { output: { node: idOf("beat"), port: "count" } }, among: "placed_ports", include_refused: true }));
    expect(answered.candidates.map(({ end, check }) => [end.kind === "placed_port" ? `${graph.nodes.find((node) => node.id === end.node)?.name}.${end.port}` : end.node_type, check.outcome])).toEqual([
      ["brightness.value", "refused"],
      ["warmth.count", "refused"],
      ["warmth.accented", "refused"],
      ["warmth.beats_per_bar", "connects"],
      ["warmth.base", "connects_with_free_conversion"],
      ["glow.image", "refused"],
      ["glow.glow", "refused"],
      ["glow.warmth", "refused"],
      ["tally.picture", "refused"],
    ]);
    expect(answered.not_checked?.map(({ end }) => end.port)).toEqual(["level", "beats_per_minute", "accent_every", "accent"]);

    const unrecorded = backend.checkLinkCandidatesInTheOpenProject({ stream: streamAsset, from: { output: { node: idOf("glow"), port: "result" } }, among: "placed_ports", include_refused: true });
    const rejection = expect(unrecorded).rejects.toBe("The mock holds no recorded answer of check_link_candidates for this pin.");
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });

  it("replays the runtime's recorded refusal of a link of another type on the sample's first connect, then makes the link it is next asked for, judging none", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind&refusal=link_of_another_type");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    const idOf = (name: string) => graphBefore.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the sample`);
    const tallyIntoBase = { operation: "connect" as const, stream: streamAsset, source: { node: idOf("tally"), port: "tally" }, target: { node: idOf("warmth"), port: "base" } };

    const refused = await settled(backend.transactInTheOpenProject([{ operation: "rename_node", stream: streamAsset, node: idOf("glow"), name: "shine" }, tallyIntoBase], "commit", null));
    expect(refused).toEqual({
      kind: "refused",
      refusal: {
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 1,
        refused_node: null,
        refused_link: { source: { node: idOf("tally"), port: "tally" }, target: { node: idOf("warmth"), port: "base" } },
        refused_field: null,
        refused_params_pointer: null,
        refused_file: null,
        suggested_call: null,
        runtime_words: "Invalid link: cannot link tally.tally (Records) to warmth.base (Channels): a link joins two ports of one family; place a RecordsToChannels node between them",
      },
    });
    expect(await settled(backend.describeStreamGraph(MAIN))).toEqual(graphBefore);

    expect((await settled(backend.transactInTheOpenProject([tallyIntoBase], "commit", null))).kind).toBe("applied");
    expect((await settled(backend.describeStreamGraph(MAIN))).links.filter((link) => link.target.node === "warmth" && link.target.port === "base").map((link) => link.source.node)).toEqual(["tally"]);
  });

  it("answers the recorded check and refusal of a Sweep into a Float with the transact placing SweepPosition, makes that edit as given, by the stream's id, and one undo takes it back", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind_with_a_named_type&refusal=link_needs_a_module_conversion");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    const idOf = (name: string) => graphBefore.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the sample`);
    const sweepIntoTheBeat = { operation: "connect" as const, stream: streamAsset, source: { node: idOf("sweep"), port: "result" }, target: { node: idOf("beat"), port: "beats_per_minute" } };
    const checked = await settled(backend.checkLinkCandidatesInTheOpenProject({ stream: streamAsset, from: { output: { node: idOf("sweep"), port: "result" } }, among: "placed_ports", include_refused: true }));
    const checkOf = (port: string) => checked.candidates.find(({ end }) => end.kind === "placed_port" && end.node === idOf("beat") && end.port === port)?.check;
    expect(checkOf("beats_per_minute")).toMatchObject({ outcome: "refused", refusal: { refusal_code: "link_needs_a_module_conversion", suggested_call: { operation: "transact" } } });

    const refused = await settled(backend.transactInTheOpenProject([sweepIntoTheBeat], "commit", null));
    if (refused.kind !== "refused") return expect.unreachable("the link is refused");
    expect(refused.refusal).toMatchObject({ refusal_code: "link_needs_a_module_conversion", suggested_call: { operation: "transact" } });
    const suggestedEdit = suggestedGraphEditOf(refused.refusal.suggested_call);
    if (suggestedEdit === null) return expect.unreachable("the refusal suggests an edit");
    expect(suggestedEdit.operations.map((operation) => operation.stream)).toEqual([MAIN, MAIN, MAIN]);
    expect(await settled(backend.describeStreamGraph(MAIN))).toEqual(graphBefore);

    const placed = await settled(backend.transactInTheOpenProject(suggestedEdit.operations, suggestedEdit.mode, "take-the-fix"));
    if (placed.kind !== "applied") return expect.unreachable("the suggested edit applied");
    expect(placed.transaction.added_nodes).toMatchObject([{ name: "sweepposition", as: "conversion" }]);
    const graphPlaced = await settled(backend.describeStreamGraph(MAIN));
    const linksOf = (node: string) => graphPlaced.links.filter((link) => link.source.node === node || link.target.node === node).map((link) => `${link.source.node}.${link.source.port} -> ${link.target.node}.${link.target.port}`);
    expect(linksOf("sweepposition")).toEqual(["sweep.result -> sweepposition.sweep", "sweepposition.result -> beat.beats_per_minute"]);

    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    expect((await settled(backend.describeStreamGraph(MAIN))).nodes.map((node) => node.name)).toEqual(graphBefore.nodes.map((node) => node.name));
    expect((await settled(backend.describeStreamGraph(MAIN))).links).toHaveLength(graphBefore.links.length);
  });

  it("serves the marks the runtime recorded on the sample's links, gives a link it connects the marks its recorded check gave, and serves the stand-in warning when asked", async () => {
    const marksOf = (graph: StreamGraph) => graph.links.flatMap((link) => (link.free_conversion === undefined && link.warnings === undefined ? [] : [[`${link.source.node}.${link.source.port} → ${link.target.node}.${link.target.port}`, link.free_conversion ?? null, link.warnings ?? null]]));
    const { backend } = await runningMockBackend("main_graph=every_pin_kind");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    expect(marksOf(graphBefore)).toEqual([
      ["beat.glow → glow.glow", true, null],
      ["warmth.result → glow.warmth", true, null],
    ]);
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const idOf = (name: string) => graphBefore.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the sample`);
    const connect = (sourceNode: string, sourcePort: string, targetNode: string, targetPort: string) => ({ operation: "connect" as const, stream: streamAsset, source: { node: idOf(sourceNode), port: sourcePort }, target: { node: idOf(targetNode), port: targetPort } });
    expect((await settled(backend.transactInTheOpenProject([connect("beat", "count", "warmth", "base"), connect("beat", "count", "warmth", "beats_per_bar")], "commit", null))).kind).toBe("applied");
    expect(marksOf(await settled(backend.describeStreamGraph(MAIN)))).toEqual([
      ["beat.glow → glow.glow", true, null],
      ["warmth.result → glow.warmth", true, null],
      ["beat.count → warmth.base", true, null],
    ]);

    const { backend: backendWithAWarnedLink } = await runningMockBackend("main_graph=every_pin_kind_with_a_warned_link");
    const warned = backendWithAWarnedLink.describeStreamGraph(MAIN);
    await vi.advanceTimersByTimeAsync(100);
    expect(marksOf(await warned)).toEqual([
      ["beat.count → warmth.count", null, [{ warning: "meanings_differ", output_meaning: "seconds", input_meaning: "frames", words: "the output carries `seconds` and the input takes `frames`" }]],
      ["beat.glow → glow.glow", true, null],
      ["warmth.result → glow.warmth", true, null],
    ]);
  });

  it("serves the recorded Graph Input whose `pin_type` setting chose Float, the sample's `warmth_base`, as the runtime served it, its choice set and undone", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind_with_a_type_choosing_input");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const choosingOf = (graph: StreamGraph) => graph.nodes.find((node) => node.name === "warmth_base");
    const pinTypeOf = (graph: StreamGraph) => choosingOf(graph)?.ports.inputs.find((port) => port.name === "pin_type");
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    expect(choosingOf(graphBefore)?.type).toBe("tatolab.stream:GraphInput");
    expect(choosingOf(graphBefore)?.ports.inputs.map((port) => [port.name, port.pin_type?.type ?? null, port.value_comes_from ?? null])).toEqual([
      ["port", "string", "saved"],
      ["pin_type", "pin_type_choice", "saved"],
      ["family", "menu", null],
      ["range", "list_of", "saved"],
      ["step", "float", null],
      ["unit", "string", null],
      ["meaning", "string", null],
      ["control", "string", null],
      ["lifetime", "menu", "default"],
      ["value", "float", "saved"],
    ]);
    expect(pinTypeOf(graphBefore)?.value).toEqual({ type: "float" });
    expect(choosingOf(graphBefore)?.ports.inputs.find((port) => port.name === "range")?.value).toEqual([0, 1]);
    expect(choosingOf(graphBefore)?.ports.inputs.find((port) => port.name === "value")?.annotations).toEqual({ range: { minimum: 0, maximum: 1 } });
    // Recorded with playback stopped, each node reads Pending, and an Input that is not running carries no current value.
    expect(choosingOf(graphBefore)?.components.graph_interface).toEqual({ direction: "input", port: "warmth_base", family: "channels", pin_type: { type: "float" } });
    expect(graphBefore.links.filter((link) => link.target.node === "warmth" && link.target.port === "base").map((link) => `${link.source.node}.${link.source.port}`)).toEqual(["warmth_base.value"]);

    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const choosingId = choosingOf(graphBefore)?.id ?? expect.unreachable("the graph holds warmth_base");
    expect((await settled(backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: streamAsset, node: choosingId, input: "pin_type", value: { type: "integer" } }], "commit", null))).kind).toBe("applied");
    expect(pinTypeOf(await settled(backend.describeStreamGraph(MAIN)))?.value).toEqual({ type: "integer" });
    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    expect(pinTypeOf(await settled(backend.describeStreamGraph(MAIN)))?.value).toEqual({ type: "float" });
  });

  it("serves each input's mark as the runtime recorded it, and replays its refusal of a link into a Graph Input's setting", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind_with_a_wired_setting&refusal=input_takes_no_wire");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(200);
      return answering;
    };
    const graph = await settled(backend.describeStreamGraph(MAIN));
    const marksOf = (nodeName: string) => graph.nodes.find((node) => node.name === nodeName)?.ports.inputs.map((port) => [port.name, port.takes_a_wire]);
    expect(marksOf("warmth_base")?.every(([, takesAWire]) => takesAWire === false)).toBe(true);
    expect(marksOf("caption")?.every(([, takesAWire]) => takesAWire === true)).toBe(true);
    expect(marksOf("tensortoaudio")).toEqual([
      ["array", true],
      ["attribute", true],
      ["channel_names", true],
      ["sample_rate", true],
    ]);
    expect(graph.links.filter((link) => link.target.node === "tensortoaudio").map((link) => `${link.source.node}.${link.source.port} → ${link.target.port}`)).toEqual(["flash.flashes → sample_rate"]);
    expect(graph.nodes.find((node) => node.name === "flash")?.kind).toBe("process");
    expect(graph.nodes.find((node) => node.name === "tensortoaudio")?.ports.inputs.find((port) => port.name === "sample_rate")?.value_comes_from).toBe("wire");

    const described = await settled(backend.describeNodeTypes(PULSE_STAGE_FOLDER, ["tatolab.stream:RecordsToChannels", "tatolab.stream:TensorToAudio", "tatolab.stream:TensorToTexture"]));
    expect(described.node_types.flatMap((nodeType) => ("not_described_because" in nodeType ? [] : nodeType.inputs.map((input) => [input.name, input.takes_a_wire])))).toEqual([
      ["records", true],
      ["channel_names", false],
      ["sample_rate", false],
      ["array", true],
      ["attribute", true],
      ["channel_names", true],
      ["sample_rate", true],
      ["array", true],
      ["attribute", true],
      ["format", true],
    ]);

    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const idOf = (name: string) => graph.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the graph`);
    const intoTheGraphInputsPort = { operation: "connect", stream: streamAsset, source: { node: idOf("caption"), port: "result" }, target: { node: idOf("warmth_base"), port: "port" } } as const;
    expect(await settled(backend.transactInTheOpenProject([intoTheGraphInputsPort], "commit", null))).toMatchObject({
      kind: "refused",
      refusal: { refusal_code: "input_takes_no_wire", refused_operation_index: 0, refused_field: "port", refused_link: { source: intoTheGraphInputsPort.source, target: intoTheGraphInputsPort.target } },
    });
  });

  it("serves the stand-in bundle node's members each on its own row, sets and undoes one member alone, and links and unlinks a member", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind_with_a_bundle");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const levelsOf = (graph: StreamGraph) => graph.nodes.find((node) => node.name === "mixer")?.ports.inputs.find((port) => port.name === "levels");
    const memberLinksOf = (graph: StreamGraph) => graph.links.flatMap((link) => (link.target.member === undefined ? [] : [`${link.source.node}.${link.source.port} → ${link.target.node}.${link.target.port}.${link.target.member}`]));
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    expect(levelsOf(graphBefore)?.member_values).toEqual([
      { member: "left", value: 0.25, value_comes_from: "saved" },
      { member: "right", value_comes_from: "wire" },
    ]);
    expect(levelsOf(graphBefore)?.value_comes_from).toBeUndefined();
    expect(memberLinksOf(graphBefore)).toEqual(["warmth.result → mixer.levels.right"]);

    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const idOf = (name: string) => graphBefore.nodes.find((node) => node.name === name)?.id ?? expect.unreachable(`no ${name} in the graph`);
    const memberLink = { stream: streamAsset, source: { node: idOf("warmth"), port: "result" }, target: { node: idOf("mixer"), port: "levels", member: "right" } };
    expect((await settled(backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: streamAsset, node: idOf("mixer"), input: "levels", member: "left", value: 0.75 }], "commit", null))).kind).toBe("applied");
    expect((await settled(backend.transactInTheOpenProject([{ operation: "disconnect", ...memberLink }], "commit", null))).kind).toBe("applied");
    const graphAfter = await settled(backend.describeStreamGraph(MAIN));
    expect(levelsOf(graphAfter)?.member_values).toEqual([
      { member: "left", value: 0.75, value_comes_from: "saved" },
      { member: "right", value: 0.5, value_comes_from: "default" },
    ]);
    expect(memberLinksOf(graphAfter)).toEqual([]);

    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    const graphUndone = await settled(backend.describeStreamGraph(MAIN));
    expect(levelsOf(graphUndone)?.member_values).toEqual(levelsOf(graphBefore)?.member_values);
    expect(memberLinksOf(graphUndone)).toEqual(memberLinksOf(graphBefore));
    const refused = expect(backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: streamAsset, node: idOf("mixer"), input: "levels", member: "middle", value: 1 }], "commit", null)).rejects.toThrow("has no member `middle`");
    await vi.advanceTimersByTimeAsync(100);
    await refused;
  });

  it("saves a collapse as a placed stream, commits an edit inside it, and undoes both in turn", async () => {
    const { backend } = await runningMockBackend();
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(100);
      return answering;
    };
    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    const graphBefore = await settled(backend.describeStreamGraph(MAIN));
    const firstNode = graphBefore.nodes[0];
    if (firstNode === undefined) return expect.unreachable("the main stream holds a node");

    const collapsed = await settled(backend.transactInTheOpenProject([{ operation: "collapse_selection_into_subgraph", stream: streamAsset, nodes: [firstNode.id], name: "look", as: "look" }], "commit", null));
    if (collapsed.kind !== "applied") return expect.unreachable("the collapse applied");
    const look = collapsed.transaction.added_nodes[0]?.node ?? "";
    const lookNode = (await settled(backend.describeStreamGraph(MAIN))).nodes.find((node) => node.id === look);
    expect(lookNode).toMatchObject({ type: "tatolab.project:StreamFragment" });

    const addInside = { operation: "add_node" as const, stream: streamAsset, level: [look], type: "nodes.looks:GlowBlur", name: "preview" };
    expect((await settled(backend.transactInTheOpenProject([addInside], "commit", null))).kind).toBe("applied");
    const insideNames = async () => (await settled(backend.describeStreamGraph(MAIN))).nodes.find((node) => node.id === look)?.fragment?.nodes.map((node) => node.name);
    expect(await insideNames()).toContain("preview");

    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    expect(await insideNames()).not.toContain("preview");
    await settled(backend.undoInTheOpenProject({ kind: "person", name: "Sam" }));
    expect((await settled(backend.describeStreamGraph(MAIN))).nodes.map((node) => node.id).sort()).toEqual(graphBefore.nodes.map((node) => node.id).sort());
  });

  it("lists a record an earlier runtime wrote, failed with no location, with ?streams=earlier_record", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("streams=earlier_record")));
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect(listingWithTheId((await status).streams, "doorbell")).toMatchObject({ location: null, state: "failed", failed_because: expect.stringMatching(/^an earlier runtime recorded it/) });
  });

  it("holds the open project's open failed in the runtime's words, with ?project_open=refused", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("project_open=refused")));
    await vi.advanceTimersByTimeAsync(1000);

    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);

    expect((await status).project_stream_action_failures).toEqual([
      expect.objectContaining({ project_directory: PULSE_STAGE_FOLDER, kind: "open", failed_because: expect.stringContaining("held by a record an earlier runtime wrote") }),
    ]);
  });

  it("removes a project: each of its streams stopping, then forgotten, and no other", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const removing = await streamsAfterEachChange(() => backend.removeProject(PULSE_STAGE_FOLDER));
    expect(removing.answer).toEqual({ queued: true });
    expect([MAIN, RECORDER, REHEARSAL].map((streamId) => listingWithTheId(removing.streams, streamId)?.state)).toEqual(["stopping", "stopping", "stopping"]);
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

    const wholeProject = await everyProjectLogRecord(backend, PULSE_STAGE_FOLDER, { stream: null, action: null });
    const mainOnly = await everyProjectLogRecord(backend, PULSE_STAGE_FOLDER, { stream: MAIN, action: null });
    expect(new Set(wholeProject.map((record) => record.stream))).toEqual(new Set([MAIN, RECORDER]));
    expect(mainOnly.length).toBeGreaterThan(0);
    expect(mainOnly.every((record) => record.stream === MAIN)).toBe(true);

    const firstPage = backend.readProjectLogRecords(PULSE_STAGE_FOLDER, { stream: null, action: null }, null, null);
    await vi.advanceTimersByTimeAsync(100);
    const pageAfterIt = backend.readProjectLogRecords(PULSE_STAGE_FOLDER, { stream: null, action: null }, (await firstPage).next_after, null);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pageAfterIt).records.length).toBeLessThan(wholeProject.length);
  });

  it("marks records no longer held once the log's retention deleted some, with ?held_records=", async () => {
    const { backend } = await runningMockBackend("held_records=5");

    const page = backend.readProjectLogRecords(PULSE_STAGE_FOLDER, { stream: null, action: null }, null, null);
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

  it("imports the chosen folder as a queued open, lists its stream preparing then stopped, and refuses a folder it never handed the window", async () => {
    vi.useFakeTimers();
    const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
    await settled(() => backend.getTatolabStatus());
    const chosen = await settled(() => backend.chooseStreamProjectFolder("project_to_open"));
    expect(chosen).toEqual({ answer: "/Users/jonathanf/code/heat-map" });

    const queued = await settled(() => backend.openStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queued)) throw new Error("the open was refused");
    expect(queued.answer.project_directory).toBe("/Users/jonathanf/code/heat-map");
    const followed = await followedToItsEnd(backend, queued.answer.action);
    expect(statesOf(followed)).toEqual(["queued:", "in_progress:reading_the_graph_documents", "in_progress:starting", "done:"]);
    expect(followed.at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ kind: "open", state: "done", streams: [{ stream: HEAT_MAP, display_name: "heat_map", state: "stopped" }] }),
    });
    const status = await settled(() => backend.getTatolabStatus());
    expect("answer" in status && listingWithTheId(status.answer.streams, HEAT_MAP)).toMatchObject({ state: "stopped" });

    expect(await settled(() => backend.openStreamProject("/etc"))).toEqual({ refusal: "Tato Studio acts only on a folder chosen in its window. Choose /etc again." });
  });

  it("imports a folder with two streams, one failing, and makes a .venv first for a folder with none", async () => {
    vi.useFakeTimers();
    const doorways = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=several")));
    await settled(() => doorways.getTatolabStatus());
    await settled(() => doorways.chooseStreamProjectFolder("project_to_open"));
    const queued = await settled(() => doorways.openStreamProject("/Users/jonathanf/code/doorways"), 50);
    if (!("answer" in queued)) throw new Error("the open was refused");
    const ending = (await followedToItsEnd(doorways, queued.answer.action)).at(-1);
    expect(ending?.kind === "described" && ending.description.streams.map((stream) => [stream.display_name, stream.state])).toEqual([
      ["front_door", "stopped"],
      ["back_door", "failed"],
    ]);

    const noVenv = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_folder=no-venv")));
    await settled(() => noVenv.getTatolabStatus());
    await settled(() => noVenv.chooseStreamProjectFolder("project_to_open"));
    const queuedWithNoVenv = await settled(() => noVenv.openStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queuedWithNoVenv)) throw new Error("the open was refused");
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
    await settled(() => refused.chooseStreamProjectFolder("project_to_open"));
    const queued = await settled(() => refused.openStreamProject("/Users/jonathanf/code/heat-map"), 50);
    if (!("answer" in queued)) throw new Error("the open was refused");
    expect((await followedToItsEnd(refused, queued.answer.action)).at(-1)).toEqual({
      kind: "described",
      description: expect.objectContaining({ state: "failed", failed_because: expect.stringMatching(/^error: Failed to fetch: `https:\/\/pypi.org\/simple\/tatolab-stream\/`/) }),
    });

    const notHeld = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("add_action=not_held&add_folder=cancel")));
    await settled(() => notHeld.getTatolabStatus());
    expect(await settled(() => notHeld.describeStreamAction("R-1"))).toEqual({ answer: { kind: "not_held", words: expect.stringMatching(/^Invalid configuration: the stream action `R-1` is not held/) } });
    expect(await settled(() => notHeld.chooseStreamProjectFolder("project_to_open"))).toEqual({ answer: null });
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

describe("the mock backend's node types", () => {
  it("lists and describes the node types the runtime listed and described for the sample, every one the sample's graph names but its Graph Input, and refuses a folder holding no project", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind");
    const graph = backend.describeStreamGraph(MAIN);
    const listing = backend.listNodeTypes(PULSE_STAGE_FOLDER);
    const refusal = backend.listNodeTypes("/etc").catch((refused: unknown) => refused);
    await vi.advanceTimersByTimeAsync(200);
    const typesListed = (await listing).sources.flatMap((source) => source.node_types.map((listed) => listed.node_type));
    expect((await listing).project_directory).toBe(PULSE_STAGE_FOLDER);
    expect((await graph).nodes.map((node) => [node.name, typesListed.includes(node.type)])).toEqual([
      ["testpattern", true],
      ["brightness", false],
      ["beat", true],
      ["warmth", true],
      ["spotlight", true],
      ["caption", true],
      ["flash", true],
      ["glow", true],
      ["tally", true],
    ]);
    expect(await refusal).toBe("list_node_types failed: /etc holds no project: it has no tatolab-project.json");
    const described = backend.describeNodeTypes(PULSE_STAGE_FOLDER, typesListed);
    await vi.advanceTimersByTimeAsync(200);
    expect((await described).node_types.map((nodeType) => nodeType.node_type)).toEqual(typesListed);
  });

  it("lists, describes and places the node type a node file made from the runtime's template declares, and tells the window the node types changed", async () => {
    const { backend } = await runningMockBackend("main_graph=every_pin_kind");
    const settled = async <Answer>(answering: Promise<Answer>): Promise<Answer> => {
      await vi.advanceTimersByTimeAsync(200);
      return answering;
    };
    let nodeTypesChanged = 0;
    backend.onProjectNodeTypesChanged(() => {
      nodeTypesChanged += 1;
    });
    expect(await settled(backend.createNodeFile(`${PULSE_STAGE_FOLDER}/nodes/sparkle.py`))).toEqual({ file: `${PULSE_STAGE_FOLDER}/nodes/sparkle.py`, node_type: "nodes.sparkle:Sparkle" });
    expect(nodeTypesChanged).toBe(1);

    const listing = await settled(backend.listNodeTypes(PULSE_STAGE_FOLDER));
    expect(listing.sources.find((source) => source.source === "project")?.node_types.map((listed) => listed.node_type)).toContain("nodes.sparkle:Sparkle");
    const described = await settled(backend.describeNodeTypes(PULSE_STAGE_FOLDER, ["nodes.sparkle:Sparkle"]));
    expect(described.node_types).toMatchObject([{ node_type: "nodes.sparkle:Sparkle", declared_at: { path: "nodes/sparkle.py" }, inputs: [{ name: "video_in" }], outputs: [{ name: "video_out" }] }]);

    const streamAsset = listingWithTheId((await settled(backend.getTatolabStatus())).streams, MAIN)?.location?.stream_asset ?? "";
    expect(await settled(backend.transactInTheOpenProject([{ operation: "add_node", stream: streamAsset, type: "nodes.sparkle:Sparkle" }], "commit", "place-sparkle"))).toMatchObject({ kind: "applied" });
    expect((await settled(backend.describeStreamGraph(MAIN))).nodes.find((node) => node.type === "nodes.sparkle:Sparkle")).toMatchObject({ name: "sparkle" });
  });
});

/** The node types of a stream's variables, whose ports the runtime serves no family on. */
const VARIABLE_NODE_TYPES: readonly string[] = ["tatolab.stream:SetVariable", "tatolab.stream:GetVariable"];

describe("the mock backend's port families", () => {
  it("serves each port's family by default, as the runtime does, and none when asked", async () => {
    const familiesOfMain = async (pageQuery: string) => {
      const { backend } = await runningMockBackend(pageQuery);
      const graph = backend.describeStreamGraph(MAIN);
      const described = backend.describeNodeTypes(PULSE_STAGE_FOLDER, ["tatolab.stream:ChannelsToRecords", "nodes.stage_shaders:Kaleidoscope"]);
      await vi.advanceTimersByTimeAsync(200);
      const read = await graph;
      return {
        // A Set or Get Variable's `value` carries whatever is linked to it, so the runtime serves no family on it.
        graph: read.nodes.filter((node) => !VARIABLE_NODE_TYPES.includes(node.type)).flatMap((node) => [...node.ports.inputs, ...node.ports.outputs].map(familyOfThePort)),
        described: (await described).node_types.flatMap((nodeType) => ("not_described_because" in nodeType ? [] : [...nodeType.inputs, ...nodeType.outputs].map(familyOfThePort))),
      };
    };
    const unservedWhenAsked = await familiesOfMain("port_families=unserved");
    expect(new Set([...unservedWhenAsked.graph, ...unservedWhenAsked.described])).toEqual(new Set([null]));
    const servedByDefault = await familiesOfMain("");
    expect(servedByDefault.graph).not.toContain(null);
    expect(new Set(servedByDefault.graph)).toEqual(new Set(["image", "channels", "records"]));
    expect(servedByDefault.described).toEqual(["channels", null, "records", null, null, null, null, null]);
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

describe("the mock's declared Graph Inputs", () => {
  it("serve each Graph Input's lifetime as its `lifetime` setting, as the runtime renders it, so Perform reads `strobe` as reset at Stop", async () => {
    const { backend } = await runningMockBackend("state=running&graph_inputs=declared");
    const reading = backend.describeStreamGraph(MAIN);
    await vi.advanceTimersByTimeAsync(100);
    const graph = await reading;
    const lifetimeOf = (name: string) => {
      const port = graph.nodes.find((node) => node.name === name)?.ports.inputs.find((input) => input.name === "lifetime");
      return port === undefined ? undefined : inputValueReadOfThePort(port);
    };
    expect(lifetimeOf("strobe_input")).toEqual({ value: "reset", comes_from: "saved" });
    expect(lifetimeOf("cue_input")).toEqual({ value: "kept", comes_from: "default" });
  });
});
