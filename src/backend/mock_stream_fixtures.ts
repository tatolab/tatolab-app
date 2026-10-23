// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream, StreamGraphDeclaredPort, StreamGraphLink, StreamLogRecord, TatolabPlatform } from "./tatolab_backend_contract";

/** A log record before the mock runtime numbers and stamps it. */
export interface MockLogRecordDraft {
  millisecondsAfterLoad: number;
  source: "rust" | "python";
  level: "trace" | "debug" | "info" | "warn" | "error";
  target: string;
  message: string;
  attrs?: Record<string, string>;
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
    commandLineToolLinkedAt: "/usr/local/bin/tatolab",
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

function loadingLines(machine: MockMachine, streamName: string, projectDirectory: string): MockLogRecordDraft[] {
  return [
    { millisecondsAfterLoad: 0, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `Loading the stream \`${streamName}\` from ${projectDirectory}` },
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

/** The test pattern's meter falling behind: its link drops frames and the effect's output refuses a few. */
const TEST_PATTERN_METER_FALLING_BEHIND: MockCounterRates = {
  droppedPerSecondByLinkId: { Lizkqmkmmu5ldam8dbymcc4bc: 9 },
  refusedPerSecondByOutput: [{ node: "invertingeffect", port: "video_to_downstream", perSecond: 2 }],
};

/** `tatolab new --test-pattern`, run as `streamName`: the scaffold's four nodes, two of them Python. */
function createTestPatternStream(
  machine: MockMachine,
  options: { streamName: string; state: "kept" | "attached"; exposesItsEffect: boolean; withDisplayWindowInError: boolean; withTheMeterFallingBehind: boolean },
): MockStreamFixture {
  const projectDirectory = `${machine.homeDirectory}/streams/pattern`;
  const { streamName } = options;
  const brightness = (dueAt: number): MockLogRecordDraft => ({
    millisecondsAfterLoad: dueAt,
    source: "python",
    level: "info",
    target: PYTHON_HELPER_TARGET,
    message: "brightness",
    attrs: { height: "720", mean: "127.5", width: "1280" },
  });
  return {
    listing: { name: streamName, state: options.state, project_directory: projectDirectory, node_count: 4, failed_because: null },
    graph: {
      nodes: TEST_PATTERN_NODES.map((node) =>
        options.withDisplayWindowInError && node.name === "displaywindow" ? { ...node, state: "Error" } : node,
      ),
      links: TEST_PATTERN_LINKS.map((link) =>
        options.withDisplayWindowInError && link.target_node === "displaywindow" ? { ...link, state: "error" } : link,
      ),
      exposed: options.exposesItsEffect ? [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }] : [],
      counterRates: options.withTheMeterFallingBehind ? TEST_PATTERN_METER_FALLING_BEHIND : NO_COUNTERS_CLIMB,
    },
    startupLog: [
      ...loadingLines(machine, streamName, projectDirectory),
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
            } satisfies MockLogRecordDraft,
          ]
        : []),
    ],
    createLiveLogWriter: () => {
      const brightnessReportsDue = cadence(1001, 1493);
      const escalateWarningDue = once(2772);
      const brightnessReadFailureDue = options.state === "kept" && !options.withDisplayWindowInError ? once(4120) : once(Number.POSITIVE_INFINITY);
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
          }),
        ),
      ];
    },
    loadedForMillisecondsAtOpen: options.state === "kept" ? 6200 : 3900,
  };
}

/** A camera and a microphone, each watched and metered, kept with `tatolab run -d`. */
function createCameraStream(machine: MockMachine): MockStreamFixture {
  const projectDirectory = `${machine.homeDirectory}/streams/camera`;
  return {
    listing: { name: "camera", state: "kept", project_directory: projectDirectory, node_count: 4, failed_because: null },
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
      { millisecondsAfterLoad: 0, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `Loading the stream \`camera\` from ${projectDirectory}` },
      { millisecondsAfterLoad: 382, source: "rust", level: "info", target: "streamlib_media_builtins::camera_source", message: "Camera opened", attrs: machine.cameraOpenedAttrs },
      {
        millisecondsAfterLoad: 396,
        source: "rust",
        level: "info",
        target: "streamlib_media_builtins::microphone_source",
        message: "Microphone opened",
        attrs: { channels: "1", device: machine.microphoneDevice, sample_rate: "48000" },
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
          };
        });
    },
    loadedForMillisecondsAtOpen: 266_000,
  };
}

/** A kept stream its owner stopped with `tatolab stop`. */
function stoppedPatternTwoListing(machine: MockMachine): ListedStream {
  return { name: "pattern-two", state: "stopped", project_directory: `${machine.homeDirectory}/streams/pattern`, node_count: null, failed_because: null };
}

/** A kept stream that could not load at the runtime's start. */
function failedLobbyRecorderListing(machine: MockMachine): ListedStream {
  return {
    name: "lobby-recorder",
    state: "failed",
    project_directory: `${machine.homeDirectory}/streams/lobby-recorder`,
    node_count: null,
    failed_because: machine.cameraFailure,
  };
}

/** The machine the mock runtime runs on for `platform`, and the streams it lists. */
export interface MockStreamFixtures {
  machine: MockMachine;
  mainStream: MockStreamFixture;
  mainStreamWithDisplayWindowInError: MockStreamFixture;
  /** `main` with its meter falling behind, so a link drops frames. */
  mainStreamWithItsMeterFallingBehind: MockStreamFixture;
  cameraStream: MockStreamFixture;
  attachedDemoStream: MockStreamFixture;
  stoppedPatternTwo: ListedStream;
  /** `pattern-two` once started again. */
  patternTwoStream: MockStreamFixture;
  failedLobbyRecorder: ListedStream;
  /** The order the runtime lists its streams in. */
  listingOrder: readonly string[];
}

/** The mock runtime's machine and streams as they look on `platform`. */
export function createMockStreamFixtures(platform: TatolabPlatform): MockStreamFixtures {
  const machine = MOCK_MACHINES[platform];
  return {
    machine,
    mainStream: createTestPatternStream(machine, {
      streamName: "main",
      state: "kept",
      exposesItsEffect: true,
      withDisplayWindowInError: false,
      withTheMeterFallingBehind: false,
    }),
    mainStreamWithDisplayWindowInError: createTestPatternStream(machine, {
      streamName: "main",
      state: "kept",
      exposesItsEffect: true,
      withDisplayWindowInError: true,
      withTheMeterFallingBehind: false,
    }),
    mainStreamWithItsMeterFallingBehind: createTestPatternStream(machine, {
      streamName: "main",
      state: "kept",
      exposesItsEffect: true,
      withDisplayWindowInError: false,
      withTheMeterFallingBehind: true,
    }),
    cameraStream: createCameraStream(machine),
    attachedDemoStream: createTestPatternStream(machine, {
      streamName: "attached-demo",
      state: "attached",
      exposesItsEffect: false,
      withDisplayWindowInError: false,
      withTheMeterFallingBehind: false,
    }),
    stoppedPatternTwo: stoppedPatternTwoListing(machine),
    patternTwoStream: createTestPatternStream(machine, {
      streamName: "pattern-two",
      state: "kept",
      exposesItsEffect: false,
      withDisplayWindowInError: false,
      withTheMeterFallingBehind: false,
    }),
    failedLobbyRecorder: failedLobbyRecorderListing(machine),
    listingOrder: ["main", "camera", "attached-demo", "pattern-two", "lobby-recorder"],
  };
}

/** The record a draft becomes once numbered and stamped against the stream's load time. */
export function stampMockLogRecord(draft: MockLogRecordDraft, sequence: number, loadedAtMilliseconds: number): StreamLogRecord {
  return {
    sequence,
    host_ts_ns: Math.round((loadedAtMilliseconds + draft.millisecondsAfterLoad) * 1_000_000),
    level: draft.level,
    source: draft.source,
    target: draft.target,
    message: draft.message,
    attrs: draft.attrs ?? {},
  };
}
