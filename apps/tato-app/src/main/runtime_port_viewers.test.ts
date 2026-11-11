import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import type { PortViewerEvent, PortViewerImageFrameFacts } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import type { OpenedRuntimeViewer, RuntimeViewerTarget } from "./local_api_mcp_stdio_connection.js";
import { failedWith, succeeded, type Result } from "./result.js";
import {
  PORT_VIEWER_READ_EVERY_MS,
  PORT_VIEWER_REOPEN_AFTER_MS,
  RuntimePortViewers,
  type WindowShowingPortViewers,
  type RuntimeViewerConnection,
} from "./runtime_port_viewers.js";
import type { RuntimeViewerChannelReaderOfTheAddon, RuntimeViewerImageFrame, RuntimeViewerMessageRead, SharedTextureImportOfARuntimeViewerFrame } from "./runtime_viewer_image_frame_import.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

const SILENT_TATOLAB_APP_LOG: TatolabAppLog = { error: () => undefined, warn: () => undefined, info: () => undefined, debug: () => undefined };

const CAMERA_VIDEO = { stream: "studio", node_id: "camera-id", port: "video" };

const DMA_BUF_FRAME: RuntimeViewerImageFrame = {
  heldFrameId: 3,
  width: 640,
  height: 480,
  formatWireName: "bgra32",
  electronPixelFormat: "bgra",
  bytesPerRow: 2560,
  dmaBufPlanes: [{ fd: 40, stride: 2560, offset: 0, size: 1_228_800 }],
  dmaBufModifier: "0",
  cpuReadBytes: null,
  ioSurface: null,
};

function listedStudioStream(state: string, action: string | null): ListedStream {
  return {
    stream: CAMERA_VIDEO.stream,
    display_name: "studio",
    location: null,
    state,
    node_count: state === "running" ? 2 : null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action,
    step: null,
  };
}

const NO_FAMILY_READING = { startsGroup: true, channelsBlock: null, packetsCodec: null, arrayAttributes: null, recordsJson: null, unreadableBecause: null };

function imageMessage(imageFrame: RuntimeViewerImageFrame): RuntimeViewerMessageRead {
  return { portFamily: "image", timestampNs: 1_000_000, skippedSinceLastRead: 2, imageFrame, payload: null, ...NO_FAMILY_READING };
}

class FakeChannelReader implements RuntimeViewerChannelReaderOfTheAddon {
  readonly messagesToRead: (RuntimeViewerMessageRead | null | Error)[] = [];
  readonly releasedHeldFrameIds: number[] = [];
  closed = false;

  readLatestMessage(): Promise<RuntimeViewerMessageRead | null> {
    const next = this.messagesToRead.shift() ?? null;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }

  releaseHeldImageFrame(heldFrameId: number): void {
    this.releasedHeldFrameIds.push(heldFrameId);
  }

  close(): void {
    this.closed = true;
  }
}

class FakeViewerConnection implements RuntimeViewerConnection {
  readonly openedTargets: RuntimeViewerTarget[] = [];
  readonly closedViewers: string[] = [];
  openRefusal: string | null = null;
  private open = true;
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];

  openViewer(target: RuntimeViewerTarget): Promise<Result<OpenedRuntimeViewer, LocalApiRequestFailure>> {
    this.openedTargets.push(target);
    if (this.openRefusal !== null) return Promise.resolve(failedWith({ failureDescription: this.openRefusal, isTheRuntimesRefusal: true }));
    return Promise.resolve(
      succeeded({
        viewer: `${target.stream}/${target.node_id}/${target.port}`,
        stream: target.stream,
        node_id: target.node_id,
        node_name: target.node_id.replace(/-id$/, ""),
        port: target.port,
        iceoryx2_domain_root: "/tmp/tatolab/iceoryx2",
        channel: `${target.stream}/${target.node_id}/${target.port}`,
        surface_share_address: "/tmp/tatolab/surface-share.sock",
      }),
    );
  }

  closeViewer(viewer: string): Promise<Result<string, LocalApiRequestFailure>> {
    this.closedViewers.push(viewer);
    return Promise.resolve(succeeded(viewer));
  }

  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.closedListeners.push(whenTheConnectionCloses);
  }

  isOpen(): boolean {
    return this.open;
  }

  close(): void {
    this.open = false;
  }

  dropByTheRuntime(whyItClosed: string): void {
    this.open = false;
    for (const listener of this.closedListeners) listener(whyItClosed);
  }
}

class FakeWindowShowingPortViewers implements WindowShowingPortViewers {
  readonly portViewerEvents: PortViewerEvent[] = [];
  readonly imageFramesReceived: { imageFrame: SharedTextureImportOfARuntimeViewerFrame; frameFacts: PortViewerImageFrameFacts; letGo: () => void }[] = [];

  sendTheWindowAPortViewerEvent(event: PortViewerEvent): void {
    this.portViewerEvents.push(event);
  }

  sendTheWindowAnImageFrame(imageFrame: SharedTextureImportOfARuntimeViewerFrame, frameFacts: PortViewerImageFrameFacts, whenTheWindowLetsGo: () => void): Promise<Result<void, string>> {
    this.imageFramesReceived.push({ imageFrame, frameFacts, letGo: whenTheWindowLetsGo });
    return Promise.resolve(succeeded(undefined));
  }
}

function harness() {
  const connections: FakeViewerConnection[] = [];
  const channelReaders: FakeChannelReader[] = [];
  const repeatingTicks: { everyMs: number; tick: () => void; stopped: boolean }[] = [];
  const waits: { afterMs: number; then: () => void }[] = [];
  let addonRefusal: string | null = null;
  const streamStatesTheRuntimeLists = new Map([[CAMERA_VIDEO.stream, "running"]]);
  const runtimePortViewers = new RuntimePortViewers({
    openTheViewerConnection: () => {
      const connection = new FakeViewerConnection();
      connections.push(connection);
      return Promise.resolve(succeeded(connection));
    },
    openAChannelReader: () => {
      if (addonRefusal !== null) return failedWith(addonRefusal);
      const channelReader = new FakeChannelReader();
      channelReaders.push(channelReader);
      return succeeded(channelReader);
    },
    viewerProcessId: 4242,
    repeatEvery: (everyMs, tick) => {
      const repeating = { everyMs, tick, stopped: false };
      repeatingTicks.push(repeating);
      return () => {
        repeating.stopped = true;
      };
    },
    waitThen: (afterMs, then) => waits.push({ afterMs, then }),
    streamStateTheRuntimeListsNow: (stream) => streamStatesTheRuntimeLists.get(stream) ?? null,
    tatolabAppLog: SILENT_TATOLAB_APP_LOG,
  });
  const tickAndSettle = async () => {
    for (const repeating of repeatingTicks) if (!repeating.stopped) repeating.tick();
    await new Promise((settle) => setImmediate(settle));
  };
  return {
    runtimePortViewers,
    connections,
    channelReaders,
    repeatingTicks,
    waits,
    tickAndSettle,
    refuseInTheAddon: (refusal: string) => {
      addonRefusal = refusal;
    },
    streamStatesTheRuntimeLists,
  };
}

test("a_port_viewer_opens_a_runtime_viewer_as_the_main_process_and_reads_it_every_display_frame", async () => {
  const { runtimePortViewers, connections, repeatingTicks } = harness();

  const opened = await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());

  expect(opened).toEqual({ ok: true, value: { port_viewer: "port-viewer-1" } });
  expect(connections[0]?.openedTargets).toEqual([{ ...CAMERA_VIDEO, viewer_process_id: 4242 }]);
  expect(repeatingTicks.map((repeating) => repeating.everyMs)).toEqual([PORT_VIEWER_READ_EVERY_MS]);
});

test("two_windows_viewing_one_port_share_one_runtime_viewer_and_one_connection", async () => {
  const { runtimePortViewers, connections, channelReaders } = harness();

  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());
  await runtimePortViewers.openAPortViewer({ ...CAMERA_VIDEO, port: "depth" }, new FakeWindowShowingPortViewers());

  expect(connections).toHaveLength(1);
  expect(connections[0]?.openedTargets.map((target) => target.port)).toEqual(["video", "depth"]);
  expect(channelReaders).toHaveLength(2);
});

test("an_image_frame_reaches_every_window_and_is_released_once_the_last_lets_go", async () => {
  const { runtimePortViewers, channelReaders, tickAndSettle } = harness();
  const firstWindow = new FakeWindowShowingPortViewers();
  const secondWindow = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, firstWindow);
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, secondWindow);
  const channelReader = channelReaders[0];
  channelReader?.messagesToRead.push(imageMessage(DMA_BUF_FRAME));

  await tickAndSettle();

  expect(firstWindow.imageFramesReceived[0]?.frameFacts).toEqual({ port_viewer: "port-viewer-1", format_wire_name: "bgra32", skipped_since_last_read: 2 });
  expect(secondWindow.imageFramesReceived[0]?.imageFrame.codedSize).toEqual({ width: 640, height: 480 });
  firstWindow.imageFramesReceived[0]?.letGo();
  expect(channelReader?.releasedHeldFrameIds).toEqual([]);
  secondWindow.imageFramesReceived[0]?.letGo();
  expect(channelReader?.releasedHeldFrameIds).toEqual([3]);
});

test("a_frame_that_crossed_as_cpu_memory_reaches_the_window_as_its_pixels_and_is_released_at_once", async () => {
  const { runtimePortViewers, channelReaders, tickAndSettle } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  const cpuReadBytes = Buffer.from([9, 8, 7, 6]);
  channelReaders[0]?.messagesToRead.push(imageMessage({ ...DMA_BUF_FRAME, dmaBufPlanes: null, dmaBufModifier: null, cpuReadBytes }));

  await tickAndSettle();

  expect(windowShowingPortViewers.portViewerEvents).toEqual([
    {
      port_viewer: "port-viewer-1",
      kind: "image_pixels",
      width: 640,
      height: 480,
      format_wire_name: "bgra32",
      bytes_per_row: 2560,
      pixels: new Uint8Array([9, 8, 7, 6]),
      skipped_since_last_read: 2,
    },
  ]);
  expect(channelReaders[0]?.releasedHeldFrameIds).toEqual([3]);
});

test("a_frame_electron_cannot_import_and_that_has_no_pixels_ends_the_port_viewer_saying_why", async () => {
  const { runtimePortViewers, channelReaders, tickAndSettle } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  channelReaders[0]?.messagesToRead.push(imageMessage({ ...DMA_BUF_FRAME, formatWireName: "rgba64", electronPixelFormat: null }));

  await tickAndSettle();

  expect(windowShowingPortViewers.portViewerEvents).toEqual([{ port_viewer: "port-viewer-1", kind: "ended", because: "Electron cannot import a rgba64 frame as a shared texture" }]);
  expect(channelReaders[0]?.closed).toBe(true);
});

test("a_message_of_another_family_reaches_the_window_read_by_its_family", async () => {
  const { runtimePortViewers, channelReaders, tickAndSettle } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  channelReaders[0]?.messagesToRead.push({ portFamily: "records", timestampNs: 5, skippedSinceLastRead: 0, imageFrame: null, payload: Buffer.alloc(48), ...NO_FAMILY_READING, recordsJson: '{"label":"face"}' });

  await tickAndSettle();

  expect(windowShowingPortViewers.portViewerEvents).toEqual([
    { port_viewer: "port-viewer-1", kind: "message", reading: { family: "records", record: { label: "face" } }, skipped_since_last_read: 0 },
  ]);
});

test("the_runtimes_refusal_to_open_a_viewer_is_answered_in_its_own_words", async () => {
  const { runtimePortViewers, connections } = harness();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());
  const connection = connections[0];
  if (connection === undefined) throw new Error("the connection was not opened");
  connection.openRefusal = "no node named `mic` in stream `studio`";

  const refused = await runtimePortViewers.openAPortViewer({ ...CAMERA_VIDEO, node_id: "mic-id" }, new FakeWindowShowingPortViewers());

  expect(refused).toEqual({ ok: false, failure: "no node named `mic` in stream `studio`" });
});

test("a_port_viewer_opened_before_its_stream_runs_waits_saying_why_and_opens_once_the_stream_runs", async () => {
  const { runtimePortViewers, connections, channelReaders, waits, streamStatesTheRuntimeLists } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  runtimePortViewers.closeThePortViewersOf(windowShowingPortViewers);
  const connection = connections[0];
  if (connection === undefined) throw new Error("the connection was not opened");
  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "preparing");
  const notRunningYet = "Link error: node `camera-id` (camera) of the stream `studio` is not running, so its port `video` writes nothing yet";
  connection.openRefusal = notRunningYet;

  const waiting = await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);

  expect(waiting).toEqual(succeeded({ port_viewer: "port-viewer-2" }));
  expect(waits.map((wait) => wait.afterMs)).toEqual([PORT_VIEWER_REOPEN_AFTER_MS]);
  waits[0]?.then();
  await new Promise((settle) => setImmediate(settle));
  expect(windowShowingPortViewers.portViewerEvents).toEqual([{ port_viewer: "port-viewer-2", kind: "reopening", because: notRunningYet }]);
  expect(waits).toHaveLength(2);

  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "running");
  connection.openRefusal = null;
  waits[1]?.then();
  await new Promise((settle) => setImmediate(settle));

  expect(channelReaders).toHaveLength(2);
  expect(channelReaders[1]?.closed).toBe(false);
  expect(waits).toHaveLength(2);
});

test("a_viewer_on_a_failed_stream_is_refused_in_the_runtimes_words_rather_than_waited_out", async () => {
  const { runtimePortViewers, connections, waits, streamStatesTheRuntimeLists } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  runtimePortViewers.closeThePortViewersOf(windowShowingPortViewers);
  const connection = connections[0];
  if (connection === undefined) throw new Error("the connection was not opened");
  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "failed");
  connection.openRefusal = "node `camera-id` is not running";

  expect(await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers)).toEqual({ ok: false, failure: "node `camera-id` is not running" });
  expect(waits).toEqual([]);
});

test("two_windows_waiting_for_one_ports_stream_share_one_wait", async () => {
  const { runtimePortViewers, connections, waits, streamStatesTheRuntimeLists } = harness();
  const firstWindow = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, firstWindow);
  runtimePortViewers.closeThePortViewersOf(firstWindow);
  const connection = connections[0];
  if (connection === undefined) throw new Error("the connection was not opened");
  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "stopped");
  connection.openRefusal = "node `camera-id` is not running";
  const secondWindow = new FakeWindowShowingPortViewers();

  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, firstWindow);
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, secondWindow);
  expect(waits).toHaveLength(1);
  waits[0]?.then();
  await new Promise((settle) => setImmediate(settle));

  expect(firstWindow.portViewerEvents).toEqual([{ port_viewer: "port-viewer-2", kind: "reopening", because: "node `camera-id` is not running" }]);
  expect(secondWindow.portViewerEvents).toEqual([{ port_viewer: "port-viewer-3", kind: "reopening", because: "node `camera-id` is not running" }]);
  expect(waits).toHaveLength(2);
});

test("a_refusal_on_a_stream_that_is_not_running_from_the_addon_is_not_waited_out", async () => {
  const { runtimePortViewers, waits, refuseInTheAddon, streamStatesTheRuntimeLists } = harness();
  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "preparing");
  refuseInTheAddon("this build carries no viewer addon");

  const refused = await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());

  expect(refused).toEqual({ ok: false, failure: "this build carries no viewer addon" });
  expect(waits).toEqual([]);
});

test("a_port_viewer_waiting_for_its_stream_stops_waiting_when_its_window_closes_it", async () => {
  const { runtimePortViewers, connections, waits, streamStatesTheRuntimeLists } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  runtimePortViewers.closeThePortViewersOf(windowShowingPortViewers);
  const connection = connections[0];
  if (connection === undefined) throw new Error("the connection was not opened");
  streamStatesTheRuntimeLists.set(CAMERA_VIDEO.stream, "preparing");
  connection.openRefusal = "node `camera-id` is not running";
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  const opensAskedBeforeClosing = connection.openedTargets.length;

  runtimePortViewers.closeThePortViewersOf(windowShowingPortViewers);
  waits[0]?.then();
  await new Promise((settle) => setImmediate(settle));

  expect(connection.openedTargets).toHaveLength(opensAskedBeforeClosing);
  expect(waits).toHaveLength(1);
});

test("the_addons_refusal_closes_the_runtime_viewer_it_could_not_read", async () => {
  const { runtimePortViewers, connections, refuseInTheAddon } = harness();
  refuseInTheAddon('the viewer could not subscribe to studio/camera-id/video: ChannelNotOpen("studio/camera-id/video")');

  const refused = await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());

  expect(refused.ok).toBe(false);
  expect(connections[0]?.closedViewers).toEqual(["studio/camera-id/video"]);
});

test("the_runtime_viewer_closes_when_its_last_window_closes", async () => {
  const { runtimePortViewers, connections, channelReaders, repeatingTicks } = harness();
  const firstWindow = new FakeWindowShowingPortViewers();
  const secondWindow = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, firstWindow);
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, secondWindow);

  runtimePortViewers.closeThePortViewersOf(firstWindow);
  expect(connections[0]?.closedViewers).toEqual([]);
  runtimePortViewers.closeThePortViewersOf(secondWindow);

  expect(connections[0]?.closedViewers).toEqual(["studio/camera-id/video"]);
  expect(channelReaders[0]?.closed).toBe(true);
  expect(repeatingTicks[0]?.stopped).toBe(true);
});

test("a_dropped_connection_tells_the_windows_and_reopens_their_port_on_a_new_one", async () => {
  const { runtimePortViewers, connections, channelReaders, waits } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);

  connections[0]?.dropByTheRuntime("the runtime stopped");

  expect(windowShowingPortViewers.portViewerEvents).toEqual([{ port_viewer: "port-viewer-1", kind: "reopening", because: "the runtime stopped" }]);
  expect(channelReaders[0]?.closed).toBe(true);
  expect(waits.map((wait) => wait.afterMs)).toEqual([PORT_VIEWER_REOPEN_AFTER_MS]);
  waits[0]?.then();
  await new Promise((settle) => setImmediate(settle));

  expect(connections).toHaveLength(2);
  expect(connections[1]?.openedTargets).toEqual([{ ...CAMERA_VIDEO, viewer_process_id: 4242 }]);
  expect(channelReaders).toHaveLength(2);
});

test("a_reload_of_the_stream_reopens_its_port_once_the_runtime_lists_it_without_the_stream_action", async () => {
  const { runtimePortViewers, connections, channelReaders, waits } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);

  runtimePortViewers.noticeStatus({ streams: [listedStudioStream("preparing", "action-reload")] });
  expect(waits).toHaveLength(0);
  runtimePortViewers.noticeStatus({ streams: [listedStudioStream("running", null)] });

  expect(windowShowingPortViewers.portViewerEvents).toEqual([
    { port_viewer: "port-viewer-1", kind: "reopening", because: "camera › video was replaced as its project loaded again." },
  ]);
  expect(channelReaders[0]?.closed).toBe(true);
  expect(connections[0]?.closedViewers).toEqual(["studio/camera-id/video"]);
  waits[0]?.then();
  await new Promise((settle) => setImmediate(settle));

  expect(connections[0]?.openedTargets).toHaveLength(2);
  expect(channelReaders).toHaveLength(2);
});

test("a_stream_listed_running_throughout_keeps_its_runtime_viewer", async () => {
  const { runtimePortViewers, channelReaders, waits } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);

  runtimePortViewers.noticeStatus({ streams: [listedStudioStream("running", null)] });
  runtimePortViewers.noticeStatus({ streams: null });
  runtimePortViewers.noticeStatus({ streams: [listedStudioStream("running", null)] });

  expect(windowShowingPortViewers.portViewerEvents).toEqual([]);
  expect(channelReaders[0]?.closed).toBe(false);
  expect(waits).toHaveLength(0);
});

test("a_failed_read_ends_every_port_viewer_of_that_port", async () => {
  const { runtimePortViewers, channelReaders, tickAndSettle } = harness();
  const windowShowingPortViewers = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, windowShowingPortViewers);
  channelReaders[0]?.messagesToRead.push(new Error("the channel's publisher went away"));

  await tickAndSettle();

  expect(windowShowingPortViewers.portViewerEvents).toEqual([
    { port_viewer: "port-viewer-1", kind: "ended", because: "The viewer stopped reading camera › video: the channel's publisher went away" },
  ]);
});

test("quitting_closes_every_port_viewer_and_the_connection", async () => {
  const { runtimePortViewers, connections } = harness();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, new FakeWindowShowingPortViewers());

  runtimePortViewers.closeEveryPortViewer();

  expect(connections[0]?.closedViewers).toEqual(["studio/camera-id/video"]);
  expect(connections[0]?.isOpen()).toBe(false);
});

test("a_window_closes_only_the_port_viewers_it_opened", async () => {
  const { runtimePortViewers, connections } = harness();
  const firstWindow = new FakeWindowShowingPortViewers();
  const secondWindow = new FakeWindowShowingPortViewers();
  await runtimePortViewers.openAPortViewer(CAMERA_VIDEO, firstWindow);

  runtimePortViewers.closeAPortViewer("port-viewer-1", secondWindow);
  expect(connections[0]?.closedViewers).toEqual([]);
  runtimePortViewers.closeAPortViewer("port-viewer-1", firstWindow);

  expect(connections[0]?.closedViewers).toEqual(["studio/camera-id/video"]);
});
