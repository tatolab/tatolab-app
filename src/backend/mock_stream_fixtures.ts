import type { ListedStream, StreamGraphSummary, StreamLogRecord } from "./tatolab_backend_contract";

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

/** A stream the mock runtime lists, with its graph and the log it writes. */
export interface MockStreamFixture {
  listing: ListedStream;
  /** The graph while loaded; its nodes start `Pending` and their links `pending` until the stream settles. */
  graph: StreamGraphSummary | null;
  startupLog: MockLogRecordDraft[];
  createLiveLogWriter: () => MockLiveLogWriter;
}

/** The name the mock runtime gives this Mac, a hostname cast as the runtime casts one. */
export const MOCK_MACHINE_NAME = "ada-macbook-pro";
const MOCK_HOME_DIRECTORY = "/Users/ada";

const PYTHON_HELPER_TARGET = "streamlib::polyglot::python";
const LOADED_STREAM_TARGET = "streamlib_engine::core::runtime::loaded_stream";
const COMPILER_TARGET = "streamlib_engine::core::compiler::compiler";
const SPAWN_PROCESSOR_TARGET = "streamlib_engine::core::compiler::compiler_ops::spawn_processor_op";
const GPU_CONTEXT_TARGET = "streamlib_engine::core::context::gpu_context";
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

function loadingLog(streamName: string, projectDirectory: string, processorCount: number, linkCount: number): MockLogRecordDraft[] {
  return [
    { millisecondsAfterLoad: 0, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `Loading the stream \`${streamName}\` from ${projectDirectory}` },
    { millisecondsAfterLoad: 151, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `[start] Starting the stream \`${streamName}\`` },
    { millisecondsAfterLoad: 151, source: "rust", level: "info", target: "streamlib_engine::core::runtime::runtime", message: "[start] Initializing the engine's GPU context..." },
    {
      millisecondsAfterLoad: 156,
      source: "rust",
      level: "info",
      target: "streamlib_consumer_rhi::vulkan_loader_library",
      message: "Vulkan loader library opened",
      attrs: { vulkan_loader_library: "/Applications/Tatolab.app/Contents/Frameworks/tatolab-runtime/_vulkan_driver/libvulkan.1.dylib" },
    },
    { millisecondsAfterLoad: 163, source: "rust", level: "info", target: "streamlib_engine::vulkan::rhi::vulkan_device", message: "Selected Vulkan device: Apple M2 Pro (type: Integrated GPU)" },
    { millisecondsAfterLoad: 171, source: "rust", level: "info", target: "streamlib_engine::vulkan::rhi::vulkan_device", message: "VK_EXT_metal_objects enabled - Metal interop available" },
    { millisecondsAfterLoad: 178, source: "rust", level: "info", target: GPU_CONTEXT_TARGET, message: "GPU: Using Vulkan device" },
    { millisecondsAfterLoad: 178, source: "rust", level: "info", target: "streamlib_engine::core::runtime::runtime", message: "[start] The engine's GPU context is initialized" },
    { millisecondsAfterLoad: 180, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: "[start] Creating CoreAudioClock (GCD): 48000Hz, 512 samples/tick" },
    { millisecondsAfterLoad: 181, source: "rust", level: "info", target: COMPILER_TARGET, message: `Compiling: +${processorCount} -0 processors, +${linkCount} -0 links, 0 config updates` },
  ];
}

function startedLog(streamName: string, processorCount: number, linkCount: number, atMilliseconds: number): MockLogRecordDraft[] {
  return [
    {
      millisecondsAfterLoad: atMilliseconds,
      source: "rust",
      level: "info",
      target: "streamlib_engine::core::compiler::compiler_ops::open_iceoryx2_service_op",
      message: "Opened iceoryx2 channel: [Lj17fu4mdczivji99oua37i06] (state: Wired)",
    },
    { millisecondsAfterLoad: atMilliseconds + 4, source: "rust", level: "info", target: COMPILER_TARGET, message: `Compile complete: CompileResult { +${processorCount} -0 processors, +${linkCount} -0 links, 0 configs }` },
    { millisecondsAfterLoad: atMilliseconds + 4, source: "rust", level: "info", target: LOADED_STREAM_TARGET, message: `[start] The stream \`${streamName}\` started` },
  ];
}

const TEST_PATTERN_STREAM_PROJECT = `${MOCK_HOME_DIRECTORY}/streams/pattern`;

/** `tatolab new --test-pattern`, kept with `tatolab run -d`: the scaffold's four nodes, two of them Python. */
export const TEST_PATTERN_STREAM: MockStreamFixture = {
  listing: { name: "main", state: "kept", project_directory: TEST_PATTERN_STREAM_PROJECT, node_count: 4, failed_because: null },
  graph: {
    stream: "main",
    nodes: [
      { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: "Running" },
      { name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running" },
      { name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", state: "Running" },
      { name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Running" },
    ],
    links: [
      { source_node: "testpatternsource", source_port: "video", target_node: "invertingeffect", target_port: "video_from_upstream", state: "wired" },
      { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "displaywindow", target_port: "video", state: "wired" },
      { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "brightnessmeter", target_port: "video_from_upstream", state: "wired" },
    ],
    exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }],
  },
  startupLog: [
    ...loadingLog("main", TEST_PATTERN_STREAM_PROJECT, 4, 3).slice(0, 1),
    {
      millisecondsAfterLoad: 150,
      source: "rust",
      level: "info",
      target: "streamlib_engine::core::processors::node_types_one_stream_resolves",
      message: "node type described in the stream's processor interpreter registered",
      attrs: { processor_class_import_path: "nodes.inverting_effect:InvertingEffect" },
    },
    {
      millisecondsAfterLoad: 150,
      source: "rust",
      level: "info",
      target: "streamlib_engine::core::processors::node_types_one_stream_resolves",
      message: "node type described in the stream's processor interpreter registered",
      attrs: { processor_class_import_path: "nodes.brightness_meter:BrightnessMeter" },
    },
    ...loadingLog("main", TEST_PATTERN_STREAM_PROJECT, 4, 3).slice(1),
    { millisecondsAfterLoad: 182, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pe9fffgi3l6sg3m4molzy4pov] Spawning Rust processor with strategy: dedicated thread (Normal priority (no strict latency))" },
    { millisecondsAfterLoad: 183, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pgwl3rys4jaz8k9g6pqxxv8kd] Spawning Python processor with strategy: dedicated thread (Normal priority (no strict latency))" },
    { millisecondsAfterLoad: 183, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pak2of8mm6v631e1f30cw7zjo] Spawning Python processor with strategy: dedicated thread (Normal priority (no strict latency))" },
    { millisecondsAfterLoad: 184, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pk79b96s4d8fumlitkntmn5dg] Spawning Rust processor with strategy: dedicated thread (High priority (< 33ms latency, elevated))" },
    ...startedLog("main", 4, 3, 186),
    {
      millisecondsAfterLoad: 205,
      source: "rust",
      level: "info",
      target: "streamlib_media_builtins::test_pattern_source",
      message: "TestPatternSource: pattern surface ready",
      attrs: { height: "720", surface_id: "f5a5c630-265a-4145-bd7b-262a857f17d1#1", width: "1280" },
    },
    { millisecondsAfterLoad: 290, source: "rust", level: "info", target: "streamlib_engine::core::compiler::compiler_ops::processor_interpreter_spawn_host", message: "[invertingeffect] helper process started: pid=54846, entrypoint=nodes.inverting_effect:InvertingEffect" },
    { millisecondsAfterLoad: 291, source: "rust", level: "info", target: "streamlib_engine::core::compiler::compiler_ops::processor_interpreter_spawn_host", message: "[brightnessmeter] helper process started: pid=54847, entrypoint=nodes.brightness_meter:BrightnessMeter" },
    { millisecondsAfterLoad: 291, source: "python", level: "info", target: PYTHON_HELPER_TARGET, message: "helper process started", attrs: { entrypoint: "nodes.inverting_effect:InvertingEffect", pid: "54846" } },
    { millisecondsAfterLoad: 314, source: "python", level: "info", target: PYTHON_HELPER_TARGET, message: "helper process started", attrs: { entrypoint: "nodes.brightness_meter:BrightnessMeter", pid: "54847" } },
    { millisecondsAfterLoad: 330, source: "python", level: "warn", target: PYTHON_HELPER_TARGET, message: "[mvk-info] MoltenVK version 1.4.2, supporting Vulkan version 1.4.357." },
    { millisecondsAfterLoad: 330, source: "python", level: "warn", target: PYTHON_HELPER_TARGET, message: "\tThe following 154 Vulkan extensions are supported:" },
    { millisecondsAfterLoad: 330, source: "python", level: "warn", target: PYTHON_HELPER_TARGET, message: "\tVK_KHR_16bit_storage v1" },
    { millisecondsAfterLoad: 330, source: "python", level: "warn", target: PYTHON_HELPER_TARGET, message: "\tVK_KHR_8bit_storage v1" },
    { millisecondsAfterLoad: 331, source: "python", level: "warn", target: PYTHON_HELPER_TARGET, message: "\tVK_KHR_bind_memory2 v1" },
    {
      millisecondsAfterLoad: 342,
      source: "rust",
      level: "info",
      target: "streamlib_engine::core::processor_owned_window",
      message: "processor-owned window: window + present target ready",
      attrs: { height: "1440", width: "2560", window_title: "Tatolab" },
    },
    {
      millisecondsAfterLoad: 355,
      source: "rust",
      level: "warn",
      target: "streamlib_engine::vulkan::rhi::vulkan_pipeline_cache_on_disk",
      message:
        "Graphics kernel 'present-compositor-display-blit': failed to persist pipeline cache to /.streamlib/cache/pipeline-cache/4ca6f3d5faba1f6d.gfx.bin: Read-only file system (os error 30)",
    },
  ],
  createLiveLogWriter: () => {
    const brightnessReportsDue = cadence(1021, 1000);
    const escalateWarningsDue = cadence(5024, 1400);
    const brightnessReadFailuresDue = cadence(23_000, 17_000);
    return (millisecondsSinceLoad) => [
      ...brightnessReportsDue(millisecondsSinceLoad).map(
        (dueAt): MockLogRecordDraft => ({
          millisecondsAfterLoad: dueAt,
          source: "python",
          level: "info",
          target: PYTHON_HELPER_TARGET,
          message: "brightness",
          attrs: { mean: "127.5", width: "1280", height: "720" },
        }),
      ),
      ...escalateWarningsDue(millisecondsSinceLoad).map(
        (dueAt): MockLogRecordDraft => ({
          millisecondsAfterLoad: dueAt,
          source: "rust",
          level: "warn",
          target: GPU_CONTEXT_TARGET,
          message: ESCALATE_RATE_WARNING,
          attrs: { escalations_last_second: "2", thread: "br-esc-Pgwl3rys" },
        }),
      ),
      ...brightnessReadFailuresDue(millisecondsSinceLoad).map(
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
};

const LOBBY_RECORDER_PROJECT = `${MOCK_HOME_DIRECTORY}/streams/lobby-recorder`;

/** A camera and a microphone encoded into one MP4, run attached with `tatolab run`. */
export const LOBBY_RECORDER_STREAM: MockStreamFixture = {
  listing: { name: "lobby-recorder", state: "attached", project_directory: LOBBY_RECORDER_PROJECT, node_count: 5, failed_because: null },
  graph: {
    stream: "lobby-recorder",
    nodes: [
      { name: "camerasource", type: "tatolab.stream:CameraSource", state: "Running" },
      { name: "microphonesource", type: "tatolab.stream:MicrophoneSource", state: "Running" },
      { name: "h264encoder", type: "tatolab.stream:H264Encoder", state: "Running" },
      { name: "opusencoder", type: "tatolab.stream:OpusEncoder", state: "Running" },
      { name: "mp4sink", type: "tatolab.stream:Mp4Sink", state: "Running" },
    ],
    links: [
      { source_node: "camerasource", source_port: "video", target_node: "h264encoder", target_port: "video", state: "wired" },
      { source_node: "h264encoder", source_port: "encoded_video", target_node: "mp4sink", target_port: "tracks", state: "wired" },
      { source_node: "microphonesource", source_port: "audio", target_node: "opusencoder", target_port: "audio", state: "wired" },
      { source_node: "opusencoder", source_port: "encoded_audio", target_node: "mp4sink", target_port: "tracks", state: "wired" },
    ],
    exposed: [],
  },
  startupLog: [
    ...loadingLog("lobby-recorder", LOBBY_RECORDER_PROJECT, 5, 4),
    { millisecondsAfterLoad: 184, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pc3mz0d9q1r7wnyb2f8kx4hte] Spawning Rust processor with strategy: dedicated thread (High priority (< 33ms latency, elevated))" },
    { millisecondsAfterLoad: 185, source: "rust", level: "info", target: SPAWN_PROCESSOR_TARGET, message: "[Pm8v2kq0x7d1fz3wa9cn5ry4e] Spawning Rust processor with strategy: dedicated thread (High priority (< 33ms latency, elevated))" },
    ...startedLog("lobby-recorder", 5, 4, 190),
    {
      millisecondsAfterLoad: 260,
      source: "rust",
      level: "info",
      target: "streamlib_media_builtins::camera_source",
      message: "CameraSource: AVFoundation capture running",
      attrs: { device: "FaceTime HD Camera", height: "1080", width: "1920" },
    },
    {
      millisecondsAfterLoad: 270,
      source: "rust",
      level: "info",
      target: "streamlib_media_builtins::microphone_source",
      message: "MicrophoneSource: following the system default input",
      attrs: { channels: "1", sample_rate: "48000" },
    },
    { millisecondsAfterLoad: 410, source: "rust", level: "info", target: "streamlib_media_builtins::h264_encoder", message: "H264Encoder: VideoToolbox session minted", attrs: { height: "1080", width: "1920" } },
    { millisecondsAfterLoad: 430, source: "rust", level: "info", target: "streamlib_media_builtins::opus_encoder", message: "OpusEncoder: libopus encoder minted", attrs: { channels: "1" } },
    { millisecondsAfterLoad: 1420, source: "rust", level: "info", target: "streamlib_media_builtins::mp4_sink", message: "Mp4Sink: moov written", attrs: { path: `${MOCK_HOME_DIRECTORY}/Movies/lobby.mp4`, tracks: "2" } },
  ],
  createLiveLogWriter: () => {
    const fragmentsDue = cadence(2000, 2400);
    const droppedFrameWarningsDue = cadence(9500, 6100);
    let closedFragmentCount = 0;
    return (millisecondsSinceLoad) => [
      ...fragmentsDue(millisecondsSinceLoad).map((dueAt): MockLogRecordDraft => {
        closedFragmentCount += 1;
        return {
          millisecondsAfterLoad: dueAt,
          source: "rust",
          level: "info",
          target: "streamlib_media_builtins::mp4_sink",
          message: "Mp4Sink: fragment closed",
          attrs: { bytes: String(1_460_000 + ((closedFragmentCount * 7919) % 41_000)), fragment: String(closedFragmentCount) },
        };
      }),
      ...droppedFrameWarningsDue(millisecondsSinceLoad).map(
        (dueAt): MockLogRecordDraft => ({
          millisecondsAfterLoad: dueAt,
          source: "rust",
          level: "warn",
          target: "streamlib_media_builtins::h264_encoder",
          message: "H264Encoder: frame dropped while the encoder queue was full",
          attrs: { queued: "4" },
        }),
      ),
    ];
  },
};

/** A kept stream that could not re-load when the runtime started. */
export const FAILED_DEPTH_OVERLAY_STREAM: MockStreamFixture = {
  listing: {
    name: "depth-overlay",
    state: "failed",
    project_directory: `${MOCK_HOME_DIRECTORY}/streams/depth-overlay`,
    node_count: null,
    failed_because:
      "it did not re-load at the runtime's start: the processor interpreter for `depthestimator` exited with status 1: ModuleNotFoundError: No module named 'torch'",
  },
  graph: null,
  startupLog: [],
  createLiveLogWriter: () => () => [],
};

/** A kept stream its owner stopped with `tatolab stop`. */
export const STOPPED_STUDIO_MIC_STREAM: MockStreamFixture = {
  listing: { name: "studio-mic", state: "stopped", project_directory: `${MOCK_HOME_DIRECTORY}/streams/studio-mic`, node_count: null, failed_because: null },
  graph: null,
  startupLog: [],
  createLiveLogWriter: () => () => [],
};

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
