// Everything a view reads from Tato Studio, as plain types: Studio's own build writes what crosses a
// view's MessagePort to it, so a view takes it as typed and parses none of it. What someone else
// wrote is decoded on the Studio's side, by the Schemas of `./studio_host`, each held to a type here.
// A graph action and a graph edit mode are the control contract's own types.

import type {
  AudioCaptureDeviceKindOnTheWire,
  AudioCaptureDeviceOnTheWire,
  BundleMemberValueReadOnTheWire,
  CheckLinkCandidatesRequest,
  GraphEditMode,
  GraphFragmentOnTheWire,
  GraphInterfacePortOnTheWire,
  GraphLinkOnTheWire,
  GraphNodeKindOnTheWire,
  GraphNodeOnTheWire,
  GraphNodePortOnTheWire,
  InputValueComesFromOnTheWire,
  LabelledNodeGroup,
  LinkCandidateEnd,
  LinkCandidatesCheckResult,
  LinkCheckResult,
  ListAudioCaptureDevicesToolResult,
  ListNodeTypesToolResult,
  NodeTypeDescribedOrWhyNot,
  NodeTypeDescription,
  PinLinkWarningOnTheWire,
  StreamGraphAction,
  StreamGraphActionLinkEnd,
  StreamGraphOnTheWire,
} from "@tatolab/runtime-client/contract";
import type { PinFlow, PinType } from "./pin_type_readings.js";
import type { PortFamily } from "./port_families.js";

export { jsonTextOf } from "./json_text.js";

/** A value as JSON carries it. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Whether `value` is a value as JSON carries it: `null`, true or false, a finite number, text, or an array or object of them. */
export function isAJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAJsonValue);
  return typeof value === "object" && Object.values(value).every(isAJsonValue);
}

/** Where a stream lives: its project directory as of its last load, symlinks resolved, and the two UUIDs that identify it, its project's and its stream asset's. */
export type StreamLocation = {
  project_directory: string;
  /** The project's UUID, from its `tatolab-project.json`. */
  project: string;
  /** The stream asset's UUID, from its graph document. */
  stream_asset: string;
};

/** Whether a stream's graph is loaded in the runtime; a value newer than this app reads as `not_loaded`. */
export type StreamLoad = "loading" | "loaded" | "unloading" | "not_loaded";

/** Whether a stream plays; a value newer than this app reads as `stopped`. */
export type StreamPlayback = "starting" | "playing" | "paused" | "stopping" | "stopped";

/** Whether a stream is healthy; a value newer than this app reads as `failed`. */
export type StreamHealth = "healthy" | "degraded" | "failed";

/** What a problem of a stream or a node is; a kind newer than this app reads as `other`, shown by its words. */
export type StreamDiagnosticKind =
  | "project_venv_not_made"
  | "load_refused"
  | "start_refused"
  | "node_type_not_described"
  | "link_refused"
  | "keeps_crashing_the_runtime"
  | "recorded_by_an_earlier_runtime"
  | "node_failed"
  | "node_raising"
  | "node_not_ready"
  | "edit_not_live"
  | "other";

/** What recovers from a problem; a recovery newer than this app reads as `retry_the_load`. */
export type StreamDiagnosticRecovery =
  | "fix_the_code"
  | "fix_the_dependencies"
  | "fix_the_link"
  | "restart_the_playback"
  | "remove_the_stream"
  | "wait_for_the_node"
  | "retry_the_load";

/** Where a problem applies: the stream as a whole, one node by its graph `id` and name, or one link by the node names and ports its document draws it between. */
export type StreamDiagnosticPlace =
  | { on: "stream" }
  | { on: "node"; node_id: string; node_name: string }
  | { on: "link"; from_node: string; from_port: string; to_node: string; to_port: string };

/** One problem a stream or a node has: what it is, where it applies, the runtime's words for it, never rewritten, and what recovers from it. */
export type StreamDiagnostic = { kind: StreamDiagnosticKind; place: StreamDiagnosticPlace; words: string; recovery: StreamDiagnosticRecovery };

/** What a view asks Studio to recover a project's streams with: their playback stopped and started again, or the project read again from disk. */
export type ProjectStreamsRecovery = "restart_the_playback" | "reload_the_project";

/** A stream's load, playback and health, each apart, and every problem behind its health: the stream's own, then each of its nodes'. */
export type StreamCondition = { load: StreamLoad; playback: StreamPlayback; health: StreamHealth; diagnostics: StreamDiagnostic[] };

/** One stream the runtime lists. `state` is running, stopped, failed, preparing or stopping, or a state newer than this app. */
export type ListedStream = {
  /** Its stream id, `<project name>-<stream name>-<hash>`, which every tool about one stream names it by. */
  stream: string;
  /** The label the runtime shows it under; free text, and never unique. */
  display_name: string;
  /** `null` for a record an earlier runtime wrote, which is listed failed until it is removed. */
  location: StreamLocation | null;
  state: string;
  /** How many nodes its loaded graph holds; `null` while it is not loaded. */
  node_count: number | null;
  failed_because: string | null;
  /** Each capture device, `camera` or `microphone` or one newer than this app, that a node of the loaded stream refused because nobody has asked the person for its access; empty when it is not loaded. */
  capture_devices_whose_access_was_never_asked_for: string[];
  /** Its load, playback and health, with every problem behind its health; `null` from a runtime that lists no condition. */
  condition: StreamCondition | null;
  /** The stream action queued or under way on it while it is `preparing` or `stopping`; `null` otherwise. */
  action: string | null;
  /** That action's step, or one newer than this app; `null` while the action waits in its project's queue, and while no action works on it. */
  step: string | null;
};

/** An Image stream's frame rate, as a rational number of frames per second. */
export type ImageStreamFrameRate = { numerator: number; denominator: number };

/** An HDR stream's content light level, in cd/m² (CTA-861.3). */
export type ImageStreamContentLightLevel = { max_content_light_level: number; max_frame_average_light_level: number };

/** The mastering display an HDR stream was graded on (SMPTE ST 2086): luminance in steps of 0.0001 cd/m². */
export type ImageStreamMasteringDisplayColourVolume = { max_display_mastering_luminance: number; min_display_mastering_luminance: number };

/**
 * An output port's stream facts as the runtime renders them under `stream_facts`, read by the pin type they name under `type`:
 * a Texture's facts of its pictures, or an encoded type's facts of its codec, which both encoded types state alike. `type` is
 * `null` for the facts of a port with no pin type, which the runtime names by their family alone. A field the port does not
 * state is `null`.
 */
export type PortStreamFacts =
  | {
      facts_of: "pictures";
      type: "texture" | null;
      frame_rate: ImageStreamFrameRate | null;
      content_light_level: ImageStreamContentLightLevel | null;
      mastering_display_colour_volume: ImageStreamMasteringDisplayColourVolume | null;
    }
  | {
      facts_of: "encoded_units";
      type: "encoded_video" | "encoded_audio" | null;
      /** The codec with its profile and level, as an RFC 6381 `codecs` parameter spells it (`avc1.64001f`, `opus`). */
      rfc6381_codec: string | null;
      coded_width: number | null;
      coded_height: number | null;
      sample_rate: number | null;
      channel_count: number | null;
      /** The bytes of the codec's out-of-band configuration record (`avcC`, `hvcC`, `OpusHead`), from its lowercase hex. */
      codec_configuration_byte_length: number | null;
    };

/** A stream's graph and its parts, as the runtime's `graph` answers them: the control contract's own types, passed on unchanged. */
export type {
  StreamGraphOnTheWire as StreamGraph,
  GraphNodeOnTheWire as StreamGraphNode,
  GraphNodePortOnTheWire as StreamGraphPort,
  GraphLinkOnTheWire as StreamGraphLink,
  PinLinkWarningOnTheWire as StreamGraphLinkWarning,
  LabelledNodeGroup as StreamGraphGroup,
  GraphFragmentOnTheWire as StreamGraphFragment,
  GraphInterfacePortOnTheWire as StreamGraphInterfacePort,
  GraphNodeKindOnTheWire as StreamGraphNodeKind,
  InputValueComesFromOnTheWire as InputValueComesFrom,
};

/** The node types a project offers and how each is described, as the runtime's `list_node_types` and `describe_node_types` answer them: the control contract's own types, passed on unchanged. */
export type {
  ListNodeTypesToolResult,
  DescribeNodeTypesToolResult,
  NodeTypeSourceListed,
  NodeTypeListed,
  GraphGeneratorListed,
  GraphGeneratorPromotedSettingReadFromSource,
  NodeModuleNotReadable,
  NodeTypeDescribedOrWhyNot,
  NodeTypeDescription,
  NodeTypeNotDescribed,
  NodeTypeInputDescribed,
  NodeTypePortDescribed,
  NodeTypeInputMode,
  SettingReadTime,
} from "@tatolab/runtime-client/contract";

/** The pin type a port of a running graph carries, resolved, and its flow, which the runtime serves together. */
export type StreamGraphPortPin = { pin_type: PinType; flow: PinFlow };

/** The pin type and flow `port` carries; `null` on a port the runtime serves neither for, because its code does not state its type exactly, which links by its family alone. */
export function pinOfThePort(port: Pick<GraphNodePortOnTheWire, "pin_type" | "flow">): StreamGraphPortPin | null {
  return port.pin_type === undefined || port.flow === undefined ? null : { pin_type: port.pin_type, flow: port.flow };
}

/** Whether a port carrying `pinType` may carry a picture: a Texture, or a port of no exact type, which the Node visualizer plays as one. */
export function mayCarryAPicture(pinType: PinType | null | undefined): boolean {
  return pinType === null || pinType === undefined || pinType.type === "texture";
}

/** The value an input reads while unlinked, `null` while a link feeds it or it reads none, and where it comes from, `null` while it reads none. */
export type StreamGraphInputValueRead = { value: JsonValue | null; comes_from: InputValueComesFromOnTheWire | null };

/** A change the runtime announced of what one input of a running graph reads, or one member of a bundle input (`member` `null` for the whole input), its node named by its graph `id`. */
export type StreamGraphInputValueChange = { node: string; input: string; member: string | null; value_read: StreamGraphInputValueRead };

/**
 * What an input of a graph, or an `input_value_changed` naming one, says it reads while unlinked and where that comes from:
 * a link that feeds it serves `value_comes_from` `wire` and no `value`, one that reads nothing a `null` value alone. `null` for
 * an input that takes no stored value, serving neither, and for an output.
 */
export function inputValueReadOfThePort(port: { readonly value?: unknown; readonly value_comes_from?: InputValueComesFromOnTheWire | null | undefined }): StreamGraphInputValueRead | null {
  const comesFrom = port.value_comes_from;
  if (comesFrom === undefined || comesFrom === null) return port.value === null ? { value: null, comes_from: null } : null;
  if (comesFrom === "wire") return { value: null, comes_from: "wire" };
  return isAJsonValue(port.value) ? { value: port.value, comes_from: comesFrom } : null;
}

/** What each member of a bundle input reads, by name in the order the bundle declares them, as its `member_values` serves them; empty on every other input, which serves none. */
export function memberValueReadsOfThePort(port: { readonly member_values?: readonly BundleMemberValueReadOnTheWire[] | null | undefined }): readonly { member: string; value_read: StreamGraphInputValueRead }[] {
  return (port.member_values ?? []).flatMap((row) => {
    const valueRead = inputValueReadOfThePort(row);
    return valueRead === null ? [] : [{ member: row.member, value_read: valueRead }];
  });
}

/** What each shape of `Facts` is of, and the pin type it names: one pair for each shape. */
type WhatEachIsOf<Facts extends PortStreamFacts> = Facts extends PortStreamFacts ? Pick<Facts, "facts_of" | "type"> : never;

/**
 * What a port's facts are of, by the pin type they name under `type`, else, on a port with no pin type, which names none or a
 * `null` one, by their family; `null` for a type or family whose stream no facts describe.
 */
function whatTheStreamFactsAreOf(streamFacts: { readonly [key: string]: unknown }): WhatEachIsOf<PortStreamFacts> | null {
  const pinTypeName = streamFacts["type"];
  if (pinTypeName === "texture") return { facts_of: "pictures", type: pinTypeName };
  if (pinTypeName === "encoded_video" || pinTypeName === "encoded_audio") return { facts_of: "encoded_units", type: pinTypeName };
  if (pinTypeName !== undefined && pinTypeName !== null) return null;
  if (streamFacts["family"] === "image") return { facts_of: "pictures", type: null };
  if (streamFacts["family"] === "packets") return { facts_of: "encoded_units", type: null };
  return null;
}

/** What an output states under `stream_facts` about the stream it carries now; `null` for none, or facts of a type or shape this app does not read, which only describe a stream. */
export function streamFactsOfThePort(port: { readonly stream_facts?: unknown }): PortStreamFacts | null {
  const streamFacts = jsonObjectOrNull(port.stream_facts);
  if (streamFacts === null) return null;
  const factsOf = whatTheStreamFactsAreOf(streamFacts);
  if (factsOf === null) return null;
  if (factsOf.facts_of === "pictures") {
    const frameRate = jsonObjectOrNull(streamFacts["frame_rate"]);
    const lightLevel = jsonObjectOrNull(streamFacts["content_light_level"]);
    const colourVolume = jsonObjectOrNull(streamFacts["mastering_display_colour_volume"]);
    const numerator = wholeNumberOrNull(frameRate?.["numerator"]);
    const denominator = wholeNumberOrNull(frameRate?.["denominator"]);
    const maxContentLightLevel = wholeNumberOrNull(lightLevel?.["max_content_light_level"]);
    const maxFrameAverageLightLevel = wholeNumberOrNull(lightLevel?.["max_frame_average_light_level"]);
    const maxLuminance = wholeNumberOrNull(colourVolume?.["max_display_mastering_luminance"]);
    const minLuminance = wholeNumberOrNull(colourVolume?.["min_display_mastering_luminance"]);
    return {
      ...factsOf,
      frame_rate: numerator === null || denominator === null || numerator === 0 || denominator === 0 ? null : { numerator, denominator },
      content_light_level:
        maxContentLightLevel === null || maxFrameAverageLightLevel === null ? null : { max_content_light_level: maxContentLightLevel, max_frame_average_light_level: maxFrameAverageLightLevel },
      mastering_display_colour_volume: maxLuminance === null || minLuminance === null ? null : { max_display_mastering_luminance: maxLuminance, min_display_mastering_luminance: minLuminance },
    };
  }
  const codecConfigurationHex = streamFacts["codec_configuration_hex"];
  return {
    ...factsOf,
    rfc6381_codec: typeof streamFacts["rfc6381_codec"] === "string" ? streamFacts["rfc6381_codec"] : null,
    coded_width: wholeNumberOrNull(streamFacts["coded_width"]),
    coded_height: wholeNumberOrNull(streamFacts["coded_height"]),
    sample_rate: wholeNumberOrNull(streamFacts["sample_rate"]),
    channel_count: wholeNumberOrNull(streamFacts["channel_count"]),
    codec_configuration_byte_length: typeof codecConfigurationHex === "string" ? Math.floor(codecConfigurationHex.length / 2) : null,
  };
}

function isAnObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObjectOrNull(value: unknown): { readonly [key: string]: unknown } | null {
  return isAnObject(value) ? value : null;
}

function wholeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** A point or a size on the canvas, `[x, y]` or `[width, height]`. */
export type StudioCanvasPair = [number, number];

/** A node's fixed `studio` fields, each `null` while the graph document holds none, and `metadata` what a client keeps beside them; written back whole, an unset field stays unset. */
export type StreamGraphNodeStudioFields = {
  position: StudioCanvasPair | null;
  /** The labelled group it belongs to, by the group's UUID. */
  group: string | null;
  comment: string | null;
  colour: string | null;
  collapsed: boolean | null;
  metadata: { [key: string]: JsonValue };
};

/** The `studio` fields of a node whose graph document sets none. */
export const NODE_STUDIO_FIELDS_NONE_SET: Readonly<StreamGraphNodeStudioFields> = Object.freeze({ position: null, group: null, comment: null, colour: null, collapsed: null, metadata: Object.freeze({}) });

/** The studio contract version this app reads; a `studio` under another version is read as a free map. */
const STUDIO_CONTRACT_READ = 1;

/** A UUID in any text form the runtime's `Uuid::parse_str` takes: hyphenated, simple, braced or `urn:uuid:`. */
const A_UUID = /^(?:urn:uuid:)?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[0-9a-f]{32})$/i;

/** `[x, y]` as two finite numbers; `null` for anything else. */
function canvasPairOrNull(value: unknown): StudioCanvasPair | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second]: unknown[] = value;
  return typeof first === "number" && Number.isFinite(first) && typeof second === "number" && Number.isFinite(second) ? [first, second] : null;
}

/** One fixed key of a node's `studio` read into `fields`; whether its value had the key's shape. */
function readANodeStudioFixedKey(fields: StreamGraphNodeStudioFields, key: string, value: unknown): boolean {
  switch (key) {
    case "position": {
      const position = canvasPairOrNull(value);
      if (position !== null) fields.position = position;
      return position !== null;
    }
    case "group":
      if (typeof value === "string" && A_UUID.test(value)) fields.group = value;
      return typeof value === "string" && A_UUID.test(value);
    case "comment":
      if (typeof value === "string") fields.comment = value;
      return typeof value === "string";
    case "colour":
      if (typeof value === "string") fields.colour = value;
      return typeof value === "string";
    case "collapsed":
      if (typeof value === "boolean") fields.collapsed = value;
      return typeof value === "boolean";
    default:
      return false;
  }
}

/** Each node's `studio` already read, by the object the graph serves under that key, so one reading gives the same fields however often it is asked. */
const STUDIO_FIELDS_READ = new WeakMap<object, StreamGraphNodeStudioFields>();

/**
 * What Tato Studio draws `node` with, read from its `studio` key as the runtime reads it: under the studio contract, each fixed
 * key of its shape, a key the runtime would refuse to write read as absent; in a free map written before the contract, every
 * key that does not read kept under `metadata`.
 */
export function studioFieldsOfTheNode(node: Pick<GraphNodeOnTheWire, "studio">): Readonly<StreamGraphNodeStudioFields> {
  const studio = node.studio;
  if (studio === undefined) return NODE_STUDIO_FIELDS_NONE_SET;
  const readBefore = STUDIO_FIELDS_READ.get(studio);
  if (readBefore !== undefined) return readBefore;
  const isUnderTheContract = studio["contract"] === STUDIO_CONTRACT_READ;
  const metadataOnTheWire = studio["metadata"];
  const metadata = jsonObjectOrNull(metadataOnTheWire);
  const fields: StreamGraphNodeStudioFields = {
    ...NODE_STUDIO_FIELDS_NONE_SET,
    metadata:
      metadata !== null
        ? Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1])))
        : !isUnderTheContract && isAJsonValue(metadataOnTheWire)
          ? { metadata: metadataOnTheWire }
          : {},
  };
  for (const [key, value] of Object.entries(studio)) {
    if ((key === "contract" && isUnderTheContract) || key === "metadata") continue;
    if (!readANodeStudioFixedKey(fields, key, value) && !isUnderTheContract && isAJsonValue(value)) fields.metadata[key] = value;
  }
  STUDIO_FIELDS_READ.set(studio, fields);
  return fields;
}

/** A canvas note of a stream's graph: text at a position and size, beside the nodes. */
export type StreamGraphNote = {
  id: string;
  text: string;
  position: StudioCanvasPair;
  size: StudioCanvasPair;
};

/** Each graph's canvas notes already read, by the object the graph serves under `studio`. */
const CANVAS_NOTES_READ = new WeakMap<object, readonly StreamGraphNote[]>();

/** The canvas notes the graph's `studio.notes` holds, each one the runtime would refuse (no id or text, or no two-number position or size) left out rather than losing the graph over. */
export function canvasNotesOfTheGraph(graph: Pick<StreamGraphOnTheWire, "studio">): readonly StreamGraphNote[] {
  const studio = jsonObjectOrNull(graph.studio);
  if (studio === null) return [];
  const readBefore = CANVAS_NOTES_READ.get(studio);
  if (readBefore !== undefined) return readBefore;
  const notesOnTheWire: unknown = studio["notes"];
  const notes = (Array.isArray(notesOnTheWire) ? notesOnTheWire : []).flatMap((noteOnTheWire: unknown): StreamGraphNote[] => {
    const note = jsonObjectOrNull(noteOnTheWire);
    const position = canvasPairOrNull(note?.["position"]);
    const size = canvasPairOrNull(note?.["size"]);
    const id = note?.["id"];
    const text = note?.["text"];
    return typeof id === "string" && typeof text === "string" && position !== null && size !== null ? [{ id, text, position, size }] : [];
  });
  CANVAS_NOTES_READ.set(studio, notes);
  return notes;
}

/** How a subgraph came to be: `generated` is a `@graph_generator`'s frozen output, its node's `type` the generator; `placed_stream` a stream placed by reference (`tatolab.project:StreamFragment`), which a collapse saves the selection as. */
export type StreamGraphFragmentKind = "generated" | "placed_stream";

/** The node type of another stream placed by reference (`STREAM_FRAGMENT_NODE_TYPE` in streamlib). */
const STREAM_FRAGMENT_NODE_TYPE = "tatolab.project:StreamFragment";

/** How the subgraph `node` holds came to be, by its type. */
export function fragmentKindOfTheNode(node: Pick<GraphNodeOnTheWire, "type">): StreamGraphFragmentKind {
  return node.type === STREAM_FRAGMENT_NODE_TYPE ? "placed_stream" : "generated";
}

/** The fragment of a node of `kind` `fragment` that serves none: it holds nothing. */
const AN_EMPTY_FRAGMENT: GraphFragmentOnTheWire = Object.freeze({ nodes: [], links: [], groups: [] });

/** What `node` holds when it is a subgraph, an empty graph for a fragment that serves none; `null` on every other node. */
export function fragmentOfTheNode(node: Pick<GraphNodeOnTheWire, "kind" | "fragment">): GraphFragmentOnTheWire | null {
  return node.fragment ?? (node.kind === "fragment" ? AN_EMPTY_FRAGMENT : null);
}

/** The port `node` declares for its stream when it is a `GraphInput` or `GraphOutput` the runtime renders as one; `null` on every other node. */
export function graphInterfacePortOfTheNode(node: Pick<GraphNodeOnTheWire, "components">): GraphInterfacePortOnTheWire | null {
  return node.components.graph_interface ?? null;
}

/** Whether the running graph holds `part`, a node or a link: the runtime marks `live: false` on one its graph document holds that the running stream has not taken yet. */
export function isLiveInTheRunningGraph(part: Pick<GraphNodeOnTheWire | GraphLinkOnTheWire, "live">): boolean {
  return part.live !== false;
}

/** The bags `node` lost on its inbound link `linkId`, `0` where it counts none. */
export function bagsDroppedOnTheLink(node: Pick<GraphNodeOnTheWire, "components">, linkId: string): number {
  return Number(node.components.metrics?.dropped_bags_by_link[linkId] ?? 0);
}

/** The bags `node`'s output port `port` refused at its ceiling, `0` where it counts none. */
export function bagsRefusedOnTheOutputPort(node: Pick<GraphNodeOnTheWire, "components">, port: string): number {
  return Number(node.components.metrics?.refused_bags_by_output_port[port] ?? 0);
}

/** Each open JSON object already read, by the object the graph serves. */
const JSON_OBJECT_MEMBERS_READ = new WeakMap<object, { readonly [key: string]: JsonValue }>();

/** The values `value` holds as a JSON object, by key, a member no JSON value kept out; `{}` for anything else. A node's `config` and `pins` are served as open JSON; one object served gives the same members however often it is read. */
export function jsonObjectMembersOf(value: unknown): { readonly [key: string]: JsonValue } {
  const object = jsonObjectOrNull(value);
  if (object === null) return {};
  const readBefore = JSON_OBJECT_MEMBERS_READ.get(object);
  if (readBefore !== undefined) return readBefore;
  const members = Object.fromEntries(Object.entries(object).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1])));
  JSON_OBJECT_MEMBERS_READ.set(object, members);
  return members;
}

/** The node types a project offers, by source, and each one's inputs and outputs: `list_node_types`' and `describe_node_types`' answers, as the runtime gave them. */
export type ProjectNodeTypesDescribed = {
  listing: ListNodeTypesToolResult;
  /** Each node type the listing names, described, or with why it could not be, in the listing's order. */
  described: NodeTypeDescribedOrWhyNot[];
};

/** The description of each node type `described` holds one of, by its `node_type`; a node type described with why not is left out. */
export function nodeTypeDescriptionsByType(described: readonly NodeTypeDescribedOrWhyNot[]): ReadonlyMap<string, NodeTypeDescription> {
  return new Map(described.flatMap((nodeType) => ("not_described_because" in nodeType ? [] : [[nodeType.node_type, nodeType] as const])));
}

/** An asset's preview picture as `list_assets` sizes it, in whole pixels above zero: an image's own picture or a video's poster frame, which `read_asset_preview` answers. */
export type ProjectAssetPreview = {
  pixel_width: number;
  pixel_height: number;
  /** `image/png`. */
  media_type: string;
};

/** An asset's preview picture as Studio hands it to a window or a view: a `data:` URL of the runtime's picture and its size, in whole pixels above zero. */
export type AssetPreviewPicture = {
  /** `data:image/png;base64,…`. */
  picture_url: string;
  pixel_width: number;
  pixel_height: number;
};

/** One asset of a project as the runtime's `list_assets` lists it. */
export type ProjectAsset = {
  /** The asset's UUID, which a node's config names it by as `{"asset": <uuid>}`. */
  asset: string;
  /** `media` (video, audio, an image), `scene`, `data` (a LUT, model weights, a font…) or `stream` (a graph document); a kind the runtime adds later reads as it spells it. */
  kind: string;
  /** Where it sits, `/`-separated and relative to the project's folder. */
  path: string;
  content_sha256: string;
  /** Whole bytes. */
  content_byte_len: number;
  /** The settings its import took, kept in its sidecar. */
  import_settings: Record<string, JsonValue>;
  /** Its preview picture; `null` for an asset with none, as a stream, audio or a LUT, and for one whose bytes the runtime is still reading. */
  preview: ProjectAssetPreview | null;
  /** Each member of its `media_facts` the runtime read, such as `image` or `video` and `audio`; `null` while its bytes are still being read, and for an asset with no media facts, as a stream. */
  media_its_bytes_hold: string[] | null;
};

/** A project's assets as the runtime's `list_assets` lists them, in its order, which is by path. */
export type ProjectAssetListing = {
  /** The project's folder, its links resolved. */
  project_directory: string;
  /** The project's UUID. */
  project: string;
  project_name: string;
  assets: ProjectAsset[];
};

/** What importing the files the person chose answered: each asset the runtime's `import_asset` made, by its UUID and path, and each file it refused, in its own words. */
export type ProjectAssetsImported = {
  imported: { asset: string; path: string }[];
  refused: { file_name: string; because: string }[];
};

/** An asset's preview picture read, or why not, in Studio's or the runtime's words. */
export type AssetPreviewReading = { kind: "read"; picture: AssetPreviewPicture } | { kind: "not_read"; because: string };

export type { AudioCaptureDeviceKindOnTheWire, AudioCaptureDeviceOnTheWire, ListAudioCaptureDevicesToolResult };

/** The machine's audio inputs and the monitors of its outputs as the runtime's `list_audio_capture_devices` lists them, the backend's default first, or why they were not listed, in Studio's or the runtime's words. */
export type AudioCaptureDevicesReading = { kind: "listed"; listing: ListAudioCaptureDevicesToolResult } | { kind: "not_listed"; because: string };

/** Files the person chose imported into the project, nothing chosen, or why nothing was asked of the runtime. */
export type ProjectAssetsImporting = { kind: "imported"; assets_imported: ProjectAssetsImported } | { kind: "nothing_chosen" } | { kind: "not_imported"; because: string };

/** A project as the runtime's `list_assets` names it, from its `tatolab-project.json`. */
export type ProjectTheRuntimeNames = {
  /** The folder, absolute with its links resolved. */
  folder: string;
  /** The project's UUID. */
  project: string;
  name: string;
};

/** An imported project's copy under `imports/`, named by the runtime or with the runtime's words for why it could not be. */
export type ImportedProjectSource = { kind: "folder"; project: ProjectTheRuntimeNames } | { kind: "folder_unreadable"; folder: string; refusal: string };

/** One project the open project imports, as the runtime's `list_dependencies` lists it, which Studio shows as an import. */
export type ImportedProject = {
  /** The UUID `list_dependencies` lists it by. */
  project: string;
  /** The name the runtime reads from its copy, or its folder's name where the runtime could not read it. */
  name: string;
  /** Its folder under `imports/`. */
  folder: string;
  /** The folder or `.zip` the runtime copied it from, as `list_dependencies` lists it; a Marketplace download's names its catalog entry. */
  copied_from: string;
  source: ImportedProjectSource;
};

/** The open project: its folder's own project, and the projects it imports in the runtime's order, or why the runtime did not list them. */
export type OpenProject = {
  project: ProjectTheRuntimeNames;
  imports: ImportedProject[];
  /** The runtime's words, or that no runtime answered, when `imports` could not be listed; `null` when they were. */
  imports_not_listed_because: string | null;
};

/** No project open, the open one read, or its folder unreadable, with why in the words of what refused. */
export type OpenProjectReading = { kind: "none_open" } | { kind: "read"; open_project: OpenProject } | { kind: "unreadable"; folder: string; refusal: string };

/** A file of the open project or its imports, as read from disk. */
export type ProjectFileRead = {
  /** The file, absolute, as the view named it. */
  file: string;
  /** The folder of the project the file belongs to. */
  project_folder: string;
  text: string;
  /** The SHA-256 of the bytes read, in hex, which a save takes back as `based_on_version`. */
  version: string;
  /** Whether the file belongs to the open project, whose files Studio saves; an import's are read-only. */
  is_editable: boolean;
};

/** A project's Python files and `pyproject.toml`, relative to its folder, in name order. */
export type ProjectFiles = { project_folder: string; files: string[] };

/** One record of a project's log, flattened from the runtime's JSONL record. */
export type ProjectLogRecord = {
  /** Nanoseconds since the Unix epoch; past 2^53, so it arrives rounded to a few hundred nanoseconds. */
  host_ts_ns: number | null;
  level: string | null;
  source: string | null;
  target: string | null;
  message: string;
  attrs: Record<string, string>;
  /** The graph `id` of the step that wrote it; `null` for a record written outside a step. */
  processor_id: string | null;
  /** Whether a step's own helper process wrote it rather than the runtime's process. */
  sent_by_its_own_process: boolean;
  /** The id of the stream action it was written for; `null` for a record written outside one. */
  action: string | null;
  /** The id of the stream that wrote it; `null` for a record of the project's own. */
  stream: string | null;
  /** The record as JSON text, every number in the digits the runtime wrote, so `host_ts` is exact. */
  jsonl_line: string;
};

/** The output port of a running node a port viewer reads: the stream's id, the node's id as `graph` lists it, and the port's name. */
export type PortViewerTarget = { stream: string; node_id: string; port: string };

/** One channel of a Channels block: the lowest and highest sample of each of its columns, its peak and its RMS. */
export type PortViewerChannelWaveform = {
  column_minimums: number[];
  column_maximums: number[];
  peak: number;
  rms: number;
};

/** One attribute of an Array frame: its name, element type and shape, where its data lives, and, for numeric data in the payload, its statistics. */
export type PortViewerArrayAttributeReading = {
  name: string;
  dtype: string;
  shape: number[];
  residency: "cpu" | "gpu";
  statistics: { element_count: number; minimum: number; maximum: number; mean: number } | null;
};

/** How a port viewer that ended recovers: it shows again once the port's node runs, or the port is opened again, by the view or the person. */
export type PortViewerRecovery = "shows_once_the_node_runs" | "open_the_port_again";

/** What a port viewer read of one message of a family other than Image, from the family's descriptor and payload. */
export type PortViewerMessageReading =
  | {
      family: "channels";
      start_sample: number;
      sample_rate: number;
      channel_count: number;
      samples_per_channel: number;
      sample_type: string;
      channel_waveforms: PortViewerChannelWaveform[];
      /** The block's samples, one array per channel, each `samples_per_channel` long. */
      channel_samples: Float32Array[];
    }
  | { family: "array"; attributes: PortViewerArrayAttributeReading[] }
  | { family: "packets"; codec: string; byte_length: number; starts_group: boolean; timestamp_ns: number }
  | { family: "records"; record: JsonValue }
  | { family: "bytes"; byte_length: number }
  | { family: "unreadable"; port_family: string; because: string };

/** What Studio has selected, which every view shows and any view may change. */
export type StudioSelection =
  | { kind: "nothing" }
  | { kind: "project"; project_name: string; project_folder: string | null }
  | { kind: "stream"; stream: string; project_folder: string }
  /** One node of a stream, by name, at `level`: the path of subgraph node UUIDs from the stream's own level inward, its own level when absent. */
  | { kind: "node"; stream: string; node: string; level?: string[] | undefined }
  /** Two or more nodes of one level of a stream selected together, by name, the one picked last at the end. */
  | { kind: "nodes"; stream: string; nodes: string[]; level?: string[] | undefined };

/** A stream a tab is open on: its id, and the project and words its tab is labelled with. */
export type StreamTabAddress = { stream: string; project_name: string; display_name: string };

/** The streams the runtime lists; why none are listed while the runtime is not running; or why listing them failed while it runs, in the failure's own words. */
export type ListedStreamsReading = { kind: "listed"; streams: ListedStream[] } | { kind: "not_listed"; because: string } | { kind: "listing_failed"; because: string };

/** A stream's graph as the runtime renders it now, or why it renders none, in its own words. */
export type StreamGraphReading = { kind: "read"; graph: StreamGraphOnTheWire } | { kind: "not_read"; because: string };

/** What one input of a stream's graph reads, or one member of a bundle input (`member` `null` for the whole input), at the level of the subgraphs it is inside, by their node ids from the outermost, and its node by its graph `id`. */
export type StreamInputValue = { level: string[]; node_id: string; input: string; member: string | null; value_read: StreamGraphInputValueRead };

/**
 * A stream's input values as the host keeps them: every input's value at every level, as its latest graph reading holds it with
 * each change the runtime announced since on top; then each change on its own. Both name the stream's asset, `null` for a
 * stream run from no asset, as its graph reading does.
 */
export type StreamInputValuesReading = { kind: "values"; stream_asset: string | null; values: StreamInputValue[] } | { kind: "changed"; stream_asset: string | null; change: StreamInputValue };

/** The node types a project offers and each one's inputs and outputs, or why the runtime lists none, in its own words. */
export type ProjectNodeTypesDescribedReading = { kind: "listed"; node_types: ProjectNodeTypesDescribed } | { kind: "not_listed"; because: string };

/** One input or output a `node` view declares: its name, the pin type it carries and the family that type travels on. */
export type StudioViewDeclaredPort = { name: string; family: PortFamily; pin_type: PinType; description: string };

/** A view an area can show: its view type id, what its manifest says of it, who brought it, and why it does not open (`null` when it does). */
export type StudioViewListed = {
  /** The id the window holds the view under, which a view opens it or shows it in an area by: a project's view by its project's UUID and its folder, never the node type a node of it is. */
  view_type_id: string;
  title: string;
  description: string;
  /** `Tato Studio` for a view Studio ships with, else the name of the project or import bringing it. */
  brought_by: string;
  is_built_in: boolean;
  /** `area` or `node`, as its manifest places it; `null` for one that does not open. */
  placement: "area" | "node" | null;
  inputs: StudioViewDeclaredPort[];
  outputs: StudioViewDeclaredPort[];
  not_opened_because: string | null;
};

/** The views Studio ships with and those the open project and its imports bring, or why the project's are not listed, in the runtime's words. */
export type StudioViewsReading = { kind: "listed"; studio_views: StudioViewListed[] } | { kind: "not_listed"; built_in_views: StudioViewListed[]; because: string };

/** A project's assets, or why the runtime lists none, in its own words. */
export type ProjectAssetsReading = { kind: "listed"; listing: ProjectAssetListing } | { kind: "not_listed"; because: string };

/** A project's log as read so far, its latest records last, or why the runtime gives none now, in its own words. */
export type ProjectLogReading = { kind: "read"; records: ProjectLogRecord[]; records_no_longer_held: boolean } | { kind: "not_read"; because: string };

/** One transaction on a project's change feed, as the runtime's `streamlib://project/<project>/transactions` resource carries it. */
export type ProjectTransaction = {
  /** The format the runtime recorded it in, a whole number, `1` for one recorded before formats were. */
  format_version: number;
  /** The transaction's UUID. */
  transaction: string;
  /** The commit on the project history's `main` that records it. */
  commit: string;
  /** The commit history stood at when it applied, `null` for a project's first. */
  parent_commit: string | null;
  /** `person`, `agent` or `runtime`, or a kind newer than this app. */
  author_kind: string;
  /** The author's name as history shows it: an agent's MCP client name. */
  author_name: string;
  /** What it changed, in order, each tagged by its `operation`, as the runtime sent them. */
  operations: JsonValue[];
  /** What undoes it, in order, as the runtime sent them. */
  inverse_operations: JsonValue[];
  /** The transaction this one undoes, when it is an undo. */
  undoes: string | null;
  /** The transaction this one redoes, when it is a redo. */
  redoes: string | null;
  /** The key its caller sent it under, `null` when it sent none. */
  idempotency_key: string | null;
  /** Where an edit or a redo stands with its author's undo and redo now, the same for an edit and every redo of it: `applied`, `undone_redoable` or `undone_not_redoable`, or a state newer than this app; `null` for an undo. */
  undo_state: string | null;
  /** When the runtime applied it, RFC 3339 in UTC to the second, for display only. */
  applied_at: string;
};

/** One end of the link a refused operation names: a node by UUID or `as` label, and one of its ports. */
export type RefusedGraphLinkEnd = { node: string; port: string };

/** The place in a project file a refusal is about: its path in the project, and a line and column, each a whole number from 1, when the place is narrower. */
export type RefusedFile = { path: string; line?: number | null | undefined; column?: number | null | undefined };

/** A call a refusal suggests: the operation by name and its params, exactly as the runtime's `call_operation` takes them. */
export type SuggestedCall = { operation: string; params: Record<string, JsonValue> };

/** What the runtime refused of an action, and why in its own words. */
export type ProjectActionRefusal = {
  /** What kind of refusal it is, for the surface that made the edit to branch on, never turned into words. The set is the runtime's and grows, so it is open here; Studio's main process reads it through the generated runtime client, which reads a code it does not know as `refused`. */
  refusal_code: string;
  /** The action refused, by the name of the tool it was sent to. */
  action: string;
  /** The position, from 0, of the operation refused among those the action sent; `null` when none was. */
  refused_operation_index: number | null;
  /** The node the refused operation names, as the caller named it. */
  refused_node: string | null;
  /** The link the refused operation names. */
  refused_link: { source: RefusedGraphLinkEnd; target: RefusedGraphLinkEnd } | null;
  /** The node's input or config field the refused operation names. */
  refused_field: string | null;
  /** The JSON pointer, into the params the action sent, of the value refused; `null` when no one value inside them is. */
  refused_params_pointer: string | null;
  /** The place in a project file the refusal is about. */
  refused_file: RefusedFile | null;
  /** A call that would help, when the runtime knows one. */
  suggested_call: SuggestedCall | null;
  /** Why, in the runtime's own words, never rewritten. */
  runtime_words: string;
};

/** An action on a project the runtime refused since it started, which no history records. */
export type RefusedProjectAction = {
  /** `person`, `agent` or `runtime`, or a kind newer than this app. */
  author_kind: string;
  /** The author's name as an applied transaction would carry it. */
  author_name: string;
  /** `commit` or `live`, as the action asked. */
  mode: string;
  /** The operations the action asked for, in order, as the request named them; none for an undo or a redo. */
  operations: JsonValue[];
  /** The key its caller sent it under, `null` when it sent none. */
  idempotency_key: string | null;
  refusal: ProjectActionRefusal;
  /** When the runtime refused it, RFC 3339 in UTC to the second, for display only. */
  refused_at: string;
};

/** A project's change feed: its UUID, its directory, its newest transactions, and the actions the runtime refused lately, each newest first. */
export type ProjectTransactions = {
  project: string;
  project_directory: string;
  transactions: ProjectTransaction[];
  /** The runtime keeps the latest 100 it refused, in memory, so a restart forgets them. */
  refused_actions: RefusedProjectAction[];
};

/** A project's change feed as last read, or why the runtime gives none now, in its own words. */
export type ProjectTransactionsReading = { kind: "read"; project_transactions: ProjectTransactions } | { kind: "not_read"; because: string };

/** The name Tato Studio gives the runtime as its MCP client, which the runtime records Studio's own edits under while Studio names no author. */
export const TATO_STUDIO_MCP_CLIENT_NAME = "tatolab-app";

/** Whose change an undo or a redo reverses: a person or an agent, by the name history shows. */
export type ProjectTransactionAuthor = { kind: "person" | "agent"; name: string };

/** One action on a stream's graph as the runtime's `transact` takes it, tagged by `operation`; one end of a link it names; and whether a graph transaction is kept, `commit` or `live`. */
export type { GraphEditMode, StreamGraphAction, StreamGraphActionLinkEnd };

/** A link end as the runtime answers it: a node by its UUID, and one of its ports. */
export type GraphLinkEnd = { node: string; port: string };

/** What a graph transaction applied, as `transact` answers it (`GraphTransactionToolResult` in `local_api_wire_contract.rs`); each `stream` here is a stream id. */
export type ProjectGraphTransaction = {
  mode: GraphEditMode;
  /** The transaction's UUID; `null` on a live one, which history never records. */
  transaction: string | null;
  /** The commit on the project history's `main` recording it; `null` on a live one. */
  commit: string | null;
  /** Each operation as applied, in order, tagged by its `operation`. */
  operations: JsonValue[];
  /** Each node it added: its new UUID as `node`, the name it took, and the `as` its `add_node` gave it. */
  added_nodes: { stream: string; node: string; name: string; as: string | null }[];
  /** Each link it made, with `state` `pending`, `wired` or `error` (`null` when the graph could not be read after it) and why an `error` link carries nothing. */
  connected_links: { stream: string; source: GraphLinkEnd; target: GraphLinkEnd; state: string | null; error_reason: string | null }[];
  added_groups: { stream: string; group: string; title: string }[];
  added_notes: { stream: string; note: string }[];
};

/** A graph transaction the runtime answered: applied whole, or refused, structured, with nothing changed. */
export type ProjectGraphTransactionTheRuntimeAnswered = { kind: "applied"; transaction: ProjectGraphTransaction } | { kind: "refused"; refusal: ProjectActionRefusal };

/** A graph transaction the runtime answered, or one Studio refused before it reached the runtime, in Studio's words alone. */
export type ProjectGraphTransactionApplying = ProjectGraphTransactionTheRuntimeAnswered | { kind: "not_sent"; because: string };

/** What a placed pin is asked against, and what the runtime's `check_link_candidates` answers for each candidate: the control contract's own types. */
export type { CheckLinkCandidatesRequest, LinkCandidateEnd, LinkCandidatesCheckResult, LinkCheckResult };

/** What the runtime's `check_link_candidates` answered, or why it was not asked or refused, in Studio's or the runtime's own words. */
export type LinkCandidatesChecking = { kind: "checked"; result: LinkCandidatesCheckResult } | { kind: "not_checked"; because: string };

/** The person editing in Studio, as history records their edits, or why Studio did not say. */
export type ThePersonEditingReading = { kind: "read"; author: ProjectTransactionAuthor } | { kind: "not_read"; because: string };

/** The transaction an undo or a redo applied, or why the runtime refused it, in its own words. */
export type ProjectTransactionApplying = { kind: "applied"; transaction: ProjectTransaction } | { kind: "not_applied"; because: string };

/** A file of the open project and its imports as read from disk, or why it was not, in the words of what refused. */
export type ProjectFileReading = { kind: "read"; file_read: ProjectFileRead } | { kind: "not_read"; because: string };

/** A file saved, with the version it now has on disk, or why nothing was written. */
export type ProjectFileSaving = { kind: "saved"; version: string } | { kind: "not_saved"; because: string };

/** A new node file from the runtime's node template, with the node type it declares as `<module>:<class>`, or why it was not created, in the runtime's own words. */
export type NodeFileCreating = { kind: "created"; file: string; node_type: string } | { kind: "not_created"; because: string };

/** One finding of the runtime's check of a file, as the runtime gave it: its line and column counted from 1, `null` when it names none. */
export interface ProjectFileFinding {
  /** The runtime's code for it, as `TS2322`, `typescript(no-explicit-any)` or `value_input_has_no_default`. */
  finding_code: string;
  severity: "error" | "warning";
  /** What was found, and how to fix it when there is a fix, in the runtime's words. */
  words: string;
  line: number | null;
  column: number | null;
}

/** What the runtime's check of a file found in it, nothing when it passed, or why it was not asked, in the words of what refused. */
export type ProjectFileChecking = { kind: "checked"; findings: ProjectFileFinding[] } | { kind: "not_checked"; because: string };

/** A `@node` a Marketplace entry brings, as its catalog names it: its class name, as `CameraSource`, and one line on what it does. */
export type MarketplaceNode = { name: string; summary: string };

/** One package or sample project the Marketplace lists: the catalog's name for it, its title, one line on what it is, the nodes it brings, whether it brings anything on this machine, and whether it needs a newer runtime than the one answering, which a newer Tato Studio carries. */
export type MarketplaceEntry = { kind: "package" | "sample"; name: string; title: string; summary: string; nodes: MarketplaceNode[]; runs_on_this_machine: boolean; needs_a_newer_runtime: boolean };

/** The Marketplace's entries in its catalog's order, as the catalog lists them now, or why the catalog was not read, in the words of what refused. */
export type MarketplaceReading = { kind: "read"; entries: MarketplaceEntry[] } | { kind: "not_read"; because: string };

/** A Marketplace module added to the open project, by its folder under `imports/`, or why it was not, in the words of what refused. */
export type MarketplaceModuleAdding = { kind: "added"; folder: string } | { kind: "not_added"; because: string };

/** A project's files, or why they were not listed. */
export type ProjectFilesListing = { kind: "listed"; project_files: ProjectFiles } | { kind: "not_listed"; because: string };

/** What a Python language server connection delivers: one JSON-RPC message the server sent, or the server's end with why. */
export type PythonLanguageServerConnectionEvent = { kind: "message"; message: JsonValue } | { kind: "ended"; because: string };

/** What a view's area was opened on: a file of the open project or its imports, at its line `line` when the opening named one, or a running node's output port, with the opening's id, so a view that keeps what it opened tells a new opening from one it took before; `null` for an area opened on nothing. */
export type ViewOpenedOn = { kind: "file"; file: string; line?: number; opening_id: string } | { kind: "port"; target: PortViewerTarget; opening_id: string } | null;

/** Where the view's own header row lies inside its frame: Studio's view-type menu covers the row's start up to `leading_inset_px`, and the row is `height_px` tall, `0` where the frame has no header row, as in the asset picker; neither is below `0`. */
export type ViewHeaderRow = { leading_inset_px: number; height_px: number };
