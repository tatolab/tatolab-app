// Everything a view reads from Tato Studio, as plain types: Studio's own build writes what crosses a
// view's MessagePort to it, so a view takes it as typed and parses none of it. The few Zod schemas
// left here decode what someone else wrote: what a view asks, a layout pin an earlier run kept, a
// node's `kind` as the runtime spells it, and a node's `studio` fields a view edits.

import { z } from "zod";
import type { DeclaredPinType, NodeInputMode, PinFlow, PinType } from "./pin_type_readings.js";
import type { PortFamily } from "./port_families.js";

/** A value as JSON carries it. */
export const jsonValueSchema = z.json();
/** A value as JSON carries it. */
export type JsonValue = z.infer<typeof jsonValueSchema>;

/** Where a stream lives: its project directory as of its last load, symlinks resolved, and the two UUIDs that identify it, its project's and its stream asset's. */
export type StreamLocation = {
  project_directory: string;
  /** The project's UUID, from its `tatolab-project.json`. */
  project: string;
  /** The stream asset's UUID, from its graph document. */
  stream_asset: string;
};

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

/** An output port's stream facts as the runtime renders them under `stream_facts`, tagged by `family`; a field the port does not state is `null`. */
export type PortStreamFacts =
  | {
      family: "image";
      frame_rate: ImageStreamFrameRate | null;
      content_light_level: ImageStreamContentLightLevel | null;
      mastering_display_colour_volume: ImageStreamMasteringDisplayColourVolume | null;
    }
  | {
      family: "packets";
      /** The codec with its profile and level, as an RFC 6381 `codecs` parameter spells it (`avc1.64001f`, `opus`). */
      rfc6381_codec: string | null;
      coded_width: number | null;
      coded_height: number | null;
      sample_rate: number | null;
      channel_count: number | null;
      /** The bytes of the codec's out-of-band configuration record (`avcC`, `hvcC`, `OpusHead`), from its lowercase hex. */
      codec_configuration_byte_length: number | null;
    };

/** The pin type a port of a running graph carries, resolved, and its flow, from its `pin_type` and `flow` keys. */
export type StreamGraphPortPin = { pin_type: PinType; flow: PinFlow };

/** Where the value an input reads comes from, as the runtime spells its `value_comes_from`: set live, saved in the graph document, its port's declared default, or a link that feeds it. */
export type InputValueComesFrom = "live" | "saved" | "default" | "wire";

/** The value an input reads while unlinked, `null` while a link feeds it or it reads none, and where it comes from, `null` while it reads none. */
export type StreamGraphInputValueRead = { value: JsonValue | null; comes_from: InputValueComesFrom | null };

/** A port a node declares under the graph's `ports.inputs` or `ports.outputs`. */
export type StreamGraphDeclaredPort = {
  name: string;
  /** The family the port carries, from its `family` key; `null` while the runtime serves none, or one this app does not know. */
  family: PortFamily | null;
  /** What an output states about the stream it carries now, from its `stream_facts` key; `null` when it states none, as every input does. */
  stream_facts: PortStreamFacts | null;
  /** `false` on a Records port, whose values no type checks, from its `values_checked` key; `null` on every other family. */
  values_checked: boolean | null;
  /** Its pin type and flow; `null` on a port the runtime serves neither for, because its code does not state its type exactly, which links by its family alone. */
  pin: StreamGraphPortPin | null;
  /** On an input, the value it reads while unlinked and where that value comes from, from its `value` and `value_comes_from` keys; `null` on an input that takes no stored value, and on every output. */
  value_read: StreamGraphInputValueRead | null;
};

/** A point or a size on the canvas, `[x, y]` or `[width, height]`. */
export const studioCanvasPairSchema = z.tuple([z.number(), z.number()]);
/** A point or a size on the canvas. */
export type StudioCanvasPair = z.infer<typeof studioCanvasPairSchema>;

/** A node's fixed `studio` fields, each `null` while the graph document holds none, and `metadata` what a client keeps beside them; written back whole, an unset field stays unset. */
export const streamGraphNodeStudioFieldsSchema = z.object({
  position: studioCanvasPairSchema.nullable(),
  /** The labelled group it belongs to, by the group's UUID. */
  group: z.string().nullable(),
  comment: z.string().nullable(),
  colour: z.string().nullable(),
  collapsed: z.boolean().nullable(),
  metadata: z.record(z.string(), jsonValueSchema),
});
/** A node's fixed `studio` fields. */
export type StreamGraphNodeStudioFields = z.infer<typeof streamGraphNodeStudioFieldsSchema>;

/** The `studio` fields of a node whose graph document sets none. */
export const NODE_STUDIO_FIELDS_NONE_SET: Readonly<StreamGraphNodeStudioFields> = Object.freeze({ position: null, group: null, comment: null, colour: null, collapsed: null, metadata: Object.freeze({}) });

/** A labelled group of a stream's graph, from its `groups` key, which its nodes join by naming its UUID as their `studio.group`. */
export type StreamGraphGroup = {
  id: string;
  title: string;
  description: string | null;
  colour: string | null;
};

/** A canvas note of a stream's graph, from its `studio.notes` key: text at a position and size, beside the nodes. */
export type StreamGraphNote = {
  id: string;
  text: string;
  position: StudioCanvasPair;
  size: StudioCanvasPair;
};

/** The port a `GraphInput` or `GraphOutput` node declares for its stream, from the node's `components.graph_interface`. */
export type StreamGraphInterfacePort = {
  direction: "input" | "output";
  port: string;
  /** As the runtime spells it: `image`, `array`, `channels`, `packets` or `records`; `null` while the node names none and nothing is linked to it, when the first link's family becomes its own. */
  family: string | null;
  /** What a running top-level Input carries now, the last value a client wrote, else its config's `default`; `null` where the runtime renders none. */
  current_value: JsonValue | null;
};

/** How a node's code runs, as the runtime spells its `kind`: a shader on the GPU, a function evaluated where its reader reads, a class in a process of its own, or a graph generator's stored output. */
export const streamGraphNodeKindSchema = z.enum(["shader", "function", "process", "fragment"]);
/** How a node's code runs. */
export type StreamGraphNodeKind = z.infer<typeof streamGraphNodeKindSchema>;

/** One node of a stream's graph, by the name a link end and a port address name it by. */
export type StreamGraphNode = {
  /** The node's UUID, which a log record's `processor_id` and every graph edit name it by. */
  id: string;
  name: string;
  type: string;
  /** How its code runs, from its `kind` key; `null` on a node whose type nothing registers, which the runtime renders with no `kind`. */
  kind: StreamGraphNodeKind | null;
  /** The processor's state as the runtime names it, such as `Running`. */
  state: string | null;
  /** Why it failed, in the runtime's own words: set while it reads `Error`, `null` otherwise. */
  failed_because: string | null;
  /** What its `process()` last raised, in the runtime's own words, while it keeps raising and stays `Running`; `null` once a call runs cleanly, and for a node that never raised. */
  process_raising_because: string | null;
  /** Why it cannot do its work yet, in the runtime's own words, such as an unset or missing file, while it keeps running; `null` while it is ready. */
  not_ready_because: string | null;
  /** Its config as the graph renders it; `{}` when it renders none. */
  config: Record<string, JsonValue>;
  /** The value set on each unlinked input, by input name, as the graph's `pins` renders it; an input left at its port's default is absent. */
  pins: Record<string, JsonValue>;
  /** The number and bool config fields it takes as inputs, each an input port of the field's name, as the graph's `exposed_config_fields` renders them; `[]` when it takes none. */
  exposed_config_fields: string[];
  input_ports: StreamGraphDeclaredPort[];
  output_ports: StreamGraphDeclaredPort[];
  /** Messages it dropped on each link into it, by the link's `id`. */
  dropped_bags_by_link: Record<string, number>;
  /** Messages each of its output ports refused, by port name. */
  refused_bags_by_output_port: Record<string, number>;
  /** What Tato Studio draws it with, from its `studio` key under the runtime's studio contract. */
  studio: StreamGraphNodeStudioFields;
  /** What it holds when it is a subgraph, from its `fragment` key; `null` on every other node. */
  fragment: StreamGraphFragment | null;
  /** The port it declares for its stream when it is a `GraphInput` or `GraphOutput` the runtime renders as one; `null` on every other node. */
  graph_interface: StreamGraphInterfacePort | null;
};

/** How a subgraph came to be: `generated` is a `@graph_generator`'s frozen output, its node's `type` the generator; `placed_stream` a stream placed by reference (`tatolab.project:StreamFragment`), which a collapse saves the selection as. */
export type StreamGraphFragmentKind = "generated" | "placed_stream";

/** The graph a subgraph node holds: its nodes, each read as a stream's node is, the links between them and its labelled groups. */
export type StreamGraphFragment = {
  kind: StreamGraphFragmentKind;
  nodes: StreamGraphNode[];
  links: StreamGraphLink[];
  groups: StreamGraphGroup[];
};

/** One link of a stream's graph, from an output port to an input port; the source may be in another stream. */
export type StreamGraphLink = {
  /** The runtime's id of the link, which a node's `dropped_bags_by_link` is keyed by. */
  id: string;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
  /** `wired`, `pending`, `awaiting_remote`, `error`, `disconnecting` or `disconnected`. */
  state: string;
};

/** One loaded stream's nodes and links, and the document they were read from. */
export type StreamGraphSummary = {
  stream: string;
  /** The stream asset's UUID, from the graph's `asset` key, which every graph edit names the stream by; `null` when the graph renders none. */
  stream_asset: string | null;
  groups: StreamGraphGroup[];
  notes: StreamGraphNote[];
  nodes: StreamGraphNode[];
  links: StreamGraphLink[];
  /** The `graph` tool's text exactly as the runtime wrote it. */
  graph_document_text: string;
};

/** The pin type a node type's port declares, or how it is found, and its flow, from the catalog port's `pin_type` and `flow` keys. */
export type NodeCatalogPortPin = { pin_type: DeclaredPinType; flow: PinFlow };

/** One port a node type declares, as the node catalog lists it. */
export type NodeCatalogPort = {
  name: string;
  description: string;
  family: PortFamily | null;
  /** Its declared pin type and flow; `null` on a port the catalog serves neither for, because its code does not state its type exactly. */
  pin: NodeCatalogPortPin | null;
  /** On an input, whether it takes a wire, a stored value, or both, from its `input_mode` key; `null` on an input the catalog serves none for, which takes a wire, and on every output. */
  input_mode: NodeInputMode | null;
};

/** One node type a stream can add, as the node catalog lists it under the `type` a graph node carries. */
export type NodeCatalogEntry = {
  type: string;
  description: string;
  /** The category the runtime files it under, a path with `/` between its levels, as `Effects/Stylize`; `null` for a type served with none. */
  category: string | null;
  /** Its config's JSON Schema, draft 2020-12 with no `$schema` key; `null` for a type described without one. */
  config_schema: JsonValue | null;
  inputs: NodeCatalogPort[];
  outputs: NodeCatalogPort[];
};

/** Every node type the loaded stream `stream` can add. */
export type NodeCatalog = { stream: string; node_types: NodeCatalogEntry[] };

/** One port of a node type as its declaration states it in source. */
export type ProjectNodeTypePort = {
  name: string;
  description: string;
  /** `null` where source alone does not say, or for one this app does not know. */
  family: PortFamily | null;
  /** A function or shader port's annotation as written; `null` for a process node's port. */
  annotation: string | null;
};

/** One node type a project's source declares. */
export type ProjectNodeType = {
  /** The type `add_node` takes: the import path `<module>:<qualname>`. */
  type: string;
  /** `process`, `function` or `shader`, or a kind newer than this app; `null` where source does not show it. */
  kind: string | null;
  description: string;
  /** The category the runtime files it under, a path with `/` between its levels, as `Effects/Stylize`; `null` for a type served with none. */
  category: string | null;
  /** `null` where only the node's native half states its ports. */
  inputs: ProjectNodeTypePort[] | null;
  outputs: ProjectNodeTypePort[] | null;
  /** The declaring file, relative to its source's root. */
  path: string | null;
  line: number | null;
};

/** One setting a graph generator promotes, as its parameter states it. */
export type ProjectGraphGeneratorPromotedSetting = { name: string; annotation: string | null };

/** One `@graph_generator` a project's source declares. */
export type ProjectGraphGenerator = {
  /** The import path `import_graph_generator` takes: `<module>:<function>`. */
  generator: string;
  /** Its docstring. */
  description: string;
  promoted_config: ProjectGraphGeneratorPromotedSetting[];
  path: string;
  line: number;
};

/** A module of a source that does not parse, with why in the parser's words and where it stopped. */
export type ProjectNodeModuleNotReadable = {
  module: string;
  path: string;
  line: number | null;
  column: number | null;
  why: string;
};

/** Where a listed source's node code comes from: the project, an import by its UUID, folder under `imports/`, copied version and the name its own project file holds (`null` when that file does not read), an installed distribution, or an origin newer than this app. */
export type ProjectNodeTypeSourceOrigin =
  | { source: "project" }
  | { source: "dependency"; project: string; folder: string; version: string; project_name: string | null }
  | { source: "installed_distribution"; distribution: string; distribution_version: string }
  | { source: "newer_than_this_app"; source_name: string };

/** One source's node types, graph generators, and the modules of it that do not parse. */
export type ProjectNodeTypeSource = {
  origin: ProjectNodeTypeSourceOrigin;
  node_types: ProjectNodeType[];
  graph_generators: ProjectGraphGenerator[];
  unreadable_modules: ProjectNodeModuleNotReadable[];
};

/** What the project and each source it draws node code from declares, read from source without running it. */
export type ProjectNodeTypeListing = {
  /** The project's folder, its links resolved. */
  project_directory: string;
  /** The project's UUID. */
  project: string;
  project_name: string;
  /** The project first, then each import, then each installed distribution. */
  sources: ProjectNodeTypeSource[];
};

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
export const portViewerTargetSchema = z.object({ stream: z.string(), node_id: z.string(), port: z.string() });
/** The output port of a running node a port viewer reads. */
export type PortViewerTarget = z.infer<typeof portViewerTargetSchema>;

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
export const studioSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("nothing") }),
  z.object({ kind: z.literal("project"), project_name: z.string(), project_folder: z.string().nullable() }),
  z.object({ kind: z.literal("stream"), stream: z.string(), project_folder: z.string() }),
  /** One node of a stream, by name, at `level`: the path of subgraph node UUIDs from the stream's own level inward, its own level when absent. */
  z.object({ kind: z.literal("node"), stream: z.string(), node: z.string(), level: z.array(z.string()).optional() }),
  /** Two or more nodes of one level of a stream selected together, by name, the one picked last at the end. */
  z.object({ kind: z.literal("nodes"), stream: z.string(), nodes: z.array(z.string()).min(2), level: z.array(z.string()).optional() }),
]);
/** What Studio has selected. */
export type StudioSelection = z.infer<typeof studioSelectionSchema>;

/** A stream a tab is open on: its id, and the project and words its tab is labelled with. */
export const streamTabAddressSchema = z.object({ stream: z.string(), project_name: z.string(), display_name: z.string() });
/** A stream a tab is open on. */
export type StreamTabAddress = z.infer<typeof streamTabAddressSchema>;

/** The streams the runtime lists; why none are listed while the runtime is not running; or why listing them failed while it runs, in the failure's own words. */
export type ListedStreamsReading = { kind: "listed"; streams: ListedStream[] } | { kind: "not_listed"; because: string } | { kind: "listing_failed"; because: string };

/** A stream's graph as the runtime renders it now, or why it renders none, in its own words. */
export type StreamGraphReading = { kind: "read"; graph: StreamGraphSummary } | { kind: "not_read"; because: string };

/** The node types a stream can add, or why the runtime lists none, in its own words. */
export type NodeCatalogReading = { kind: "listed"; catalog: NodeCatalog } | { kind: "not_listed"; because: string };

/** What a project and each source it draws node code from declares, or why the runtime lists none, in its own words. */
export type ProjectNodeTypesReading = { kind: "listed"; listing: ProjectNodeTypeListing } | { kind: "not_listed"; because: string };

/** One input or output a `node` view declares: its name and family. */
export type StudioViewDeclaredPort = { name: string; family: PortFamily; description: string };

/** A view an area can show: its view type id, what its manifest says of it, who brought it, and why it does not open (`null` when it does). */
export type StudioViewListed = {
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
export const projectTransactionAuthorSchema = z.object({ kind: z.enum(["person", "agent"]), name: z.string() });
/** Whose change an undo or a redo reverses. */
export type ProjectTransactionAuthor = z.infer<typeof projectTransactionAuthorSchema>;

/** One end of a link a graph action names: a node by its UUID, or by an `as` an earlier `add_node` of the same transaction gave it, and one of its ports. */
export const streamGraphActionLinkEndSchema = z.strictObject({ node: z.string(), port: z.string() });
/** One end of a link a graph action names. */
export type StreamGraphActionLinkEnd = z.infer<typeof streamGraphActionLinkEndSchema>;

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** The subgraph a graph action edits inside: the path of subgraph node UUIDs from the stream's own level inward; the stream's own level when absent. */
const streamGraphActionLevelSchema = z.array(z.string()).optional();

/**
 * One action on a stream's graph as the runtime's `transact` takes it (`StreamGraphAction` in streamlib's
 * `stream_graph_action.rs`), tagged by `operation`: `stream` is the stream asset's UUID, a node is named by its
 * UUID or an `as` label, and a key the runtime does not take is refused, here as there.
 */
export const streamGraphActionSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("add_node"),
    stream: z.string(),
    level: streamGraphActionLevelSchema,
    type: z.string(),
    name: z.string().optional(),
    config: jsonObjectSchema.optional(),
    pins: jsonObjectSchema.optional(),
    exposed_config_fields: z.array(z.string()).optional(),
    studio: jsonObjectSchema.optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("remove_node"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string() }),
  z.strictObject({ operation: z.literal("connect"), stream: z.string(), level: streamGraphActionLevelSchema, source: streamGraphActionLinkEndSchema, target: streamGraphActionLinkEndSchema }),
  z.strictObject({ operation: z.literal("disconnect"), stream: z.string(), level: streamGraphActionLevelSchema, source: streamGraphActionLinkEndSchema, target: streamGraphActionLinkEndSchema }),
  /** Replaces the node's config whole. */
  z.strictObject({ operation: z.literal("set_node_config"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), config: jsonObjectSchema }),
  /** Sets the value an input holds while unlinked, saved or live as the transaction's mode says; an absent or `null` value takes it off, so the input reads its declared default. */
  z.strictObject({ operation: z.literal("set_node_input_value"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), input: z.string(), value: jsonValueSchema.optional() }),
  /** An absent or `null` value takes the input's value off. */
  z.strictObject({ operation: z.literal("set_pin_value"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), input: z.string(), value: jsonValueSchema.optional() }),
  z.strictObject({ operation: z.literal("rename_node"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), name: z.string() }),
  /** Replaces the node's studio fields whole. */
  z.strictObject({ operation: z.literal("set_studio_fields"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), studio: jsonObjectSchema }),
  z.strictObject({
    operation: z.literal("import_graph_generator"),
    stream: z.string(),
    generator: z.string(),
    name: z.string().optional(),
    config: jsonObjectSchema.optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("set_exposed_config_fields"), stream: z.string(), level: streamGraphActionLevelSchema, node: z.string(), exposed_config_fields: z.array(z.string()) }),
  z.strictObject({
    operation: z.literal("add_group"),
    stream: z.string(),
    level: streamGraphActionLevelSchema,
    title: z.string(),
    description: z.string().optional(),
    colour: z.string().optional(),
    nodes: z.array(z.string()),
  }),
  z.strictObject({
    operation: z.literal("set_group_fields"),
    stream: z.string(),
    level: streamGraphActionLevelSchema,
    group: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    colour: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("remove_group"), stream: z.string(), level: streamGraphActionLevelSchema, group: z.string() }),
  z.strictObject({
    operation: z.literal("use_dependency_stream"),
    stream: z.string(),
    project: z.string(),
    dependency_stream: z.string(),
    name: z.string().optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("collapse_selection_into_subgraph"), stream: z.string(), level: streamGraphActionLevelSchema, nodes: z.array(z.string()), name: z.string(), as: z.string().optional() }),
  z.strictObject({ operation: z.literal("unlock_subgraph"), stream: z.string(), level: streamGraphActionLevelSchema, fragment: z.string() }),
  z.strictObject({ operation: z.literal("add_note"), stream: z.string(), text: z.string(), position: studioCanvasPairSchema, size: studioCanvasPairSchema }),
  z.strictObject({
    operation: z.literal("set_note_fields"),
    stream: z.string(),
    note: z.string(),
    text: z.string().optional(),
    position: studioCanvasPairSchema.optional(),
    size: studioCanvasPairSchema.optional(),
  }),
  z.strictObject({ operation: z.literal("remove_note"), stream: z.string(), note: z.string() }),
]);
/** One action on a stream's graph. */
export type StreamGraphAction = z.infer<typeof streamGraphActionSchema>;

/** Whether a graph transaction is kept: `commit` applies it, writes each graph document and records it in history; `live` applies it to the running streams alone. */
export const graphEditModeSchema = z.enum(["commit", "live"]);
/** Whether a graph transaction is kept. */
export type GraphEditMode = z.infer<typeof graphEditModeSchema>;

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

/** A project's files, or why they were not listed. */
export type ProjectFilesListing = { kind: "listed"; project_files: ProjectFiles } | { kind: "not_listed"; because: string };

/** What a Python language server connection delivers: one JSON-RPC message the server sent, or the server's end with why. */
export type PythonLanguageServerConnectionEvent = { kind: "message"; message: JsonValue } | { kind: "ended"; because: string };

/** What a view's area was opened on: a file of the open project or its imports, or a running node's output port, with the opening's id, so a view that keeps what it opened tells a new opening from one it took before; `null` for an area opened on nothing. */
export type ViewOpenedOn = { kind: "file"; file: string; opening_id: string } | { kind: "port"; target: PortViewerTarget; opening_id: string } | null;

/** Where the view's own header row lies inside its frame: Studio's view-type menu covers the row's start up to `leading_inset_px`, and the row is `height_px` tall, `0` where the frame has no header row, as in the asset picker; neither is below `0`. */
export type ViewHeaderRow = { leading_inset_px: number; height_px: number };
