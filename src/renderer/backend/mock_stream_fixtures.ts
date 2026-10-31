import type { ListedStream, StreamGraphDeclaredPort, StreamGraphLink, StreamLocation, ProjectLogRecord, TatolabPlatform } from "../../shared/tatolab_backend_contract";

function fnv1aHashOf(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/** A stable runtime-looking id for the node `nodeName` of the stream `streamId`, such as `P0kq3…`, which its graph and its log records both name it by. */
export function mockNodeIdOf(streamId: string, nodeName: string): string {
  const name = `${streamId}/${nodeName}`;
  return `P${fnv1aHashOf(name).toString(36).padStart(7, "0")}${name.length.toString(36)}mockgraph`.slice(0, 26);
}

/** A part of a stream id as the runtime casts one: lower case, each run of other characters one `-`, none at either end. */
function castAsAStreamIdPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The stream id the runtime computes from a location, `<folder>-<function>-<hash>`, with a stand-in hash over the path
 * with its home folder written `~`, so two folders give two ids and a mock stream has the same id on both platforms.
 */
export function mockStreamIdOf(location: StreamLocation): string {
  const folder = castAsAStreamIdPart(location.project_directory.split("/").filter((segment) => segment !== "").at(-1) ?? "");
  const functionName = castAsAStreamIdPart(location.stream_function.split(":").at(-1) ?? "");
  const projectDirectoryUnderHome = location.project_directory.replace(/^\/(Users|home)\/[^/]+/, "~");
  const hash = fnv1aHashOf(`${projectDirectoryUnderHome}\n${location.stream_function}`).toString(16).padStart(8, "0").slice(0, 6);
  return [folder, functionName, hash].filter((part) => part !== "").join("-");
}

/** A stream listed running, its graph loaded with `nodeCount` nodes, under the id its location computes to. */
function runningListing(location: StreamLocation, displayName: string, nodeCount: number): ListedStream {
  return { stream: mockStreamIdOf(location), display_name: displayName, location, state: "running", node_count: nodeCount, failed_because: null, capture_devices_whose_access_was_never_asked_for: [], action: null, step: null };
}

/** A log record before the mock runtime numbers and stamps it. */
export interface MockLogRecordDraft {
  millisecondsAfterLoad: number;
  source: "rust" | "python";
  level: "trace" | "debug" | "info" | "warn" | "error";
  target: string;
  message: string;
  attrs?: Record<string, string>;
  /** The step that wrote it, by name; absent for a record the runtime wrote for the stream outside any step. */
  node?: string;
}

/** What a mock stream writes on one tick of the live log, given how long it has been loaded. */
export type MockLiveLogWriter = (millisecondsSinceLoad: number) => MockLogRecordDraft[];

/** A node of a mock stream's graph, as the runtime's `graph` names it, with the config and ports it renders. */
export interface MockGraphNode {
  name: string;
  type: string;
  state: string;
  config: Record<string, string | number | boolean>;
  input_ports: StreamGraphDeclaredPort[];
  output_ports: StreamGraphDeclaredPort[];
}

/** Ports declaring no catalog entry, as every input and a raw output do. */
const uncataloguedPorts = (...portNames: string[]): StreamGraphDeclaredPort[] => portNames.map((name) => ({ name, catalog_section: null }));

/** An output port a mock stream exposes, at `internal`, `private` or `public`. */
export interface MockExposedPort {
  node: string;
  port: string;
  level: string;
}

/** How fast a mock stream's counters climb while it runs: messages a link's target drops, and messages an output refuses, each second. */
export interface MockCounterRates {
  droppedPerSecondByLinkId: Record<string, number>;
  refusedPerSecondByOutput: { node: string; port: string; perSecond: number }[];
}

/** A mock stream's graph as the runtime holds it; the mock renders the `graph` document and its summary from it. */
export interface MockStreamGraph {
  nodes: MockGraphNode[];
  links: StreamGraphLink[];
  exposed: MockExposedPort[];
  counterRates: MockCounterRates;
}

const NO_COUNTERS_CLIMB: MockCounterRates = { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] };

/** A stream the mock runtime loads, with its graph and the log it writes. */
export interface MockStreamFixture {
  listing: ListedStream;
  /** The graph while loaded; its nodes start `Pending` and their links `pending` until the stream settles. */
  graph: MockStreamGraph;
  startupLog: MockLogRecordDraft[];
  createLiveLogWriter: () => MockLiveLogWriter;
  /** How long it has been loaded when the window opens. */
  loadedForMillisecondsAtOpen: number;
}

/** The machine the mock runtime runs on: its name and home, and the lines only its platform logs. */
export interface MockMachine {
  /** A hostname cast as the runtime casts one. */
  name: string;
  homeDirectory: string;
  commandLineToolLinkedAt: string;
  /** Where the mock runtime serves its local API. */
  localApiSocket: string;
  /** The folder the mock runtime writes its own log to, under its state directory. */
  runtimeLogDirectory: string;
  vulkanLoaderLibrary: string;
  vulkanDeviceSelectedMessage: string;
  cameraOpenedAttrs: Record<string, string>;
  microphoneDevice: string;
  cameraFailure: string;
}

const MOCK_MACHINES: Record<TatolabPlatform, MockMachine> = {
  macos: {
    name: "jonathanf-macbook",
    homeDirectory: "/Users/jonathanf",
    commandLineToolLinkedAt: "/Users/jonathanf/.local/bin/tatolab",
    localApiSocket: "/tmp/streamlib-501/local-api.sock",
    runtimeLogDirectory: "/Users/jonathanf/Library/Application Support/Tatolab/logs",
    vulkanLoaderLibrary: "/Applications/Tatolab.app/Contents/Frameworks/tatolab-runtime/_vulkan_driver/libvulkan.1.dylib",
    vulkanDeviceSelectedMessage: "Selected Vulkan device: Apple M1 Max (type: Integrated GPU)",
    cameraOpenedAttrs: { device: "FaceTime HD Camera", format: "1920x1080 nv12" },
    microphoneDevice: "MacBook Pro Microphone",
    cameraFailure:
      "the stream's CameraSource could not open camera 0x1420000: camera access is denied for Tatolab — allow it in System Settings › Privacy & Security › Camera",
  },
  linux: {
    name: "jonathanf-workstation",
    homeDirectory: "/home/jonathanf",
    commandLineToolLinkedAt: "/home/jonathanf/.local/bin/tatolab",
    localApiSocket: "/run/user/1000/streamlib/local-api.sock",
    runtimeLogDirectory: "/home/jonathanf/.local/state/tatolab/logs",
    vulkanLoaderLibrary: "/usr/lib/x86_64-linux-gnu/libvulkan.so.1",
    vulkanDeviceSelectedMessage: "Selected Vulkan device: NVIDIA GeForce RTX 4090 (type: Discrete GPU)",
    cameraOpenedAttrs: { device: "/dev/video0", format: "1920x1080 yuyv" },
    microphoneDevice: "alsa_input.usb-Blue_Yeti",
    cameraFailure:
      "the stream's CameraSource could not open camera /dev/video0: permission denied — add your user to the video group, then log in again",
  },
};

const PYTHON_HELPER_TARGET = "streamlib::polyglot::python";
const LOADED_STREAM_TARGET = "streamlib_engine::core::runtime::loaded_stream";
const SPAWN_HOST_TARGET = "streamlib_engine::core::compiler::compiler_ops::processor_interpreter_spawn_host";
const GPU_CONTEXT_TARGET = "streamlib_engine::core::context::gpu_context";
const VULKAN_DEVICE_TARGET = "streamlib_engine::vulkan::rhi::vulkan_device";
const ESCALATE_RATE_WARNING =
  "sustained GpuContextLimitedAccess::escalate rate on this thread — processor likely needs more pre-reservation in setup()";

/** The times, since load, a record written every `everyMilliseconds` fell due since the last tick. */
function cadence(everyMilliseconds: number, firstAfterMilliseconds: number): (millisecondsSinceLoad: number) => number[] {
  let nextDueAt = firstAfterMilliseconds;
  return (millisecondsSinceLoad) => {
    const dueTimes: number[] = [];
    while (nextDueAt <= millisecondsSinceLoad) {
      dueTimes.push(nextDueAt);
      nextDueAt += everyMilliseconds;
    }
    return dueTimes;
  };
}

/** The times, since load, a one-off record fell due since the last tick. */
function once(atMilliseconds: number): (millisecondsSinceLoad: number) => number[] {
  let hasFallenDue = false;
  return (millisecondsSinceLoad) => {
    if (hasFallenDue || millisecondsSinceLoad < atMilliseconds) return [];
    hasFallenDue = true;
    return [atMilliseconds];
  };
}

function loadingLines(machine: MockMachine, streamId: string, projectDirectory: string): MockLogRecordDraft[] {
  return [
    { millisecondsAfterLoad: 0, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `Loading the stream \`${streamId}\` from ${projectDirectory}` },
    {
      millisecondsAfterLoad: 113,
      source: "rust",
      level: "info",
      target: "streamlib_consumer_rhi::vulkan_loader_library",
      message: "Vulkan loader library opened",
      attrs: { vulkan_loader_library: machine.vulkanLoaderLibrary },
    },
    { millisecondsAfterLoad: 146, source: "rust", level: "info", target: VULKAN_DEVICE_TARGET, message: machine.vulkanDeviceSelectedMessage },
  ];
}

const TEST_PATTERN_NODES: MockGraphNode[] = [
  {
    name: "testpatternsource",
    type: "tatolab.stream:TestPatternSource",
    state: "Running",
    config: { width: 1280, height: 720, fps: 30 },
    input_ports: [],
    output_ports: [{ name: "video", catalog_section: "binary" }],
  },
  {
    name: "invertingeffect",
    type: "nodes.inverting_effect:InvertingEffect",
    state: "Running",
    config: {},
    input_ports: uncataloguedPorts("video_from_upstream"),
    output_ports: uncataloguedPorts("video_to_downstream"),
  },
  {
    name: "displaywindow",
    type: "tatolab.stream:DisplayWindow",
    state: "Running",
    config: { title: "Tatolab", scaling: "fit" },
    input_ports: uncataloguedPorts("video"),
    output_ports: [],
  },
  {
    name: "brightnessmeter",
    type: "nodes.brightness_meter:BrightnessMeter",
    state: "Running",
    config: {},
    input_ports: uncataloguedPorts("video_from_upstream"),
    output_ports: [],
  },
];

const TEST_PATTERN_LINKS: StreamGraphLink[] = [
  {
    id: "Lj17fu4mdczivji99oua37i06",
    source_node: "testpatternsource",
    source_port: "video",
    target_node: "invertingeffect",
    target_port: "video_from_upstream",
    state: "wired",
  },
  { id: "Lv5ujotcx5rnh9f4s6xewjot9", source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "displaywindow", target_port: "video", state: "wired" },
  {
    id: "Lizkqmkmmu5ldam8dbymcc4bc",
    source_node: "invertingeffect",
    source_port: "video_to_downstream",
    target_node: "brightnessmeter",
    target_port: "video_from_upstream",
    state: "wired",
  },
];

/** An MP4 recorder of `main`'s exposed effect output, read across streams. */
const RECORDER_OF_MAIN_NODE: MockGraphNode = {
  name: "mp4writer",
  type: "tatolab.stream:Mp4Writer",
  state: "Running",
  config: { path: "recordings/main.mp4" },
  input_ports: uncataloguedPorts("video"),
  output_ports: [],
};

/** The recorder's link from `main`'s effect, its source named `<stream id>/<node>` as a link from another stream is. */
function recorderOfMainLink(mainStreamId: string): StreamGraphLink {
  return {
    id: "Lr3c0rd3rm41nx7q2w9e5t1y8u",
    source_node: `${mainStreamId}/invertingeffect`,
    source_port: "video_to_downstream",
    target_node: "mp4writer",
    target_port: "video",
    state: "wired",
  };
}

/** The test pattern's meter falling behind: its link drops frames and the effect's output refuses a few. */
const TEST_PATTERN_METER_FALLING_BEHIND: MockCounterRates = {
  droppedPerSecondByLinkId: { Lizkqmkmmu5ldam8dbymcc4bc: 9 },
  refusedPerSecondByOutput: [{ node: "invertingeffect", port: "video_to_downstream", perSecond: 2 }],
};

/** `tatolab new --test-pattern`'s stream function `streamFunction` in `projectDirectory`, shown as `displayName`: the scaffold's four nodes, two of them Python. */
function createTestPatternStream(
  machine: MockMachine,
  options: {
    projectDirectory: string;
    /** As `module:qualname`, which the stream's id is computed from. */
    streamFunction: string;
    displayName: string;
    exposesItsEffect: boolean;
    withDisplayWindowInError: boolean;
    withTheMeterFallingBehind: boolean;
    /** The id of the stream a recorder reads the exposed effect output of, a link whose source is in another stream; `null` for none. */
    recordsTheStream: string | null;
  },
): MockStreamFixture {
  const { projectDirectory, recordsTheStream } = options;
  const listing = runningListing({ project_directory: projectDirectory, stream_function: options.streamFunction }, options.displayName, recordsTheStream === null ? 4 : 5);
  const streamId = listing.stream;
  const brightness = (dueAt: number): MockLogRecordDraft => ({
    millisecondsAfterLoad: dueAt,
    source: "python",
    level: "info",
    target: PYTHON_HELPER_TARGET,
    message: "brightness",
    attrs: { height: "720", mean: "127.5", width: "1280" },
    node: "brightnessmeter",
  });
  return {
    listing,
    graph: {
      nodes: [
        ...TEST_PATTERN_NODES.map((node) => (options.withDisplayWindowInError && node.name === "displaywindow" ? { ...node, state: "Error" } : node)),
        ...(recordsTheStream === null ? [] : [RECORDER_OF_MAIN_NODE]),
      ],
      links: [
        ...TEST_PATTERN_LINKS.map((link) => (options.withDisplayWindowInError && link.target_node === "displaywindow" ? { ...link, state: "error" } : link)),
        ...(recordsTheStream === null ? [] : [recorderOfMainLink(recordsTheStream)]),
      ],
      exposed: options.exposesItsEffect ? [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }] : [],
      counterRates: options.withTheMeterFallingBehind ? TEST_PATTERN_METER_FALLING_BEHIND : NO_COUNTERS_CLIMB,
    },
    startupLog: [
      ...loadingLines(machine, streamId, projectDirectory),
      {
        millisecondsAfterLoad: 399,
        source: "rust",
        level: "info",
        target: SPAWN_HOST_TARGET,
        message: "[brightnessmeter] helper process started: pid=65123, entrypoint=nodes.brightness_meter:BrightnessMeter",
      },
      ...(options.withDisplayWindowInError
        ? [
            {
              millisecondsAfterLoad: 784,
              source: "rust",
              level: "error",
              target: "streamlib_media_builtins::display_window",
              message: "DisplayWindow: no window — running degraded (frames drained, nothing shown)",
              node: "displaywindow",
            } satisfies MockLogRecordDraft,
          ]
        : []),
    ],
    createLiveLogWriter: () => {
      const brightnessReportsDue = cadence(1001, 1493);
      const escalateWarningDue = once(2772);
      const brightnessReadFailureDue = recordsTheStream === null && !options.withDisplayWindowInError ? once(4120) : once(Number.POSITIVE_INFINITY);
      return (millisecondsSinceLoad) => [
        ...brightnessReportsDue(millisecondsSinceLoad).map(brightness),
        ...escalateWarningDue(millisecondsSinceLoad).map(
          (dueAt): MockLogRecordDraft => ({
            millisecondsAfterLoad: dueAt,
            source: "rust",
            level: "warn",
            target: GPU_CONTEXT_TARGET,
            message: ESCALATE_RATE_WARNING,
            attrs: { escalations_last_second: "24", thread: "br-esc-Pjbpw35x" },
          }),
        ),
        ...brightnessReadFailureDue(millisecondsSinceLoad).map(
          (dueAt): MockLogRecordDraft => ({
            millisecondsAfterLoad: dueAt,
            source: "python",
            level: "error",
            target: PYTHON_HELPER_TARGET,
            message: "brightness read skipped",
            attrs: { reason: "frame.cpu() timed out after 50 ms; the frame was recycled upstream" },
            node: "brightnessmeter",
          }),
        ),
      ];
    },
    loadedForMillisecondsAtOpen: recordsTheStream === null ? 6200 : 3900,
  };
}

/** A camera and a microphone, each watched and metered, loaded with `tatolab run --name camera`. */
function createCameraStream(machine: MockMachine): MockStreamFixture {
  const projectDirectory = `${machine.homeDirectory}/streams/camera`;
  const listing = runningListing({ project_directory: projectDirectory, stream_function: "stream:main" }, "camera", 4);
  return {
    listing,
    graph: {
      nodes: [
        {
          name: "camerasource",
          type: "tatolab.stream:CameraSource",
          state: "Running",
          config: { device_id: "0", width: 1920, height: 1080 },
          input_ports: [],
          output_ports: [{ name: "video", catalog_section: "binary" }],
        },
        {
          name: "microphonesource",
          type: "tatolab.stream:MicrophoneSource",
          state: "Running",
          config: { sample_rate: 48000 },
          input_ports: [],
          output_ports: [{ name: "audio", catalog_section: "audio" }],
        },
        {
          name: "displaywindow",
          type: "tatolab.stream:DisplayWindow",
          state: "Running",
          config: { title: "Camera", scaling: "fit" },
          input_ports: uncataloguedPorts("video"),
          output_ports: [],
        },
        {
          name: "levelmeter",
          type: "nodes.level_meter:LevelMeter",
          state: "Running",
          config: {},
          input_ports: uncataloguedPorts("audio_from_upstream"),
          output_ports: [],
        },
      ],
      links: [
        { id: "Lc8m2w0d1k4q9s7f3x5v6b2nr", source_node: "camerasource", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" },
        {
          id: "Lm4t7y1u3i9o0p2a5s8d6f1gh",
          source_node: "microphonesource",
          source_port: "audio",
          target_node: "levelmeter",
          target_port: "audio_from_upstream",
          state: "wired",
        },
      ],
      exposed: [
        { node: "camerasource", port: "video", level: "private" },
        { node: "microphonesource", port: "audio", level: "public" },
      ],
      counterRates: NO_COUNTERS_CLIMB,
    },
    startupLog: [
      { millisecondsAfterLoad: 0, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `Loading the stream \`${listing.stream}\` from ${projectDirectory}` },
      { millisecondsAfterLoad: 382, source: "rust", level: "info", target: "streamlib_media_builtins::camera_source", message: "Camera opened", attrs: machine.cameraOpenedAttrs, node: "camerasource" },
      {
        millisecondsAfterLoad: 396,
        source: "rust",
        level: "info",
        target: "streamlib_media_builtins::microphone_source",
        message: "Microphone opened",
        attrs: { channels: "1", device: machine.microphoneDevice, sample_rate: "48000" },
        node: "microphonesource",
      },
      { millisecondsAfterLoad: 944, source: "rust", level: "info", target: SPAWN_HOST_TARGET, message: "[levelmeter] helper process started: pid=64410, entrypoint=nodes.level_meter:LevelMeter" },
    ],
    createLiveLogWriter: () => {
      const levelReportsDue = cadence(1000, 1500);
      let reportCount = 0;
      return (millisecondsSinceLoad) =>
        levelReportsDue(millisecondsSinceLoad).map((dueAt): MockLogRecordDraft => {
          reportCount += 1;
          return {
            millisecondsAfterLoad: dueAt,
            source: "python",
            level: "info",
            target: PYTHON_HELPER_TARGET,
            message: "level",
            attrs: { rms_dbfs: (-38 - ((reportCount * 7) % 5) * 0.7).toFixed(1) },
            node: "levelmeter",
          };
        });
    },
    loadedForMillisecondsAtOpen: 266_000,
  };
}

/** The folder the test pattern's streams are run from. */
function patternProjectDirectory(machine: MockMachine): string {
  return `${machine.homeDirectory}/streams/pattern`;
}

/** A stream its owner stopped with `tatolab stop`. */
function stoppedPatternTwoListing(machine: MockMachine): ListedStream {
  const location = { project_directory: patternProjectDirectory(machine), stream_function: "stream:pattern_two" };
  return { stream: mockStreamIdOf(location), display_name: "pattern-two", location, state: "stopped", node_count: null, failed_because: null, capture_devices_whose_access_was_never_asked_for: [], action: null, step: null };
}

/** A stream that could not load at the runtime's start. */
function failedLobbyRecorderListing(machine: MockMachine): ListedStream {
  const location = { project_directory: `${machine.homeDirectory}/streams/lobby-recorder`, stream_function: "stream:main" };
  return { stream: mockStreamIdOf(location), display_name: "lobby-recorder", location, state: "failed", node_count: null, failed_because: machine.cameraFailure, capture_devices_whose_access_was_never_asked_for: [], action: null, step: null };
}

/** The machine the mock runtime runs on for `platform`, and the streams it lists. */
export interface MockStreamFixtures {
  machine: MockMachine;
  mainStream: MockStreamFixture;
  mainStreamWithDisplayWindowInError: MockStreamFixture;
  /** `main` with its meter falling behind, so a link drops frames. */
  mainStreamWithItsMeterFallingBehind: MockStreamFixture;
  cameraStream: MockStreamFixture;
  /** The camera stream as the runtime re-loads it at its start before anyone has asked for camera access. */
  cameraStreamWaitingForCameraAccess: MockStreamFixture;
  /** A recorder in the pattern folder reading `main`'s exposed effect, a link whose source is in another stream. */
  recorderOfMainStream: MockStreamFixture;
  stoppedPatternTwo: ListedStream;
  /** `pattern-two` once started again. */
  patternTwoStream: MockStreamFixture;
  failedLobbyRecorder: ListedStream;
  /** A record an earlier runtime wrote, which names no location and is listed failed until it is removed. */
  earlierRuntimesRecord: ListedStream;
  /** The folder the test pattern's streams are run from. */
  patternProjectDirectory: string;
  /** The order the runtime lists its streams in, by id. */
  listingOrder: readonly string[];
}

/** The mock runtime's machine and streams as they look on `platform`. */
export function createMockStreamFixtures(platform: TatolabPlatform): MockStreamFixtures {
  const machine = MOCK_MACHINES[platform];
  const projectDirectory = patternProjectDirectory(machine);
  const mainStreamOptions = {
    projectDirectory,
    streamFunction: "stream:main",
    displayName: "main",
    exposesItsEffect: true,
    withDisplayWindowInError: false,
    withTheMeterFallingBehind: false,
    recordsTheStream: null,
  };
  const mainStream = createTestPatternStream(machine, mainStreamOptions);
  const cameraStream = createCameraStream(machine);
  const recorderOfMainStream = createTestPatternStream(machine, {
    ...mainStreamOptions,
    streamFunction: "stream:recorder",
    displayName: "recorder",
    exposesItsEffect: false,
    recordsTheStream: mainStream.listing.stream,
  });
  const stoppedPatternTwo = stoppedPatternTwoListing(machine);
  const failedLobbyRecorder = failedLobbyRecorderListing(machine);
  return {
    machine,
    mainStream,
    mainStreamWithDisplayWindowInError: createTestPatternStream(machine, { ...mainStreamOptions, withDisplayWindowInError: true }),
    mainStreamWithItsMeterFallingBehind: createTestPatternStream(machine, { ...mainStreamOptions, withTheMeterFallingBehind: true }),
    cameraStream,
    cameraStreamWaitingForCameraAccess: { ...cameraStream, listing: { ...cameraStream.listing, capture_devices_whose_access_was_never_asked_for: ["camera"] } },
    recorderOfMainStream,
    stoppedPatternTwo,
    patternTwoStream: createTestPatternStream(machine, { ...mainStreamOptions, streamFunction: "stream:pattern_two", displayName: "pattern-two", exposesItsEffect: false }),
    failedLobbyRecorder,
    earlierRuntimesRecord: {
      stream: "doorbell",
      display_name: "doorbell",
      location: null,
      state: "failed",
      node_count: null,
      failed_because:
        "an earlier runtime recorded it, under record schema 2, and this runtime does not load it; run it again with `tatolab run` in its project, and `tatolab rm doorbell` forgets this record",
      capture_devices_whose_access_was_never_asked_for: [],
      action: null,
      step: null,
    },
    patternProjectDirectory: projectDirectory,
    listingOrder: [mainStream.listing.stream, cameraStream.listing.stream, recorderOfMainStream.listing.stream, stoppedPatternTwo.stream, failedLobbyRecorder.stream],
  };
}

/** The stream a project folder run from the window loads from `projectDirectory`'s `streamFunction`, shown as `displayName`: the sample's four nodes, its effect exposed. */
export function createMockStreamRunFromAProjectFolder(machine: MockMachine, projectDirectory: string, streamFunction: string, displayName: string): MockStreamFixture {
  const fixture = createTestPatternStream(machine, {
    projectDirectory,
    streamFunction,
    displayName,
    exposesItsEffect: true,
    withDisplayWindowInError: false,
    withTheMeterFallingBehind: false,
    recordsTheStream: null,
  });
  return { ...fixture, loadedForMillisecondsAtOpen: 0 };
}

/** The id the mock runtime runs under, which every record it writes and every stream action id it gives carries. */
export const MOCK_RUNTIME_ID = "Rmockruntime7f3k2q9x4w1b8n";

/** The record a draft of the log of the stream `streamId` becomes once stamped against the stream's load time under the stream action `action`, with its JSONL line as the runtime writes it. */
export function stampMockLogRecord(draft: MockLogRecordDraft, action: string, loadedAtMilliseconds: number, streamId: string | null): ProjectLogRecord {
  const hostTimestampNanoseconds = Math.round((loadedAtMilliseconds + draft.millisecondsAfterLoad) * 1_000_000);
  const processorId = draft.node === undefined || streamId === null ? null : mockNodeIdOf(streamId, draft.node);
  const attrs = draft.attrs ?? {};
  const jsonlRecord = {
    schema_version: 2,
    host_ts: hostTimestampNanoseconds,
    runtime_id: MOCK_RUNTIME_ID,
    ...(streamId === null ? {} : { stream: streamId }),
    action,
    source: draft.source,
    level: draft.level,
    message: draft.message,
    target: draft.target,
    ...(processorId === null ? {} : { processor_id: processorId }),
    intercepted: false,
    ...(Object.keys(attrs).length === 0 ? {} : { attrs }),
  };
  return {
    host_ts_ns: hostTimestampNanoseconds,
    level: draft.level,
    source: draft.source,
    target: draft.target,
    message: draft.message,
    attrs,
    processor_id: processorId,
    sent_by_its_own_process: draft.source === "python",
    action,
    stream: streamId,
    jsonl_line: JSON.stringify(jsonlRecord),
  };
}
