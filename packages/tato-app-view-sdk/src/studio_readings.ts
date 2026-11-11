// Everything a view reads from Tato Studio, as Zod schemas: what crosses a view's MessagePort is
// parsed against these on both ends, and Studio's own code takes its types from them.

import { z } from "zod";
import { PORT_FAMILIES } from "./port_families.js";

/** A value as JSON carries it. */
export const jsonValueSchema = z.json();
/** A value as JSON carries it. */
export type JsonValue = z.infer<typeof jsonValueSchema>;

/** One of the five port families. */
export const portFamilySchema = z.enum(PORT_FAMILIES);

/** Where a stream lives: its project directory as of its last load, symlinks resolved, and the two UUIDs that identify it, its project's and its stream asset's. */
export const streamLocationSchema = z.object({
  project_directory: z.string(),
  /** The project's UUID, from its `tatolab-project.json`. */
  project: z.string(),
  /** The stream asset's UUID, from its graph document. */
  stream_asset: z.string(),
});
/** Where a stream lives. */
export type StreamLocation = z.infer<typeof streamLocationSchema>;

/** One stream the runtime lists. `state` is running, stopped, failed, preparing or stopping, or a state newer than this app. */
export const listedStreamSchema = z.object({
  /** Its stream id, `<project name>-<stream name>-<hash>`, which every tool about one stream names it by. */
  stream: z.string(),
  /** The label the runtime shows it under; free text, and never unique. */
  display_name: z.string(),
  /** `null` for a record an earlier runtime wrote, which is listed failed until it is removed. */
  location: streamLocationSchema.nullable(),
  state: z.string(),
  /** How many nodes its loaded graph holds; `null` while it is not loaded. */
  node_count: z.number().nullable(),
  failed_because: z.string().nullable(),
  /** Each capture device, `camera` or `microphone` or one newer than this app, that a node of the loaded stream refused because nobody has asked the person for its access; empty when it is not loaded. */
  capture_devices_whose_access_was_never_asked_for: z.array(z.string()),
  /** The stream action queued or under way on it while it is `preparing` or `stopping`; `null` otherwise. */
  action: z.string().nullable(),
  /** That action's step, or one newer than this app; `null` while the action waits in its project's queue, and while no action works on it. */
  step: z.string().nullable(),
});
/** One stream the runtime lists. */
export type ListedStream = z.infer<typeof listedStreamSchema>;

/** An Image stream's frame rate, as a rational number of frames per second. */
export const imageStreamFrameRateSchema = z.object({ numerator: z.number(), denominator: z.number() });
/** An Image stream's frame rate. */
export type ImageStreamFrameRate = z.infer<typeof imageStreamFrameRateSchema>;

/** An HDR stream's content light level, in cd/m² (CTA-861.3). */
export const imageStreamContentLightLevelSchema = z.object({ max_content_light_level: z.number(), max_frame_average_light_level: z.number() });
/** An HDR stream's content light level. */
export type ImageStreamContentLightLevel = z.infer<typeof imageStreamContentLightLevelSchema>;

/** The mastering display an HDR stream was graded on (SMPTE ST 2086): luminance in steps of 0.0001 cd/m². */
export const imageStreamMasteringDisplayColourVolumeSchema = z.object({ max_display_mastering_luminance: z.number(), min_display_mastering_luminance: z.number() });
/** The mastering display an HDR stream was graded on. */
export type ImageStreamMasteringDisplayColourVolume = z.infer<typeof imageStreamMasteringDisplayColourVolumeSchema>;

/** An output port's stream facts as the runtime renders them under `stream_facts`, tagged by `family`; a field the port does not state is `null`. */
export const portStreamFactsSchema = z.discriminatedUnion("family", [
  z.object({
    family: z.literal("image"),
    frame_rate: imageStreamFrameRateSchema.nullable(),
    content_light_level: imageStreamContentLightLevelSchema.nullable(),
    mastering_display_colour_volume: imageStreamMasteringDisplayColourVolumeSchema.nullable(),
  }),
  z.object({
    family: z.literal("packets"),
    /** The codec with its profile and level, as an RFC 6381 `codecs` parameter spells it (`avc1.64001f`, `opus`). */
    rfc6381_codec: z.string().nullable(),
    coded_width: z.number().nullable(),
    coded_height: z.number().nullable(),
    sample_rate: z.number().nullable(),
    channel_count: z.number().nullable(),
    /** The bytes of the codec's out-of-band configuration record (`avcC`, `hvcC`, `OpusHead`), from its lowercase hex. */
    codec_configuration_byte_length: z.number().nullable(),
  }),
]);
/** An output port's stream facts. */
export type PortStreamFacts = z.infer<typeof portStreamFactsSchema>;

/** A port a node declares under the graph's `ports.inputs` or `ports.outputs`. */
export const streamGraphDeclaredPortSchema = z.object({
  name: z.string(),
  /** The family the port carries, from its `family` key; `null` while the runtime serves none, or one this app does not know. */
  family: portFamilySchema.nullable(),
  /** What an output states about the stream it carries now, from its `stream_facts` key; `null` when it states none, as every input does. */
  stream_facts: portStreamFactsSchema.nullable(),
  /** `false` on a Records port, whose values no type checks, from its `values_checked` key; `null` on every other family. */
  values_checked: z.boolean().nullable(),
});
/** A port a node declares. */
export type StreamGraphDeclaredPort = z.infer<typeof streamGraphDeclaredPortSchema>;

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
export const streamGraphGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  colour: z.string().nullable(),
});
/** A labelled group of a stream's graph. */
export type StreamGraphGroup = z.infer<typeof streamGraphGroupSchema>;

/** A canvas note of a stream's graph, from its `studio.notes` key: text at a position and size, beside the nodes. */
export const streamGraphNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  position: studioCanvasPairSchema,
  size: studioCanvasPairSchema,
});
/** A canvas note of a stream's graph. */
export type StreamGraphNote = z.infer<typeof streamGraphNoteSchema>;

/** One node of a stream's graph, by the name a link end and a port address name it by. */
export const streamGraphNodeSchema = z.object({
  /** The node's UUID, which a log record's `processor_id` and every graph edit name it by. */
  id: z.string(),
  name: z.string(),
  type: z.string(),
  /** The processor's state as the runtime names it, such as `Running`. */
  state: z.string().nullable(),
  /** Why it failed, in the runtime's own words: set while it reads `Error`, `null` otherwise. */
  failed_because: z.string().nullable(),
  /** What its `process()` last raised, in the runtime's own words, while it keeps raising and stays `Running`; `null` once a call runs cleanly, and for a node that never raised. */
  process_raising_because: z.string().nullable(),
  /** Its config as the graph renders it; `{}` when it renders none. */
  config: z.record(z.string(), jsonValueSchema),
  /** The value set on each unlinked input, by input name, as the graph's `pins` renders it; an input left at its port's default is absent. */
  pins: z.record(z.string(), jsonValueSchema),
  input_ports: z.array(streamGraphDeclaredPortSchema),
  output_ports: z.array(streamGraphDeclaredPortSchema),
  /** Messages it dropped on each link into it, by the link's `id`. */
  dropped_bags_by_link: z.record(z.string(), z.number()),
  /** Messages each of its output ports refused, by port name. */
  refused_bags_by_output_port: z.record(z.string(), z.number()),
  /** What Tato Studio draws it with, from its `studio` key under the runtime's studio contract. */
  studio: streamGraphNodeStudioFieldsSchema,
  /** What it holds when it is a subgraph, from its `fragment` key; `null` on every other node. */
  get fragment() {
    return streamGraphFragmentSchema.nullable();
  },
});
/** One node of a stream's graph. */
export type StreamGraphNode = z.infer<typeof streamGraphNodeSchema>;

/** How a subgraph came to be: `generated` is a `@graph_generator`'s frozen output, its node's `type` the generator; `authored` a collapsed selection (`tatolab.project:AuthoredFragment`); `placed_stream` another stream placed by reference (`tatolab.project:StreamFragment`). */
export const streamGraphFragmentKindSchema = z.enum(["generated", "authored", "placed_stream"]);
/** How a subgraph came to be. */
export type StreamGraphFragmentKind = z.infer<typeof streamGraphFragmentKindSchema>;

/** The graph a subgraph node holds: its nodes, each read as a stream's node is, the links between them and its labelled groups. */
export const streamGraphFragmentSchema = z.object({
  kind: streamGraphFragmentKindSchema,
  get nodes() {
    return z.array(streamGraphNodeSchema);
  },
  get links() {
    return z.array(streamGraphLinkSchema);
  },
  groups: z.array(streamGraphGroupSchema),
});
/** The graph a subgraph node holds. */
export type StreamGraphFragment = z.infer<typeof streamGraphFragmentSchema>;

/** One link of a stream's graph, from an output port to an input port; the source may be in another stream. */
export const streamGraphLinkSchema = z.object({
  /** The runtime's id of the link, which a node's `dropped_bags_by_link` is keyed by. */
  id: z.string(),
  source_node: z.string(),
  source_port: z.string(),
  target_node: z.string(),
  target_port: z.string(),
  /** `wired`, `pending`, `awaiting_remote`, `error`, `disconnecting` or `disconnected`. */
  state: z.string(),
});
/** One link of a stream's graph. */
export type StreamGraphLink = z.infer<typeof streamGraphLinkSchema>;

/** One loaded stream's nodes and links, and the document they were read from. */
export const streamGraphSummarySchema = z.object({
  stream: z.string(),
  /** The stream asset's UUID, from the graph's `asset` key, which every graph edit names the stream by; `null` when the graph renders none. */
  stream_asset: z.string().nullable(),
  groups: z.array(streamGraphGroupSchema),
  notes: z.array(streamGraphNoteSchema),
  nodes: z.array(streamGraphNodeSchema),
  links: z.array(streamGraphLinkSchema),
  /** The `graph` tool's text exactly as the runtime wrote it. */
  graph_document_text: z.string(),
});
/** One loaded stream's nodes and links. */
export type StreamGraphSummary = z.infer<typeof streamGraphSummarySchema>;

/** One port a node type declares, as the node catalog lists it. */
export const nodeCatalogPortSchema = z.object({
  name: z.string(),
  description: z.string(),
  family: portFamilySchema.nullable(),
});
/** One port a node type declares. */
export type NodeCatalogPort = z.infer<typeof nodeCatalogPortSchema>;

/** One node type a stream can add, as the node catalog lists it under the `type` a graph node carries. */
export const nodeCatalogEntrySchema = z.object({
  type: z.string(),
  description: z.string(),
  /** Its config's JSON Schema, draft 2020-12 with no `$schema` key; `null` for a type described without one. */
  config_schema: jsonValueSchema.nullable(),
  inputs: z.array(nodeCatalogPortSchema),
  outputs: z.array(nodeCatalogPortSchema),
});
/** One node type a stream can add. */
export type NodeCatalogEntry = z.infer<typeof nodeCatalogEntrySchema>;

/** Every node type the loaded stream `stream` can add. */
export const nodeCatalogSchema = z.object({ stream: z.string(), node_types: z.array(nodeCatalogEntrySchema) });
/** Every node type a loaded stream can add. */
export type NodeCatalog = z.infer<typeof nodeCatalogSchema>;

/** One port of a node type as its declaration states it in source. */
export const projectNodeTypePortSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** `null` where source alone does not say, or for one this app does not know. */
  family: portFamilySchema.nullable(),
  /** A function or shader port's annotation as written; `null` for a process node's port. */
  annotation: z.string().nullable(),
});
/** One port of a node type as source states it. */
export type ProjectNodeTypePort = z.infer<typeof projectNodeTypePortSchema>;

/** One node type a project's source declares. */
export const projectNodeTypeSchema = z.object({
  /** The type `add_node` takes: the import path `<module>:<qualname>`. */
  type: z.string(),
  /** `process`, `function` or `shader`, or a kind newer than this app; `null` where source does not show it. */
  kind: z.string().nullable(),
  description: z.string(),
  /** The Library category, the declaring module when none is declared. */
  category: z.string(),
  /** `null` where only the node's native half states its ports. */
  inputs: z.array(projectNodeTypePortSchema).nullable(),
  outputs: z.array(projectNodeTypePortSchema).nullable(),
  /** The declaring file, relative to its source's root. */
  path: z.string().nullable(),
  line: z.number().nullable(),
});
/** One node type a project's source declares. */
export type ProjectNodeType = z.infer<typeof projectNodeTypeSchema>;

/** One `@graph_generator` a project's source declares. */
export const projectGraphGeneratorSchema = z.object({
  /** The import path `import_graph_generator` takes: `<module>:<function>`. */
  generator: z.string(),
  /** Its docstring. */
  description: z.string(),
  promoted_config: z.array(z.object({ name: z.string(), annotation: z.string().nullable() })),
  path: z.string(),
  line: z.number(),
});
/** One `@graph_generator` a project's source declares. */
export type ProjectGraphGenerator = z.infer<typeof projectGraphGeneratorSchema>;
/** One setting a graph generator promotes, as its parameter states it. */
export type ProjectGraphGeneratorPromotedSetting = ProjectGraphGenerator["promoted_config"][number];

/** A module of a source that does not parse, with why in the parser's words and where it stopped. */
export const projectNodeModuleNotReadableSchema = z.object({
  module: z.string(),
  path: z.string(),
  line: z.number().nullable(),
  column: z.number().nullable(),
  why: z.string(),
});
/** A module of a source that does not parse. */
export type ProjectNodeModuleNotReadable = z.infer<typeof projectNodeModuleNotReadableSchema>;

/** Where a listed source's node code comes from: the project, an import by its UUID, folder under `imports/` and copied version, an installed distribution, or an origin newer than this app. */
export const projectNodeTypeSourceOriginSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("project") }),
  z.object({ source: z.literal("dependency"), project: z.string(), folder: z.string(), version: z.string() }),
  z.object({ source: z.literal("installed_distribution"), distribution: z.string(), distribution_version: z.string() }),
  z.object({ source: z.literal("newer_than_this_app"), source_name: z.string() }),
]);
/** Where a listed source's node code comes from. */
export type ProjectNodeTypeSourceOrigin = z.infer<typeof projectNodeTypeSourceOriginSchema>;

/** One source's node types, graph generators, and the modules of it that do not parse. */
export const projectNodeTypeSourceSchema = z.object({
  origin: projectNodeTypeSourceOriginSchema,
  node_types: z.array(projectNodeTypeSchema),
  graph_generators: z.array(projectGraphGeneratorSchema),
  unreadable_modules: z.array(projectNodeModuleNotReadableSchema),
});
/** One source's node types. */
export type ProjectNodeTypeSource = z.infer<typeof projectNodeTypeSourceSchema>;

/** What the project and each source it draws node code from declares, read from source without running it. */
export const projectNodeTypeListingSchema = z.object({
  /** The project's folder, its links resolved. */
  project_directory: z.string(),
  /** The project's UUID. */
  project: z.string(),
  project_name: z.string(),
  /** The project first, then each import, then each installed distribution. */
  sources: z.array(projectNodeTypeSourceSchema),
});
/** What a project and its sources declare. */
export type ProjectNodeTypeListing = z.infer<typeof projectNodeTypeListingSchema>;

/** An asset's preview picture as `list_assets` sizes it: an image's own picture or a video's poster frame, which `read_asset_preview` answers. */
export const projectAssetPreviewSchema = z.object({
  pixel_width: z.number().int().positive(),
  pixel_height: z.number().int().positive(),
  /** `image/png`. */
  media_type: z.string(),
});
/** An asset's preview picture as `list_assets` sizes it. */
export type ProjectAssetPreview = z.infer<typeof projectAssetPreviewSchema>;

/** An asset's preview picture as Studio hands it to a window or a view: a `data:` URL of the runtime's picture and its size. */
export const assetPreviewPictureSchema = z.object({
  /** `data:image/png;base64,…`. */
  picture_url: z.string().startsWith("data:image/"),
  pixel_width: z.number().int().positive(),
  pixel_height: z.number().int().positive(),
});
/** An asset's preview picture as Studio hands it over. */
export type AssetPreviewPicture = z.infer<typeof assetPreviewPictureSchema>;

/** One asset of a project as the runtime's `list_assets` lists it. */
export const projectAssetSchema = z.object({
  /** The asset's UUID, which a node's config names it by as `{"asset": <uuid>}`. */
  asset: z.string(),
  /** `media` (video, audio, an image), `scene`, `data` (a LUT, model weights, a font…) or `stream` (a graph document); a kind the runtime adds later reads as it spells it. */
  kind: z.string(),
  /** Where it sits, `/`-separated and relative to the project's folder. */
  path: z.string(),
  content_sha256: z.string(),
  content_byte_len: z.number().int().nonnegative(),
  /** The settings its import took, kept in its sidecar. */
  import_settings: z.record(z.string(), jsonValueSchema),
  /** Its preview picture; `null` for an asset with none, as a stream, audio or a LUT, and for one whose bytes the runtime is still reading. */
  preview: projectAssetPreviewSchema.nullable(),
});
/** One asset of a project. */
export type ProjectAsset = z.infer<typeof projectAssetSchema>;

/** A project's assets as the runtime's `list_assets` lists them, in its order, which is by path. */
export const projectAssetListingSchema = z.object({
  /** The project's folder, its links resolved. */
  project_directory: z.string(),
  /** The project's UUID. */
  project: z.string(),
  project_name: z.string(),
  assets: z.array(projectAssetSchema),
});
/** A project's assets. */
export type ProjectAssetListing = z.infer<typeof projectAssetListingSchema>;

/** What importing the files the person chose answered: each asset the runtime's `import_asset` made, by its UUID and path, and each file it refused, in its own words. */
export const projectAssetsImportedSchema = z.object({
  imported: z.array(z.object({ asset: z.string(), path: z.string() })),
  refused: z.array(z.object({ file_name: z.string(), because: z.string() })),
});
/** What importing the chosen files answered. */
export type ProjectAssetsImported = z.infer<typeof projectAssetsImportedSchema>;

/** An asset's preview picture read, or why not, in Studio's or the runtime's words. */
export const assetPreviewReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), picture: assetPreviewPictureSchema }),
  z.object({ kind: z.literal("not_read"), because: z.string() }),
]);
/** An asset's preview picture read, or why not. */
export type AssetPreviewReading = z.infer<typeof assetPreviewReadingSchema>;

/** Files the person chose imported into the project, nothing chosen, or why nothing was asked of the runtime. */
export const projectAssetsImportingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("imported"), assets_imported: projectAssetsImportedSchema }),
  z.object({ kind: z.literal("nothing_chosen") }),
  z.object({ kind: z.literal("not_imported"), because: z.string() }),
]);
/** Files the person chose imported, nothing chosen, or why not. */
export type ProjectAssetsImporting = z.infer<typeof projectAssetsImportingSchema>;

/** A project as the runtime's `list_assets` names it, from its `tatolab-project.json`. */
export const projectTheRuntimeNamesSchema = z.object({
  /** The folder, absolute with its links resolved. */
  folder: z.string(),
  /** The project's UUID. */
  project: z.string(),
  name: z.string(),
});
/** A project as the runtime names it. */
export type ProjectTheRuntimeNames = z.infer<typeof projectTheRuntimeNamesSchema>;

/** An imported project's copy under `imports/`, named by the runtime or with the runtime's words for why it could not be. */
export const importedProjectSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("folder"), project: projectTheRuntimeNamesSchema }),
  z.object({ kind: z.literal("folder_unreadable"), folder: z.string(), refusal: z.string() }),
]);
/** An imported project's copy under `imports/`. */
export type ImportedProjectSource = z.infer<typeof importedProjectSourceSchema>;

/** One project the open project imports, as the runtime's `list_dependencies` lists it, which Studio shows as an import. */
export const importedProjectSchema = z.object({
  /** The UUID `list_dependencies` lists it by. */
  project: z.string(),
  /** The name the runtime reads from its copy, or its folder's name where the runtime could not read it. */
  name: z.string(),
  /** Its folder under `imports/`. */
  folder: z.string(),
  source: importedProjectSourceSchema,
});
/** One project the open project imports. */
export type ImportedProject = z.infer<typeof importedProjectSchema>;

/** The open project: its folder's own project, and the projects it imports in the runtime's order, or why the runtime did not list them. */
export const openProjectSchema = z.object({
  project: projectTheRuntimeNamesSchema,
  imports: z.array(importedProjectSchema),
  /** The runtime's words, or that no runtime answered, when `imports` could not be listed; `null` when they were. */
  imports_not_listed_because: z.string().nullable(),
});
/** The open project. */
export type OpenProject = z.infer<typeof openProjectSchema>;

/** No project open, the open one read, or its folder unreadable, with why in the words of what refused. */
export const openProjectReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none_open") }),
  z.object({ kind: z.literal("read"), open_project: openProjectSchema }),
  z.object({ kind: z.literal("unreadable"), folder: z.string(), refusal: z.string() }),
]);
/** What Studio reads of the open project. */
export type OpenProjectReading = z.infer<typeof openProjectReadingSchema>;

/** A file of the open project or its imports, as read from disk. */
export const projectFileReadSchema = z.object({
  /** The file, absolute, as the view named it. */
  file: z.string(),
  /** The folder of the project the file belongs to. */
  project_folder: z.string(),
  text: z.string(),
  /** The SHA-256 of the bytes read, in hex, which a save takes back as `based_on_version`. */
  version: z.string(),
  /** Whether the file belongs to the open project, whose files Studio saves; an import's are read-only. */
  is_editable: z.boolean(),
});
/** A file of the open project or its imports, as read from disk. */
export type ProjectFileRead = z.infer<typeof projectFileReadSchema>;

/** A project's Python files and `pyproject.toml`, relative to its folder, in name order. */
export const projectFilesSchema = z.object({ project_folder: z.string(), files: z.array(z.string()) });
/** A project's files. */
export type ProjectFiles = z.infer<typeof projectFilesSchema>;

/** One record of a project's log, flattened from the runtime's JSONL record. */
export const projectLogRecordSchema = z.object({
  /** Nanoseconds since the Unix epoch; past 2^53, so it arrives rounded to a few hundred nanoseconds. */
  host_ts_ns: z.number().nullable(),
  level: z.string().nullable(),
  source: z.string().nullable(),
  target: z.string().nullable(),
  message: z.string(),
  attrs: z.record(z.string(), z.string()),
  /** The graph `id` of the step that wrote it; `null` for a record written outside a step. */
  processor_id: z.string().nullable(),
  /** Whether a step's own helper process wrote it rather than the runtime's process. */
  sent_by_its_own_process: z.boolean(),
  /** The id of the stream action it was written for; `null` for a record written outside one. */
  action: z.string().nullable(),
  /** The id of the stream that wrote it; `null` for a record of the project's own. */
  stream: z.string().nullable(),
  /** The record as JSON text, every number in the digits the runtime wrote, so `host_ts` is exact. */
  jsonl_line: z.string(),
});
/** One record of a project's log. */
export type ProjectLogRecord = z.infer<typeof projectLogRecordSchema>;

/** The output port of a running node a port viewer reads: the stream's id, the node's id as `graph` lists it, and the port's name. */
export const portViewerTargetSchema = z.object({ stream: z.string(), node_id: z.string(), port: z.string() });
/** The output port of a running node a port viewer reads. */
export type PortViewerTarget = z.infer<typeof portViewerTargetSchema>;

/** One channel of a Channels block: the lowest and highest sample of each of its columns, its peak and its RMS. */
export const portViewerChannelWaveformSchema = z.object({
  column_minimums: z.array(z.number()),
  column_maximums: z.array(z.number()),
  peak: z.number(),
  rms: z.number(),
});
/** One channel of a Channels block as a waveform. */
export type PortViewerChannelWaveform = z.infer<typeof portViewerChannelWaveformSchema>;

/** One attribute of an Array frame: its name, element type and shape, where its data lives, and, for numeric data in the payload, its statistics. */
export const portViewerArrayAttributeReadingSchema = z.object({
  name: z.string(),
  dtype: z.string(),
  shape: z.array(z.number()),
  residency: z.enum(["cpu", "gpu"]),
  statistics: z.object({ element_count: z.number(), minimum: z.number(), maximum: z.number(), mean: z.number() }).nullable(),
});
/** One attribute of an Array frame. */
export type PortViewerArrayAttributeReading = z.infer<typeof portViewerArrayAttributeReadingSchema>;

/** What a port viewer read of one message of a family other than Image, from the family's descriptor and payload. */
export const portViewerMessageReadingSchema = z.discriminatedUnion("family", [
  z.object({
    family: z.literal("channels"),
    start_sample: z.number(),
    sample_rate: z.number(),
    channel_count: z.number(),
    samples_per_channel: z.number(),
    sample_type: z.string(),
    channel_waveforms: z.array(portViewerChannelWaveformSchema),
  }),
  z.object({ family: z.literal("array"), attributes: z.array(portViewerArrayAttributeReadingSchema) }),
  z.object({ family: z.literal("packets"), codec: z.string(), byte_length: z.number(), starts_group: z.boolean(), timestamp_ns: z.number() }),
  z.object({ family: z.literal("records"), record: jsonValueSchema }),
  z.object({ family: z.literal("bytes"), byte_length: z.number() }),
  z.object({ family: z.literal("unreadable"), port_family: z.string(), because: z.string() }),
]);
/** What a port viewer read of one message of a family other than Image. */
export type PortViewerMessageReading = z.infer<typeof portViewerMessageReadingSchema>;

/** What Studio has selected, which every view shows and any view may change. */
export const studioSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("nothing") }),
  z.object({ kind: z.literal("project"), project_name: z.string(), project_folder: z.string().nullable() }),
  z.object({ kind: z.literal("stream"), stream: z.string(), project_folder: z.string() }),
  z.object({ kind: z.literal("node"), stream: z.string(), node: z.string() }),
]);
/** What Studio has selected. */
export type StudioSelection = z.infer<typeof studioSelectionSchema>;

/** A stream a tab is open on: its id, and the project and words its tab is labelled with. */
export const streamTabAddressSchema = z.object({ stream: z.string(), project_name: z.string(), display_name: z.string() });
/** A stream a tab is open on. */
export type StreamTabAddress = z.infer<typeof streamTabAddressSchema>;

/** The streams the runtime lists; why none are listed while the runtime is not running; or why listing them failed while it runs, in the failure's own words. */
export const listedStreamsReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listed"), streams: z.array(listedStreamSchema) }),
  z.object({ kind: z.literal("not_listed"), because: z.string() }),
  z.object({ kind: z.literal("listing_failed"), because: z.string() }),
]);
/** The streams the runtime lists, or why none are. */
export type ListedStreamsReading = z.infer<typeof listedStreamsReadingSchema>;

/** A stream's graph as the runtime renders it now, or why it renders none, in its own words. */
export const streamGraphReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), graph: streamGraphSummarySchema }),
  z.object({ kind: z.literal("not_read"), because: z.string() }),
]);
/** A stream's graph, or why none. */
export type StreamGraphReading = z.infer<typeof streamGraphReadingSchema>;

/** The node types a stream can add, or why the runtime lists none, in its own words. */
export const nodeCatalogReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listed"), catalog: nodeCatalogSchema }),
  z.object({ kind: z.literal("not_listed"), because: z.string() }),
]);
/** The node types a stream can add, or why none. */
export type NodeCatalogReading = z.infer<typeof nodeCatalogReadingSchema>;

/** What a project and each source it draws node code from declares, or why the runtime lists none, in its own words. */
export const projectNodeTypesReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listed"), listing: projectNodeTypeListingSchema }),
  z.object({ kind: z.literal("not_listed"), because: z.string() }),
]);
/** What a project's sources declare, or why none. */
export type ProjectNodeTypesReading = z.infer<typeof projectNodeTypesReadingSchema>;

/** One input or output a `node` view declares: its name and family. */
export const studioViewDeclaredPortSchema = z.object({ name: z.string(), family: portFamilySchema, description: z.string() });

/** A view an area can show: its view type id, what its manifest says of it, who brought it, and why it does not open (`null` when it does). */
export const studioViewListedSchema = z.object({
  view_type_id: z.string(),
  title: z.string(),
  description: z.string(),
  /** `Tato Studio` for a view Studio ships with, else the name of the project or import bringing it. */
  brought_by: z.string(),
  is_built_in: z.boolean(),
  /** `area` or `node`, as its manifest places it; `null` for one that does not open. */
  placement: z.enum(["area", "node"]).nullable(),
  inputs: z.array(studioViewDeclaredPortSchema),
  outputs: z.array(studioViewDeclaredPortSchema),
  not_opened_because: z.string().nullable(),
});
/** A view an area can show. */
export type StudioViewListed = z.infer<typeof studioViewListedSchema>;

/** The views Studio ships with and those the open project and its imports bring, or why the project's are not listed, in the runtime's words. */
export const studioViewsReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listed"), studio_views: z.array(studioViewListedSchema) }),
  z.object({ kind: z.literal("not_listed"), built_in_views: z.array(studioViewListedSchema), because: z.string() }),
]);
/** The views an area can show, or why the project's are not listed. */
export type StudioViewsReading = z.infer<typeof studioViewsReadingSchema>;

/** A project's assets, or why the runtime lists none, in its own words. */
export const projectAssetsReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listed"), listing: projectAssetListingSchema }),
  z.object({ kind: z.literal("not_listed"), because: z.string() }),
]);
/** A project's assets, or why none. */
export type ProjectAssetsReading = z.infer<typeof projectAssetsReadingSchema>;

/** A project's log as read so far, its latest records last, or why the runtime gives none now, in its own words. */
export const projectLogReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), records: z.array(projectLogRecordSchema), records_no_longer_held: z.boolean() }),
  z.object({ kind: z.literal("not_read"), because: z.string() }),
]);
/** A project's log, or why none. */
export type ProjectLogReading = z.infer<typeof projectLogReadingSchema>;

/** One transaction on a project's change feed, as the runtime's `streamlib://project/<project>/transactions` resource carries it. */
export const projectTransactionSchema = z.object({
  /** The format the runtime recorded it in, `1` for one recorded before formats were. */
  format_version: z.number().int(),
  /** The transaction's UUID. */
  transaction: z.string(),
  /** The commit on the project history's `main` that records it. */
  commit: z.string(),
  /** The commit history stood at when it applied, `null` for a project's first. */
  parent_commit: z.string().nullable(),
  /** `person`, `agent` or `runtime`, or a kind newer than this app. */
  author_kind: z.string(),
  /** The author's name as history shows it: an agent's MCP client name. */
  author_name: z.string(),
  /** What it changed, in order, each tagged by its `operation`, as the runtime sent them. */
  operations: z.array(jsonValueSchema),
  /** What undoes it, in order, as the runtime sent them. */
  inverse_operations: z.array(jsonValueSchema),
  /** The transaction this one undoes, when it is an undo. */
  undoes: z.string().nullable(),
  /** The transaction this one redoes, when it is a redo. */
  redoes: z.string().nullable(),
  /** The key its caller sent it under, `null` when it sent none. */
  idempotency_key: z.string().nullable(),
  /** Where an edit or a redo stands with its author's undo and redo now, the same for an edit and every redo of it: `applied`, `undone_redoable` or `undone_not_redoable`, or a state newer than this app; `null` for an undo. */
  undo_state: z.string().nullable(),
  /** When the runtime applied it, RFC 3339 in UTC to the second, for display only. */
  applied_at: z.string(),
});
/** One transaction on a project's change feed. */
export type ProjectTransaction = z.infer<typeof projectTransactionSchema>;

/** One end of the link a refused operation names: a node by UUID or `as` label, and one of its ports. */
export const refusedGraphLinkEndSchema = z.object({ node: z.string(), port: z.string() });

/** What the runtime refused of an action, and why in its own words. */
export const projectActionRefusalSchema = z.object({
  /** The action refused, by the name of the tool it was sent to. */
  action: z.string(),
  /** The position, from 0, of the operation refused among those the action sent; `null` when none was. */
  refused_operation_index: z.number().int().nullable(),
  /** The node the refused operation names, as the caller named it. */
  refused_node: z.string().nullable(),
  /** The link the refused operation names. */
  refused_link: z.object({ source: refusedGraphLinkEndSchema, target: refusedGraphLinkEndSchema }).nullable(),
  /** The node's input or config field the refused operation names. */
  refused_field: z.string().nullable(),
  /** Why, in the runtime's own words, never rewritten. */
  runtime_words: z.string(),
});
/** What the runtime refused of an action, and why. */
export type ProjectActionRefusal = z.infer<typeof projectActionRefusalSchema>;

/** An action on a project the runtime refused since it started, which no history records. */
export const refusedProjectActionSchema = z.object({
  /** `person`, `agent` or `runtime`, or a kind newer than this app. */
  author_kind: z.string(),
  /** The author's name as an applied transaction would carry it. */
  author_name: z.string(),
  /** `commit` or `live`, as the action asked. */
  mode: z.string(),
  /** The operations the action asked for, in order, as the request named them; none for an undo or a redo. */
  operations: z.array(jsonValueSchema),
  /** The key its caller sent it under, `null` when it sent none. */
  idempotency_key: z.string().nullable(),
  refusal: projectActionRefusalSchema,
  /** When the runtime refused it, RFC 3339 in UTC to the second, for display only. */
  refused_at: z.string(),
});
/** An action on a project the runtime refused. */
export type RefusedProjectAction = z.infer<typeof refusedProjectActionSchema>;

/** A project's change feed: its UUID, its directory, its newest transactions, and the actions the runtime refused lately, each newest first. */
export const projectTransactionsSchema = z.object({
  project: z.string(),
  project_directory: z.string(),
  transactions: z.array(projectTransactionSchema),
  /** The runtime keeps the latest 100 it refused, in memory, so a restart forgets them. */
  refused_actions: z.array(refusedProjectActionSchema),
});
/** A project's change feed. */
export type ProjectTransactions = z.infer<typeof projectTransactionsSchema>;

/** A project's change feed as last read, or why the runtime gives none now, in its own words. */
export const projectTransactionsReadingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), project_transactions: projectTransactionsSchema }),
  z.object({ kind: z.literal("not_read"), because: z.string() }),
]);
/** A project's change feed, or why none. */
export type ProjectTransactionsReading = z.infer<typeof projectTransactionsReadingSchema>;

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

/**
 * One action on a stream's graph as the runtime's `transact` takes it (`StreamGraphAction` in streamlib's
 * `stream_graph_action.rs`), tagged by `operation`: `stream` is the stream asset's UUID, a node is named by its
 * UUID or an `as` label, and a key the runtime does not take is refused, here as there.
 */
export const streamGraphActionSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("add_node"),
    stream: z.string(),
    type: z.string(),
    name: z.string().optional(),
    config: jsonObjectSchema.optional(),
    pins: jsonObjectSchema.optional(),
    exposed_config_fields: z.array(z.string()).optional(),
    studio: jsonObjectSchema.optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("remove_node"), stream: z.string(), node: z.string() }),
  z.strictObject({ operation: z.literal("connect"), stream: z.string(), source: streamGraphActionLinkEndSchema, target: streamGraphActionLinkEndSchema }),
  z.strictObject({ operation: z.literal("disconnect"), stream: z.string(), source: streamGraphActionLinkEndSchema, target: streamGraphActionLinkEndSchema }),
  /** Replaces the node's config whole. */
  z.strictObject({ operation: z.literal("set_node_config"), stream: z.string(), node: z.string(), config: jsonObjectSchema }),
  /** An absent or `null` value takes the input's value off. */
  z.strictObject({ operation: z.literal("set_pin_value"), stream: z.string(), node: z.string(), input: z.string(), value: jsonValueSchema.optional() }),
  z.strictObject({ operation: z.literal("rename_node"), stream: z.string(), node: z.string(), name: z.string() }),
  /** Replaces the node's studio fields whole. */
  z.strictObject({ operation: z.literal("set_studio_fields"), stream: z.string(), node: z.string(), studio: jsonObjectSchema }),
  z.strictObject({
    operation: z.literal("import_graph_generator"),
    stream: z.string(),
    generator: z.string(),
    name: z.string().optional(),
    config: jsonObjectSchema.optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("set_exposed_config_fields"), stream: z.string(), node: z.string(), exposed_config_fields: z.array(z.string()) }),
  z.strictObject({
    operation: z.literal("add_group"),
    stream: z.string(),
    title: z.string(),
    description: z.string().optional(),
    colour: z.string().optional(),
    nodes: z.array(z.string()),
  }),
  z.strictObject({
    operation: z.literal("set_group_fields"),
    stream: z.string(),
    group: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    colour: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("remove_group"), stream: z.string(), group: z.string() }),
  z.strictObject({
    operation: z.literal("use_dependency_stream"),
    stream: z.string(),
    project: z.string(),
    dependency_stream: z.string(),
    name: z.string().optional(),
    as: z.string().optional(),
  }),
  z.strictObject({ operation: z.literal("collapse_selection_into_subgraph"), stream: z.string(), nodes: z.array(z.string()), name: z.string(), as: z.string().optional() }),
  z.strictObject({ operation: z.literal("unlock_generator_fragment"), stream: z.string(), fragment: z.string() }),
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
export const graphLinkEndSchema = z.object({ node: z.string(), port: z.string() });
/** A link end as the runtime answers it. */
export type GraphLinkEnd = z.infer<typeof graphLinkEndSchema>;

/** What a graph transaction applied, as `transact` answers it (`GraphTransactionToolResult` in `local_api_wire_contract.rs`); each `stream` here is a stream id. */
export const projectGraphTransactionSchema = z.object({
  mode: graphEditModeSchema,
  /** The transaction's UUID; `null` on a live one, which history never records. */
  transaction: z.string().nullable(),
  /** The commit on the project history's `main` recording it; `null` on a live one. */
  commit: z.string().nullable(),
  /** Each operation as applied, in order, tagged by its `operation`. */
  operations: z.array(jsonValueSchema),
  /** Each node it added: its new UUID as `node`, the name it took, and the `as` its `add_node` gave it. */
  added_nodes: z.array(z.object({ stream: z.string(), node: z.string(), name: z.string(), as: z.string().nullable() })),
  /** Each link it made, with `state` `pending`, `wired` or `error` (`null` when the graph could not be read after it) and why an `error` link carries nothing. */
  connected_links: z.array(
    z.object({ stream: z.string(), source: graphLinkEndSchema, target: graphLinkEndSchema, state: z.string().nullable(), error_reason: z.string().nullable() }),
  ),
  added_groups: z.array(z.object({ stream: z.string(), group: z.string(), title: z.string() })),
  added_notes: z.array(z.object({ stream: z.string(), note: z.string() })),
});
/** What a graph transaction applied. */
export type ProjectGraphTransaction = z.infer<typeof projectGraphTransactionSchema>;

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
export const pythonLanguageServerConnectionEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), message: jsonValueSchema }),
  z.object({ kind: z.literal("ended"), because: z.string() }),
]);
/** What a Python language server connection delivers. */
export type PythonLanguageServerConnectionEvent = z.infer<typeof pythonLanguageServerConnectionEventSchema>;

/** What a view's area was opened on: a file of the open project or its imports, or a running node's output port, with the opening's id, so a view that keeps what it opened tells a new opening from one it took before; `null` for an area opened on nothing. */
export const viewOpenedOnSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("file"), file: z.string(), opening_id: z.string() }),
    z.object({ kind: z.literal("port"), target: portViewerTargetSchema, opening_id: z.string() }),
  ])
  .nullable();
/** What a view's area was opened on. */
export type ViewOpenedOn = z.infer<typeof viewOpenedOnSchema>;

/** Where the view's own header row lies inside its frame: Studio's view-type menu covers the row's start up to `leading_inset_px`, and the row is `height_px` tall. */
export const viewHeaderRowSchema = z.object({ leading_inset_px: z.number().nonnegative(), height_px: z.number().positive() });
/** Where the view's own header row lies inside its frame. */
export type ViewHeaderRow = z.infer<typeof viewHeaderRowSchema>;
