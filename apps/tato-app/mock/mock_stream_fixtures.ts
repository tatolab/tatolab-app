import { mapEachMockMainGraph, type MockMainGraph } from "./mock_main_graphs";
import { PULSE_STAGE_FOLDER_NAME, PULSE_STAGE_PROJECT, PULSE_STAGE_STREAM_ASSETS } from "./mock_pulse_stage_sample";
import { mockRecordedGraphOfThePulseStageSample } from "./mock_recordings";
import { MOCK_STUDIO_VIEW_TYPE_ID } from "./mock_studio_view/mock_studio_view_listing";
import type {
  JsonValue,
  ListedStream,
  PortStreamFacts,
  ProjectLogRecord,
  StreamGraphGroup,
  StreamGraphInputValueRead,
  StreamGraphLinkWarning,
  StreamGraphNode,
  StreamGraphNodeKind,
  StreamGraphNodeStudioFields,
  StreamGraphNote,
  StreamGraphPort,
  StreamGraphPortPin,
  StreamLocation,
  TatolabPlatform,
} from "../src/shared/tatolab_backend_contract";
import type { PortFamily } from "@tatolab/tato-app-view-sdk/port_families";

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

/** The id the graph names `node` of the stream `streamId` by: its own name's, or the one it kept through a rename. */
export function mockGraphNodeIdOf(streamId: string, node: Pick<MockGraphNode, "name" | "id_kept_through_renames">): string {
  return node.id_kept_through_renames ?? mockNodeIdOf(streamId, node.name);
}

/** A part of a stream id as the runtime casts one: lower case, each run of other characters one `-`, none at either end. */
function castAsAStreamIdPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A mock stream as the person names it: the project directory it is loaded from and its stream asset's name, `main` for `streams/main.graph.json`. */
export interface MockStreamAddress {
  project_directory: string;
  stream_name: string;
}

/** `projectDirectory` with the person's home folder written `~`, so a mock stream has the same ids on both platforms. */
function projectDirectoryUnderHomeOf(projectDirectory: string): string {
  return projectDirectory.replace(/^\/(Users|home)\/[^/]+/, "~");
}

/** A stand-in UUID, the same for the same `text`. */
export function mockUuidOf(text: string): string {
  const hexDigits = [0, 1, 2, 3].map((part) => fnv1aHashOf(`${part}\n${text}`).toString(16).padStart(8, "0")).join("");
  return `${hexDigits.slice(0, 8)}-${hexDigits.slice(8, 12)}-4${hexDigits.slice(13, 16)}-8${hexDigits.slice(17, 20)}-${hexDigits.slice(20, 32)}`;
}

/**
 * The location the runtime lists for the stream at `address`: its project directory, and its project's and its stream asset's
 * UUIDs: Pulse Stage's own in a folder named for it, stand-ins for any other.
 */
export function mockStreamLocationOf(address: MockStreamAddress): StreamLocation {
  const projectDirectoryUnderHome = projectDirectoryUnderHomeOf(address.project_directory);
  const isPulseStage = address.project_directory.split("/").at(-1) === PULSE_STAGE_FOLDER_NAME;
  return {
    project_directory: address.project_directory,
    project: isPulseStage ? PULSE_STAGE_PROJECT : mockUuidOf(`project\n${projectDirectoryUnderHome}`),
    stream_asset: (isPulseStage ? PULSE_STAGE_STREAM_ASSETS[address.stream_name] : undefined) ?? mockUuidOf(`stream asset\n${projectDirectoryUnderHome}\n${address.stream_name}`),
  };
}

/**
 * The stream id the runtime computes for the stream at `address`, `<project name>-<stream name>-<hash>`, the project
 * named by its folder as a created project is, with a stand-in hash over its two UUIDs.
 */
export function mockStreamIdOf(address: MockStreamAddress): string {
  const projectName = castAsAStreamIdPart(address.project_directory.split("/").filter((segment) => segment !== "").at(-1) ?? "");
  const streamName = castAsAStreamIdPart(address.stream_name);
  const location = mockStreamLocationOf(address);
  const hash = fnv1aHashOf(`${location.project}\n${location.stream_asset}`).toString(16).padStart(8, "0").slice(0, 6);
  return [projectName, streamName, hash].filter((part) => part !== "").join("-");
}

/** A stream listed running, its graph loaded with `nodeCount` nodes, under the id its address computes to. */
function runningListing(address: MockStreamAddress, displayName: string, nodeCount: number): ListedStream {
  return { stream: mockStreamIdOf(address), display_name: displayName, location: mockStreamLocationOf(address), state: "running", node_count: nodeCount, failed_because: null, capture_devices_whose_access_was_never_asked_for: [], condition: null, action: null, step: null };
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

/** A port of a mock node as the mock holds it, which it renders as the runtime renders a port of `graph`. */
export interface MockGraphPort {
  name: string;
  /** The family it carries; `null` for one the runtime serves none for. */
  family: PortFamily | null;
  /** What an output states about its stream; `null` for none. */
  stream_facts: PortStreamFacts | null;
  /** `false` on a Records port; `null` on every other. */
  values_checked: boolean | null;
  /** Its pin type and flow; `null` on a port whose code does not state its type exactly. */
  pin: StreamGraphPortPin | null;
  /** On an input, what it reads while unlinked and where that comes from; `null` on one that takes no stored value, and on every output. */
  value_read: StreamGraphInputValueRead | null;
  /** On a bundle input, what each of its members reads while unlinked, in the order the bundle declares them, in place of `value_read`; absent on every other port. */
  member_reads?: MockMemberRead[];
  /** What its pin states besides its type, as `graph` serves it; absent where it states none. */
  annotations?: NonNullable<StreamGraphPort["annotations"]>;
  /** On an input, whether a link may end at it, as `graph` marks it; absent where the recording it comes from, made before the runtime marked inputs, marks none. */
  takes_a_wire?: boolean;
}

/** What one member of a bundle input reads while unlinked and where that comes from, and the default it reads while none is set. */
export interface MockMemberRead {
  member: string;
  value_read: StreamGraphInputValueRead;
  default_value: JsonValue | null;
}

/** A link of a mock stream's graph: its id, the node and port at each end by name, its state as the runtime spells it, and the marks a recording of the runtime gave it. */
export interface MockGraphLink {
  id: string;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
  /** The member of a bundle port the link starts at, which it carries alone; absent for the whole port. */
  source_member?: string;
  /** The member of a bundle port the link ends at; absent for the whole port. */
  target_member?: string;
  state: "pending" | "wired" | "disconnecting" | "disconnected" | "error";
  /** `true` where the runtime marked the link as one its input reads as its own type at no cost. */
  free_conversion?: true;
  /** The warnings the runtime gave the link. */
  warnings?: StreamGraphLinkWarning[];
}

/** A node of a mock stream's graph, as the runtime's `graph` names it, with the config and ports it renders. */
export interface MockGraphNode {
  name: string;
  /** The id it had before a rename, which it keeps as the runtime keeps a node's UUID. */
  id_kept_through_renames?: string;
  type: string;
  /** How its code runs; a subgraph is a `fragment` and every other node a `process` when absent. */
  kind?: StreamGraphNodeKind;
  /** The language a `function` node is written in; absent on every other kind. */
  language?: NonNullable<StreamGraphNode["language"]>;
  /** `null` for an interface node, which runs nothing and so reads no state. */
  state: string | null;
  /** Why it failed, in the runtime's words, while `state` reads `Error`. */
  failed_because?: string;
  /** What its `process()` raised, in the runtime's words, while it keeps raising and stays `Running`. */
  process_raising_because?: string;
  /** Why it cannot do its work yet, in the runtime's words, while it keeps running. */
  not_ready_because?: string;
  config: Record<string, JsonValue>;
  /** The value each unlinked input holds, by input name. */
  pins?: Record<string, JsonValue>;
  /** The default each input that holds a value reads while none is set, as its port declares it, by input name. */
  input_defaults?: Record<string, JsonValue>;
  /** The config fields it takes as inputs, each also one of `input_ports`. */
  exposed_config_fields?: string[];
  /** Its settings, held as its config's fields, which `set_node_input_value` sets in `config`: each one no port, or one of `input_ports` that reads the value its config holds, else the default its port reads. */
  settings?: string[];
  input_ports: MockGraphPort[];
  output_ports: MockGraphPort[];
  /** Its studio fields; none set when absent. */
  studio?: StreamGraphNodeStudioFields;
  /** What it holds when it is a subgraph; absent on every other node. */
  fragment?: MockGraphFragment;
  /** Whether the runtime serves it as a value source, as it serves a view node: each output carries what its input of the same name is set to. */
  is_a_value_source?: true;
}

/** The graph a mock subgraph node holds, as the runtime renders a node's `fragment`. */
export interface MockGraphFragment {
  nodes: MockGraphNode[];
  links: MockGraphLink[];
  groups: StreamGraphGroup[];
}

/** Ports of `family` stating no stream facts, as every input and most outputs do; a Records port carries the runtime's unchecked mark. */
const portsStatingNoStreamFacts = (family: PortFamily, ...portNames: string[]): MockGraphPort[] =>
  portNames.map((name) => ({ name, family, stream_facts: null, values_checked: family === "records" ? false : null, pin: null, value_read: null }));

/** The pin type and flow the runtime serves on a built-in's Image port, whose code states its type exactly. */
const TEXTURE_STREAM: StreamGraphPortPin = { pin_type: { type: "texture" }, flow: "stream" };

/** An Image output stating its frame rate, as a built-in source declaring `rate=` does, typed as a built-in's Image port is. */
const imageOutputAtFramesPerSecond = (name: string, framesPerSecond: number): MockGraphPort => ({
  name,
  family: "image",
  stream_facts: { facts_of: "pictures", type: "texture", frame_rate: { numerator: framesPerSecond, denominator: 1 }, content_light_level: null, mastering_display_colour_volume: null },
  values_checked: null,
  pin: TEXTURE_STREAM,
  value_read: null,
});

/** A built-in's Image input, typed as its code states it. */
const textureInput = (name: string): MockGraphPort => ({ name, family: "image", stream_facts: null, values_checked: null, pin: TEXTURE_STREAM, value_read: null });

/** How fast a mock stream's counters climb while it runs: messages a link's target drops, and messages an output refuses, each second. */
export interface MockCounterRates {
  droppedPerSecondByLinkId: Record<string, number>;
  refusedPerSecondByOutput: { node: string; port: string; perSecond: number }[];
}

/** A mock stream's graph as the runtime holds it; the mock renders the `graph` document and its summary from it. */
export interface MockStreamGraph {
  nodes: MockGraphNode[];
  links: MockGraphLink[];
  counterRates: MockCounterRates;
  /** Its labelled groups; none when absent. */
  groups?: StreamGraphGroup[];
  /** Its canvas notes; none when absent. */
  notes?: StreamGraphNote[];
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
    vulkanLoaderLibrary: "/Applications/Tato Studio.app/Contents/Frameworks/tatolab-runtime/_vulkan_driver/libvulkan.1.dylib",
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

/** Why the speaker failed in the stream that shows it in error, as a native node's failed `start()` reads. */
const SPEAKER_FAILED_BECAUSE = "start() failed: SpeakerSink could not open an audio output: no output device answered on 'default'";

/**
 * The extra `GraphInput`s `main` declares with `?graph_inputs=declared`, beside Pulse Stage's own `speed` and `segments`, so each
 * family a client writes is declared once: `strobe` a Channels input reset at Stop, `tint` an Array and `cue` a Records input.
 */
const EXTRA_GRAPH_INPUTS: MockGraphNode[] = [
  graphInputDeclaring("strobe_input", "channels", { port: "strobe", lifetime: "reset" }, false),
  graphInputDeclaring("tint_input", "array", { port: "tint", range: [0, 1] }, [1, 0.5, 0.25]),
  graphInputDeclaring("cue_input", "records", { port: "cue" }, { scene: "intro" }),
];

/**
 * The `value` input of a top-level `GraphInput` of `family`, a setting that takes no wire, as the runtime renders it: no pin
 * type, since it carries any value of its family, reading `savedValue`, the value the graph document saves for it, while nothing sets it.
 */
function graphInputValueInput(family: PortFamily, savedValue: JsonValue): MockGraphPort {
  return { name: "value", family, stream_facts: null, values_checked: family === "records" ? false : null, pin: null, value_read: { value: savedValue, comes_from: "saved" }, takes_a_wire: false };
}

/** The `lifetime` setting of a top-level `GraphInput`, a String that takes no wire, as the runtime renders it, reading `lifetime` where its config saves one and the runtime's default `kept` else. */
function graphInputLifetimeInput(lifetime: JsonValue | undefined): MockGraphPort {
  return {
    name: "lifetime",
    family: "records",
    stream_facts: null,
    values_checked: null,
    pin: { pin_type: { type: "string" }, flow: "value" },
    value_read: lifetime === undefined ? { value: "kept", comes_from: "default" } : { value: lifetime, comes_from: "saved" },
    takes_a_wire: false,
  };
}

/** A top-level `GraphInput` named `name`, declaring the input port `port` of `family` with `config`, as the runtime renders one back: running, a `value` input reading `savedValue`, which its config does not repeat, its `lifetime` setting, and one `value` output. */
function graphInputDeclaring(name: string, family: PortFamily, config: Record<string, JsonValue> & { port: string }, savedValue: JsonValue): MockGraphNode {
  return {
    name,
    type: "tatolab.stream:GraphInput",
    state: "Running",
    config: { ...config, family },
    pins: { value: savedValue },
    input_ports: [graphInputValueInput(family, savedValue), graphInputLifetimeInput(config["lifetime"])],
    output_ports: portsStatingNoStreamFacts(family, "value"),
  };
}

/** The node and port of Pulse Stage's picture each extra node reads: its Kaleidoscope's folded lights. */
const THE_FOLDED_LIGHTS = { node: "kaleidoscope", port: "result" } as const;

/** What Core Nodes' `ImageFile` reports while its `asset` input is unset, in the runtime's words. */
const IMAGE_FILE_NOT_READY_BECAUSE = "ImageFile names no image asset. To fix: set its `asset` input to a PNG or JPEG imported into the project";

/** A Core Nodes `ImageFile` naming no asset, so it reports itself not ready and keeps running. */
const IMAGE_FILE_NOT_READY_NODE: MockGraphNode = {
  name: "posterimage",
  type: "core_nodes.image_file:ImageFile",
  state: "Running",
  not_ready_because: IMAGE_FILE_NOT_READY_BECAUSE,
  config: {},
  settings: ["asset"],
  input_ports: [],
  output_ports: portsStatingNoStreamFacts("image", "image"),
};

/**
 * The fixture view's manifest setting `picture_fit` as `graph` renders it first among its node's inputs: a Menu of the options its
 * schema lists, read as the node is set up and taking no wire, reading the default its schema states while its config holds none.
 */
const PICTURE_FIT_SETTING_INPUT: MockGraphPort = {
  name: "picture_fit",
  family: "records",
  stream_facts: null,
  values_checked: null,
  pin: { pin_type: { type: "menu", option_names: ["contain", "cover"] }, flow: "value" },
  value_read: { value: "contain", comes_from: "default" },
  takes_a_wire: false,
};

/**
 * The fixture view's node, its picture wired from the folded lights, as a project's view stands in its stream's graph: its manifest's
 * `picture_fit` setting comes first among its inputs, held in its config; its `fader` output, which its panel writes, has an input of
 * its name, a setting that takes no wire and holds no value until the panel sets one.
 */
const PICTURE_AND_FADER_VIEW_NODE: MockGraphNode = {
  name: "pictureandfader",
  type: MOCK_STUDIO_VIEW_TYPE_ID,
  state: "Running",
  config: {},
  settings: ["picture_fit"],
  input_ports: [PICTURE_FIT_SETTING_INPUT, ...portsStatingNoStreamFacts("image", "picture"), { name: "fader", family: "array", stream_facts: null, values_checked: null, pin: null, value_read: { value: null, comes_from: null }, takes_a_wire: false }],
  output_ports: portsStatingNoStreamFacts("array", "fader"),
  is_a_value_source: true,
};

/** The node wired to the fixture view's `fader` output, reading each value its panel sets. */
const FADER_METER_NODE: MockGraphNode = {
  name: "fadermeter",
  type: "nodes.fader_meter:FaderMeter",
  state: "Running",
  config: {},
  input_ports: portsStatingNoStreamFacts("array", "level"),
  output_ports: [],
};

const FADER_METER_LINK: MockGraphLink = { id: "Lf4d3rm3t3rr34d5th3f4d3r0", source_node: "pictureandfader", source_port: "fader", target_node: "fadermeter", target_port: "level", state: "wired" };

const PICTURE_AND_FADER_VIEW_LINK: MockGraphLink = {
  id: "Lp1ctur3f4d3rv13wn0d3k8q2",
  source_node: THE_FOLDED_LIGHTS.node,
  source_port: THE_FOLDED_LIGHTS.port,
  target_node: "pictureandfader",
  target_port: "picture",
  state: "wired",
};

/** An alpha-over compositor of two layers over the folded lights, the second offset and half transparent. */
const ALPHA_OVER_COMPOSITOR_NODE: MockGraphNode = {
  name: "alphaovercompositor",
  type: "tatolab.compositor.alpha_over_compositor:AlphaOverCompositor",
  state: "Running",
  config: { width: 1280, height: 720, layers: [{}, { x: 640, y: 360, opacity: 0.5 }] },
  input_ports: portsStatingNoStreamFacts("image", "layer_0", "layer_1"),
  output_ports: portsStatingNoStreamFacts("image", "composite"),
};

const ALPHA_OVER_COMPOSITOR_LINK: MockGraphLink = {
  id: "La1ph4ov3rc0mp0s1t0rl1nk0",
  source_node: THE_FOLDED_LIGHTS.node,
  source_port: THE_FOLDED_LIGHTS.port,
  target_node: "alphaovercompositor",
  target_port: "layer_0",
  state: "wired",
};

/** An MP4 recorder of `main`'s folded lights, read across streams. */
const RECORDER_OF_MAIN_NODE: MockGraphNode = {
  name: "mp4writer",
  type: "tatolab.stream:Mp4Writer",
  state: "Running",
  config: { path: "recordings/main.mp4" },
  input_ports: portsStatingNoStreamFacts("image", "video"),
  output_ports: [],
};

/** The recorder's link from `main`'s folded lights, its source named `<stream id>/<node>` as a link from another stream is. */
function recorderOfMainLink(mainStreamId: string): MockGraphLink {
  return {
    id: "Lr3c0rd3rm41nx7q2w9e5t1y8u",
    source_node: `${mainStreamId}/${THE_FOLDED_LIGHTS.node}`,
    source_port: THE_FOLDED_LIGHTS.port,
    target_node: "mp4writer",
    target_port: "video",
    state: "wired",
  };
}

/** The link of `graph` from `source`'s port `sourcePort` into `target`'s port `targetPort`; a recording without it no longer holds Pulse Stage. */
function linkOfTheGraph(graph: MockStreamGraph, sourceNode: string, sourcePort: string, targetNode: string, targetPort: string): MockGraphLink {
  const link = graph.links.find((candidate) => candidate.source_node === sourceNode && candidate.source_port === sourcePort && candidate.target_node === targetNode && candidate.target_port === targetPort);
  if (link === undefined) throw new Error(`Pulse Stage's recorded graph holds no link ${sourceNode}.${sourcePort} -> ${targetNode}.${targetPort}`);
  return link;
}

/** Pulse Stage's glow falling behind: its link from the kaleidoscope drops frames and the kaleidoscope's output refuses a few. */
function glowFallingBehind(graph: MockStreamGraph): MockCounterRates {
  return {
    droppedPerSecondByLinkId: { [linkOfTheGraph(graph, "kaleidoscope", "result", "glow", "video_in").id]: 9 },
    refusedPerSecondByOutput: [{ node: "kaleidoscope", port: "result", perSecond: 2 }],
  };
}

/** The node whose helper process the stream's log names, and the class it runs: Pulse Stage's click track. */
const CLICK_TRACK = { node: "click", entrypoint: "nodes.click_track:ClickTrack" } as const;

/** Pulse Stage's stream asset `streamName` in `projectDirectory`, shown as `displayName`: its stream `main` as the runtime's `graph` answered it, with the extra nodes `options` asks for. */
function createPulseStageStream(
  machine: MockMachine,
  options: {
    projectDirectory: string;
    /** Its stream asset's name, which the stream's id is computed from. */
    streamName: string;
    displayName: string;
    withTheSpeakerInError: boolean;
    withTheGlowFallingBehind: boolean;
    /** The id of the stream a recorder reads the folded lights of, a link whose source is in another stream; `null` for none. */
    recordsTheStream: string | null;
    withTheFixtureViewsNode: boolean;
    withTheCompositorNode: boolean;
    withExtraGraphInputs: boolean;
    withAnImageFileNotReady: boolean;
  },
): MockStreamFixture {
  const { projectDirectory, recordsTheStream } = options;
  const recorded = mockRecordedGraphOfThePulseStageSample();
  const nodes: MockGraphNode[] = [
    ...recorded.nodes.map((node) => (options.withTheSpeakerInError && node.name === "speaker" ? { ...node, state: "Error", failed_because: SPEAKER_FAILED_BECAUSE } : node)),
    ...(recordsTheStream === null ? [] : [RECORDER_OF_MAIN_NODE]),
    ...(options.withTheFixtureViewsNode ? [PICTURE_AND_FADER_VIEW_NODE, FADER_METER_NODE] : []),
    ...(options.withTheCompositorNode ? [ALPHA_OVER_COMPOSITOR_NODE] : []),
    ...(options.withExtraGraphInputs ? EXTRA_GRAPH_INPUTS : []),
    ...(options.withAnImageFileNotReady ? [IMAGE_FILE_NOT_READY_NODE] : []),
  ];
  const links: MockGraphLink[] = [
    ...recorded.links.map((link) => (options.withTheSpeakerInError && link.target_node === "speaker" ? { ...link, state: "error" as const } : link)),
    ...(recordsTheStream === null ? [] : [recorderOfMainLink(recordsTheStream)]),
    ...(options.withTheFixtureViewsNode ? [PICTURE_AND_FADER_VIEW_LINK, FADER_METER_LINK] : []),
    ...(options.withTheCompositorNode ? [ALPHA_OVER_COMPOSITOR_LINK] : []),
  ];
  const listing = runningListing({ project_directory: projectDirectory, stream_name: options.streamName }, options.displayName, nodes.length);
  const streamId = listing.stream;
  const bar = (dueAt: number, index: number): MockLogRecordDraft => ({
    millisecondsAfterLoad: dueAt,
    source: "python",
    level: "info",
    target: PYTHON_HELPER_TARGET,
    message: "bar",
    attrs: { beat: String(4 * index) },
    node: CLICK_TRACK.node,
  });
  return {
    listing,
    graph: { ...recorded, nodes, links, counterRates: options.withTheGlowFallingBehind ? glowFallingBehind(recorded) : NO_COUNTERS_CLIMB },
    startupLog: [
      ...loadingLines(machine, streamId, projectDirectory),
      {
        millisecondsAfterLoad: 399,
        source: "rust",
        level: "info",
        target: SPAWN_HOST_TARGET,
        message: `[${CLICK_TRACK.node}] helper process started: pid=65123, entrypoint=${CLICK_TRACK.entrypoint}`,
      },
      ...(options.withTheSpeakerInError
        ? [
            {
              millisecondsAfterLoad: 784,
              source: "rust",
              level: "error",
              target: "streamlib_media_builtins::speaker_sink",
              message: "SpeakerSink: no audio output — running degraded (audio drained, nothing played)",
              node: "speaker",
            } satisfies MockLogRecordDraft,
          ]
        : []),
    ],
    createLiveLogWriter: () => {
      const barsDue = cadence(2000, 1493);
      let barCount = 0;
      const escalateWarningDue = once(2772);
      const fellBehindDue = recordsTheStream === null && !options.withTheSpeakerInError ? once(4120) : once(Number.POSITIVE_INFINITY);
      return (millisecondsSinceLoad) => [
        ...barsDue(millisecondsSinceLoad).map((dueAt) => {
          barCount += 1;
          return bar(dueAt, barCount);
        }),
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
        ...fellBehindDue(millisecondsSinceLoad).map(
          (dueAt): MockLogRecordDraft => ({
            millisecondsAfterLoad: dueAt,
            source: "python",
            level: "warn",
            target: PYTHON_HELPER_TARGET,
            message: "ClickTrack fell behind and starts again at now",
            attrs: { blocks_behind: "11" },
            node: CLICK_TRACK.node,
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
  const listing = runningListing({ project_directory: projectDirectory, stream_name: "main" }, "camera", 4);
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
          output_ports: [imageOutputAtFramesPerSecond("video", 30)],
        },
        {
          name: "microphonesource",
          type: "tatolab.stream:MicrophoneSource",
          state: "Running",
          config: { sample_rate: 48000 },
          input_ports: [],
          output_ports: portsStatingNoStreamFacts("channels", "audio"),
        },
        {
          name: "displaywindow",
          type: "tatolab.stream:DisplayWindow",
          state: "Running",
          config: { title: "Camera", scaling: "fit" },
          input_ports: [textureInput("video")],
          output_ports: [],
        },
        {
          name: "levelmeter",
          type: "nodes.level_meter:LevelMeter",
          state: "Running",
          config: {},
          input_ports: portsStatingNoStreamFacts("channels", "audio_from_upstream"),
          output_ports: [],
        },
        {
          name: "h264encoder",
          type: "tatolab.h264:H264Encoder",
          state: "Running",
          config: { bitrate_bps: 4_000_000, keyframe_interval_frames: 30 },
          input_ports: portsStatingNoStreamFacts("image", "video"),
          output_ports: [
            {
              name: "encoded",
              family: "packets",
              stream_facts: {
                facts_of: "encoded_units",
                type: null,
                rfc6381_codec: "avc1.64001f",
                coded_width: 1920,
                coded_height: 1080,
                sample_rate: null,
                channel_count: null,
                codec_configuration_byte_length: null,
              },
              values_checked: null,
              pin: null,
              value_read: null,
            },
          ],
        },
      ],
      links: [
        { id: "Lc8m2w0d1k4q9s7f3x5v6b2nr", source_node: "camerasource", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" },
        { id: "Le2n8c0d3r5h6k1q4w7y9z2tb", source_node: "camerasource", source_port: "video", target_node: "h264encoder", target_port: "video", state: "wired" },
        {
          id: "Lm4t7y1u3i9o0p2a5s8d6f1gh",
          source_node: "microphonesource",
          source_port: "audio",
          target_node: "levelmeter",
          target_port: "audio_from_upstream",
          state: "wired",
        },
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

/** The folder Pulse Stage's streams are run from. */
function pulseStageProjectDirectory(machine: MockMachine): string {
  return `${machine.homeDirectory}/streams/pulse-stage`;
}

/** A second stream of the project, its lights alone, that its owner stopped with `tatolab stop`. */
function stoppedRehearsalListing(machine: MockMachine): ListedStream {
  const address = { project_directory: pulseStageProjectDirectory(machine), stream_name: "rehearsal" };
  return { stream: mockStreamIdOf(address), display_name: "rehearsal", location: mockStreamLocationOf(address), state: "stopped", node_count: null, failed_because: null, capture_devices_whose_access_was_never_asked_for: [], condition: null, action: null, step: null };
}

/** A stream that could not load at the runtime's start. */
function failedLobbyRecorderListing(machine: MockMachine): ListedStream {
  const address = { project_directory: `${machine.homeDirectory}/streams/lobby-recorder`, stream_name: "main" };
  return { stream: mockStreamIdOf(address), display_name: "lobby-recorder", location: mockStreamLocationOf(address), state: "failed", node_count: null, failed_because: machine.cameraFailure, capture_devices_whose_access_was_never_asked_for: [], condition: null, action: null, step: null };
}

/** Why the runtime failed `main` in the mock's `?state=refused-at-play`: a play that refused a link from a function node into a node in the app process, in the runtime's words. */
const MOCK_MAIN_REFUSED_AT_PLAY_BECAUSE =
  "Invalid link: link `Lkrgygd6qubqrj4jviamzuzfw` feeds a function node island into `speaker`, which runs in the app process; a function node runs inside the read of a node in a helper process, and the app process runs no node code";

/** `stream` with each node that reports a state stopped, as the runtime holds the graph of a stream that does not play. */
function mockStreamWithItsNodesStopped(stream: MockStreamFixture): MockStreamFixture {
  return { ...stream, graph: { ...stream.graph, nodes: stream.graph.nodes.map((node) => (node.state === null ? node : { ...node, state: "Stopped" })) } };
}

/**
 * `main` as the runtime holds it: as chosen; with its nodes stopped (`?node_states=stopped`); or failed in the runtime's
 * words with its graph still held, stopped, as after a play it refused (`?state=refused-at-play`).
 */
export function mockMainStreamAsTheRuntimeHoldsIt(main: MockStreamFixture, held: "as_chosen" | "nodes_stopped" | "refused_at_play"): MockStreamFixture {
  switch (held) {
    case "as_chosen":
      return main;
    case "nodes_stopped":
      return mockStreamWithItsNodesStopped(main);
    case "refused_at_play": {
      const stopped = mockStreamWithItsNodesStopped(main);
      return { ...stopped, listing: { ...stopped.listing, state: "failed", failed_because: MOCK_MAIN_REFUSED_AT_PLAY_BECAUSE } };
    }
  }
}

/** The machine the mock runtime runs on for `platform`, and the streams it lists. */
export interface MockStreamFixtures {
  machine: MockMachine;
  mainStream: MockStreamFixture;
  mainStreamWithTheSpeakerInError: MockStreamFixture;
  /** `main` with its glow falling behind, so a link drops frames. */
  mainStreamWithItsGlowFallingBehind: MockStreamFixture;
  /** `main` with the fixture view's node, its picture wired from the folded lights. */
  mainStreamWithTheFixtureViewsNode: MockStreamFixture;
  /** `main` with an alpha-over compositor of two layers on the folded lights. */
  mainStreamWithTheCompositorNode: MockStreamFixture;
  /** `main` declaring a Graph Input of each family a client writes beside its own `speed` and `segments`. */
  mainStreamDeclaringExtraGraphInputs: MockStreamFixture;
  /** `main` with an `ImageFile` that names no asset, so it reports itself not ready. */
  mainStreamWithAnImageFileNotReady: MockStreamFixture;
  /** `main` holding each graph `?main_graph=` names: one recorded from a sample, with a stand-in warned link or a stand-in node with bundle pins, or the large graph of the canvas measurements. */
  mainStreamHoldingTheGraph: Record<MockMainGraph, MockStreamFixture>;
  cameraStream: MockStreamFixture;
  /** The camera stream as the runtime re-loads it at its start before anyone has asked for camera access. */
  cameraStreamWaitingForCameraAccess: MockStreamFixture;
  /** A recorder in Pulse Stage's folder reading `main`'s folded lights, a link whose source is in another stream. */
  recorderOfMainStream: MockStreamFixture;
  stoppedRehearsal: ListedStream;
  /** `rehearsal` once started again. */
  rehearsalStream: MockStreamFixture;
  failedLobbyRecorder: ListedStream;
  /** A record an earlier runtime wrote, which names no location and is listed failed until it is removed. */
  earlierRuntimesRecord: ListedStream;
  /** The folder Pulse Stage's streams are run from. */
  pulseStageProjectDirectory: string;
  /** The order the runtime lists its streams in, by id. */
  listingOrder: readonly string[];
}

/** The options of a Pulse Stage stream with no extra node. */
function plainPulseStageStreamOptions(projectDirectory: string, streamName: string, displayName: string): Parameters<typeof createPulseStageStream>[1] {
  return {
    projectDirectory,
    streamName,
    displayName,
    withTheSpeakerInError: false,
    withTheGlowFallingBehind: false,
    recordsTheStream: null,
    withTheFixtureViewsNode: false,
    withTheCompositorNode: false,
    withExtraGraphInputs: false,
    withAnImageFileNotReady: false,
  };
}

/** The mock runtime's machine and streams as they look on `platform`. */
export function createMockStreamFixtures(platform: TatolabPlatform): MockStreamFixtures {
  const machine = MOCK_MACHINES[platform];
  const projectDirectory = pulseStageProjectDirectory(machine);
  const mainStreamOptions = plainPulseStageStreamOptions(projectDirectory, "main", "main");
  const mainStream = createPulseStageStream(machine, mainStreamOptions);
  const cameraStream = createCameraStream(machine);
  const recorderOfMainStream = createPulseStageStream(machine, { ...mainStreamOptions, streamName: "recorder", displayName: "recorder", recordsTheStream: mainStream.listing.stream });
  const stoppedRehearsal = stoppedRehearsalListing(machine);
  const failedLobbyRecorder = failedLobbyRecorderListing(machine);
  return {
    machine,
    mainStream,
    mainStreamWithTheSpeakerInError: createPulseStageStream(machine, { ...mainStreamOptions, withTheSpeakerInError: true }),
    mainStreamWithItsGlowFallingBehind: createPulseStageStream(machine, { ...mainStreamOptions, withTheGlowFallingBehind: true }),
    mainStreamWithTheFixtureViewsNode: createPulseStageStream(machine, { ...mainStreamOptions, withTheFixtureViewsNode: true }),
    mainStreamWithTheCompositorNode: createPulseStageStream(machine, { ...mainStreamOptions, withTheCompositorNode: true }),
    mainStreamDeclaringExtraGraphInputs: createPulseStageStream(machine, { ...mainStreamOptions, withExtraGraphInputs: true }),
    mainStreamWithAnImageFileNotReady: createPulseStageStream(machine, { ...mainStreamOptions, withAnImageFileNotReady: true }),
    mainStreamHoldingTheGraph: mapEachMockMainGraph((graph) => ({ ...mainStream, listing: { ...mainStream.listing, node_count: graph.nodes.length }, graph })),
    cameraStream,
    cameraStreamWaitingForCameraAccess: { ...cameraStream, listing: { ...cameraStream.listing, capture_devices_whose_access_was_never_asked_for: ["camera"] } },
    recorderOfMainStream,
    stoppedRehearsal,
    rehearsalStream: createPulseStageStream(machine, plainPulseStageStreamOptions(projectDirectory, "rehearsal", "rehearsal")),
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
      condition: null,
      action: null,
      step: null,
    },
    pulseStageProjectDirectory: projectDirectory,
    listingOrder: [mainStream.listing.stream, cameraStream.listing.stream, recorderOfMainStream.listing.stream, stoppedRehearsal.stream, failedLobbyRecorder.stream],
  };
}

/** The stream a project folder run from the window loads from `projectDirectory`'s stream asset `streamName`, shown as `displayName`: Pulse Stage's stream `main`. */
export function createMockStreamRunFromAProjectFolder(machine: MockMachine, projectDirectory: string, streamName: string, displayName: string): MockStreamFixture {
  return { ...createPulseStageStream(machine, plainPulseStageStreamOptions(projectDirectory, streamName, displayName)), loadedForMillisecondsAtOpen: 0 };
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
