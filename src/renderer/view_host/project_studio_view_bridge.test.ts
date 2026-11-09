import { afterEach, describe, expect, it } from "vitest";
import { readStudioViewManifest, STUDIO_VIEW_CAPABILITIES, type StudioViewManifest } from "../../shared/studio_view_manifest";
import { connectToTatoStudioOverPort, type StudioViewInputEvent, type TatoStudioViewConnection } from "../studio_view_sdk/tato_studio_view_connection";
import { WatchedStudioValue } from "./in_window_view_host";
import { ProjectStudioViewBridge } from "./project_studio_view_bridge";
import type { PortViewerConnectionEvent, PortViewerTarget, StudioSelection } from "./studio_view_contract";
import type { StudioViewInputWiring } from "./studio_view_node_wiring";
import type { StudioViewHostServices } from "./studio_view_type_registry";

function manifestOf(manifestJson: Parameters<typeof readStudioViewManifest>[0]): StudioViewManifest {
  const reading = readStudioViewManifest(manifestJson);
  if (reading.kind === "not_read") return expect.unreachable(reading.because);
  return reading.manifest;
}

const DJ_DECK_MANIFEST = manifestOf({
  contract: "1.0",
  title: "DJ Deck",
  entry: "index.html",
  inputs: [{ name: "deck_a", family: "channels" }],
  outputs: [{ name: "crossfader", family: "array" }],
  capabilities: ["read.selection"],
  sandbox: true,
});

const FULL_ACCESS_DJ_DECK_MANIFEST: StudioViewManifest = { ...DJ_DECK_MANIFEST, sandboxed: false, capabilities: [] };

const DECK_A_TARGET: PortViewerTarget = { stream: "set", node_id: "id-deck-a", port: "audio" };
const DECK_B_TARGET: PortViewerTarget = { stream: "set", node_id: "id-deck-b", port: "audio" };

/** Host services answering the selection from a watched value and each port viewer from a recorded list; every other part refuses. */
function recordingHostServices() {
  const selection = new WatchedStudioValue<StudioSelection>({ kind: "nothing" });
  const portViewersOpened: { target: PortViewerTarget; onEvent: (event: PortViewerConnectionEvent) => void; closed: boolean }[] = [];
  const selectionsAsked: StudioSelection[] = [];
  const hostServices: StudioViewHostServices = {
    watchOpenProject: (listener) => {
      listener({ kind: "none_open" });
      return () => undefined;
    },
    watchListedStreams: () => () => undefined,
    watchSelection: selection.watch,
    select: (asked) => selectionsAsked.push(asked),
    watchActiveStreamTab: () => () => undefined,
    openStreamTab: () => undefined,
    watchStreamGraph: () => () => undefined,
    watchNodeCatalog: () => () => undefined,
    watchCodeFileAsked: () => () => undefined,
    openCodeFile: () => undefined,
    readProjectFile: async () => ({ kind: "not_read", because: "no files in this test" }),
    saveProjectFile: async () => ({ kind: "not_saved", because: "no files in this test" }),
    listProjectFiles: async () => ({ kind: "not_listed", because: "no files in this test" }),
    popOutViewer: async () => ({ kind: "not_popped_out", because: "no windows in this test" }),
    watchProjectLog: () => () => undefined,
    watchProjectNodeTypes: () => () => undefined,
    connectToPythonLanguageServer: () => ({ send: () => undefined, close: () => undefined }),
    watchPortViewer: (target, onEvent) => {
      const opened = { target, onEvent, closed: false };
      portViewersOpened.push(opened);
      return {
        close: () => {
          opened.closed = true;
        },
      };
    },
  };
  return { hostServices, selection, portViewersOpened, selectionsAsked };
}

const bridgesOpen: ProjectStudioViewBridge[] = [];
const connectionsOpen: TatoStudioViewConnection[] = [];
afterEach(() => {
  for (const bridge of bridgesOpen.splice(0)) bridge.close();
  for (const connection of connectionsOpen.splice(0)) connection.close();
});

async function connectedView(manifest: StudioViewManifest, inputWiring: Record<string, StudioViewInputWiring>) {
  const host = recordingHostServices();
  const channel = new MessageChannel();
  const bridge = new ProjectStudioViewBridge(channel.port1, "acme-dj:deck", manifest, host.hostServices, inputWiring);
  bridgesOpen.push(bridge);
  const connecting = connectToTatoStudioOverPort(channel.port2);
  bridge.start();
  const connection = await connecting;
  connectionsOpen.push(connection);
  return { ...host, bridge, connection };
}

/** Resolves once the view has been told something on the next turn, which a MessagePort delivers on. */
function messagesDelivered(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("a project's view's connection to the studio", () => {
  it("is told what its manifest was granted as it connects", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(connection.grant).toEqual({
      view_type_id: "acme-dj:deck",
      sandboxed: true,
      contract: { major: 1, minor: 0 },
      inputs: [{ name: "deck_a", family: "channels" }],
      outputs: [{ name: "crossfader", family: "array" }],
      capabilities: ["read.selection"],
    });
  });

  it("grants a full-access view every capability, whatever its manifest lists", async () => {
    const { connection, selectionsAsked } = await connectedView(FULL_ACCESS_DJ_DECK_MANIFEST, {});
    const refusals: string[] = [];
    connection.watchStreamGraph("set", () => undefined, (because) => refusals.push(because));
    const selectAnswer = await connection.select({ kind: "nothing" });
    await messagesDelivered();

    expect(connection.grant.sandboxed).toBe(false);
    expect(connection.grant.capabilities).toEqual([...STUDIO_VIEW_CAPABILITIES]);
    expect(refusals).toEqual([]);
    expect(selectAnswer).toEqual({ kind: "done" });
    expect(selectionsAsked).toEqual([{ kind: "nothing" }]);
  });

  it("reads what every view gets and what it declared, and is refused, in words naming the capability, what it did not declare", async () => {
    const { connection, selection } = await connectedView(DJ_DECK_MANIFEST, {});
    const selectionsSeen: StudioSelection[] = [];
    const refusals: string[] = [];
    const openProjectReadings: string[] = [];
    connection.watchOpenProject((reading) => openProjectReadings.push(reading.kind));
    connection.watchSelection((seen) => selectionsSeen.push(seen));
    connection.watchStreamGraph("set", () => undefined, (because) => refusals.push(because));
    await messagesDelivered();
    selection.publish({ kind: "node", stream: "set", node: "mixer" });
    const selectAnswer = await connection.select({ kind: "nothing" });
    await messagesDelivered();

    expect(openProjectReadings).toEqual(["none_open"]);
    expect(selectionsSeen).toEqual([{ kind: "nothing" }, { kind: "node", stream: "set", node: "mixer" }]);
    expect(refusals).toEqual(["DJ Deck runs sandboxed and does not list read.stream_graph in its tatolab_view.json, so the studio does not serve it."]);
    expect(selectAnswer).toEqual({ kind: "refused", because: "DJ Deck runs sandboxed and does not list write.selection in its tatolab_view.json, so the studio does not serve it." });
  });

  it("asks the studio to select when it declared write.selection", async () => {
    const { connection, selectionsAsked } = await connectedView({ ...DJ_DECK_MANIFEST, capabilities: ["write.selection"] }, {});
    expect(await connection.select({ kind: "node", stream: "set", node: "deck_a" })).toEqual({ kind: "done" });
    expect(selectionsAsked).toEqual([{ kind: "node", stream: "set", node: "deck_a" }]);
  });

  it("reads an input from the output wired into it, says why when nothing is, and reopens it on the output wired in next", async () => {
    const { connection, bridge, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "unwired", because: "Nothing is wired into deck_a." } });
    const inputEvents: StudioViewInputEvent[] = [];
    connection.watchInput("deck_a", (inputEvent) => inputEvents.push(inputEvent));
    await messagesDelivered();
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    portViewersOpened[0]?.onEvent({ kind: "reopening", because: "the stream reloaded" });
    await messagesDelivered();
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    bridge.rewireInputs({ deck_a: { kind: "wired", target: DECK_B_TARGET, wired_from_words: "deck_b_player › audio" } });

    expect(inputEvents).toEqual([
      { kind: "unwired", because: "Nothing is wired into deck_a." },
      { kind: "reopening", because: "the stream reloaded" },
    ]);
    expect(portViewersOpened.map((opened) => [opened.target, opened.closed])).toEqual([
      [DECK_A_TARGET, true],
      [DECK_B_TARGET, false],
    ]);
  });

  it("is refused an input it did not declare, and closes the input's port viewer when it stops watching", async () => {
    const { connection, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    const refusals: string[] = [];
    connection.watchInput("deck_z", () => undefined, (because) => refusals.push(because));
    const stopWatchingDeckA = connection.watchInput("deck_a", () => undefined);
    await messagesDelivered();
    stopWatchingDeckA();
    await messagesDelivered();

    expect(refusals).toEqual(["DJ Deck declares no input named deck_z."]);
    expect(portViewersOpened.map((opened) => opened.closed)).toEqual([true]);
  });

  it("is refused an output it did not declare, and told a declared one waits on the runtime's view node", async () => {
    const { connection } = await connectedView(DJ_DECK_MANIFEST, {});
    expect(await connection.sendOutput("tempo", 0.5)).toEqual({ kind: "refused", because: "DJ Deck declares no output named tempo." });
    expect(await connection.sendOutput("crossfader", 0.42)).toEqual({
      kind: "refused",
      because: "What a view sends on crossfader reaches its stream once the runtime runs a view's node (tatolab/streamlib#3306); until then the studio holds nothing it sends.",
    });
  });

  it("stops every watch and port viewer when the studio closes the view", async () => {
    const { connection, bridge, selection, portViewersOpened } = await connectedView(DJ_DECK_MANIFEST, { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "deck_a_player › audio" } });
    const selectionsSeen: StudioSelection[] = [];
    connection.watchSelection((seen) => selectionsSeen.push(seen));
    connection.watchInput("deck_a", () => undefined);
    await messagesDelivered();
    bridge.close();
    selection.publish({ kind: "nothing" });
    selection.publish({ kind: "node", stream: "set", node: "mixer" });
    await messagesDelivered();

    expect(selectionsSeen).toEqual([{ kind: "nothing" }]);
    expect(portViewersOpened.map((opened) => opened.closed)).toEqual([true]);
  });

  it("hands an Image frame over as an ImageBitmap it transfers, closing the frame, and closes one that arrives after the view stopped watching", async () => {
    const host = recordingHostServices();
    const postedToTheView: { message: unknown; transfer: Transferable[] }[] = [];
    const listenersOfThePort: ((event: MessageEvent<unknown>) => void)[] = [];
    const portDouble = {
      postMessage: (message: unknown, transfer: Transferable[]) => {
        postedToTheView.push({ message, transfer });
      },
      addEventListener: (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
        listenersOfThePort.push(listener);
      },
      removeEventListener: () => undefined,
      start: () => undefined,
      close: () => undefined,
    };
    let bitmapsMade = 0;
    const framesClosed: string[] = [];
    const bitmapsClosed: string[] = [];
    const videoFrameNamed = (name: string) => Object.assign(Object.create(null), { timestamp: 33_000, close: () => framesClosed.push(name) });
    const imageBitmapNamed = (name: string) => Object.assign(Object.create(null), { name, close: () => bitmapsClosed.push(name) });
    const bridge = new ProjectStudioViewBridge(
      portDouble,
      "acme-dj:deck",
      { ...DJ_DECK_MANIFEST, inputs: [{ name: "deck_a", family: "image" }] },
      host.hostServices,
      { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "camera › video" } },
      async () => imageBitmapNamed(bitmapsMade++ === 0 ? "first" : "second"),
    );
    bridgesOpen.push(bridge);
    bridge.start();
    const sendFromTheView = (data: unknown) => {
      for (const listener of listenersOfThePort) listener(new MessageEvent("message", { data }));
    };
    sendFromTheView({ kind: "watch", watch_id: 1, subject: { kind: "input", input: "deck_a" } });
    host.portViewersOpened[0]?.onEvent({ kind: "image_frame", video_frame: videoFrameNamed("first"), format_wire_name: "bgra8", skipped_since_last_read: 2 });
    await messagesDelivered();
    sendFromTheView({ kind: "stop_watching", watch_id: 1 });
    host.portViewersOpened[0]?.onEvent({ kind: "image_frame", video_frame: videoFrameNamed("second"), format_wire_name: "bgra8", skipped_since_last_read: 0 });
    await messagesDelivered();

    const imageBitmapsPosted = postedToTheView.filter((posted) => posted.transfer.length > 0);
    expect(imageBitmapsPosted).toHaveLength(1);
    expect(imageBitmapsPosted[0]?.message).toMatchObject({ kind: "watched", watch_id: 1, watched: { subject: "input", reading: { kind: "image_bitmap", timestamp_microseconds: 33_000, format_wire_name: "bgra8", skipped_since_last_read: 2 } } });
    expect(framesClosed).toEqual(["first", "second"]);
    expect(bitmapsClosed).toEqual(["second"]);
  });

  it("hands a full-access view an Image frame as the VideoFrame itself, transferred with no copy", async () => {
    const host = recordingHostServices();
    const postedToTheView: { message: unknown; transfer: Transferable[] }[] = [];
    const listenersOfThePort: ((event: MessageEvent<unknown>) => void)[] = [];
    const portDouble = {
      postMessage: (message: unknown, transfer: Transferable[]) => {
        postedToTheView.push({ message, transfer });
      },
      addEventListener: (_type: string, listener: (event: MessageEvent<unknown>) => void) => {
        listenersOfThePort.push(listener);
      },
      removeEventListener: () => undefined,
      start: () => undefined,
      close: () => undefined,
    };
    const bitmapsMade: string[] = [];
    const framesClosed: string[] = [];
    const videoFrame = Object.assign(Object.create(null), { timestamp: 33_000, close: () => framesClosed.push("frame") });
    const bridge = new ProjectStudioViewBridge(
      portDouble,
      "acme-dj:deck",
      { ...FULL_ACCESS_DJ_DECK_MANIFEST, inputs: [{ name: "deck_a", family: "image" }] },
      host.hostServices,
      { deck_a: { kind: "wired", target: DECK_A_TARGET, wired_from_words: "camera › video" } },
      async () => {
        bitmapsMade.push("bitmap");
        return Object.create(null);
      },
    );
    bridgesOpen.push(bridge);
    bridge.start();
    for (const listener of listenersOfThePort) listener(new MessageEvent("message", { data: { kind: "watch", watch_id: 1, subject: { kind: "input", input: "deck_a" } } }));
    host.portViewersOpened[0]?.onEvent({ kind: "image_frame", video_frame: videoFrame, format_wire_name: "bgra8", skipped_since_last_read: 0 });

    const framesPosted = postedToTheView.filter((posted) => posted.transfer.length > 0);
    expect(framesPosted).toHaveLength(1);
    expect(framesPosted[0]?.transfer[0]).toBe(videoFrame);
    expect(framesPosted[0]?.message).toMatchObject({ kind: "watched", watch_id: 1, watched: { subject: "input", reading: { kind: "image_frame", format_wire_name: "bgra8" } } });
    expect(bitmapsMade).toEqual([]);
    expect(framesClosed).toEqual([]);
  });
});
