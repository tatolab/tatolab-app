// The view contract as it crosses the MessagePort between a view's frame and Studio. Every message
// is structured-cloned and parsed against these schemas by whichever end receives it. A full-access
// view's frame shares Studio's origin, so an Image frame crosses as the transferred `VideoFrame`; a
// sandboxed view's opaque origin is another agent cluster, into which Chromium refuses a
// `VideoFrame` with a `messageerror`, so there it crosses as a transferred `ImageBitmap`.

import { z } from "zod";
import {
  jsonValueSchema,
  listedStreamsReadingSchema,
  nodeCatalogReadingSchema,
  openProjectReadingSchema,
  portViewerEventSchema,
  portViewerTargetSchema,
  projectFileReadSchema,
  projectFilesSchema,
  projectLogReadingSchema,
  projectNodeTypesReadingSchema,
  pythonLanguageServerConnectionEventSchema,
  streamGraphReadingSchema,
  streamTabAddressSchema,
  studioSelectionSchema,
  viewHeaderRowSchema,
  viewOpenedOnSchema,
} from "./studio_readings.js";
import { VIEW_CAPABILITIES, viewDeclaredPortSchema, type ViewCapability } from "./tatolab_view_manifest.js";

/** The type of the message Studio posts into a view's frame, carrying the view's end of its MessagePort as its one transferred port. */
export const VIEW_PORT_HANDOVER = "tatolab_view_port";

const watchOrAskIdSchema = z.number().int().nonnegative();

/** What a view may watch. */
export const viewWatchedSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open_project") }),
  z.object({ kind: z.literal("listed_streams") }),
  z.object({ kind: z.literal("active_stream_tab") }),
  z.object({ kind: z.literal("selection") }),
  z.object({ kind: z.literal("stream_graph"), stream: z.string() }),
  z.object({ kind: z.literal("node_catalog"), stream: z.string() }),
  z.object({ kind: z.literal("project_log"), project_folder: z.string() }),
  z.object({ kind: z.literal("project_node_types"), project_folder: z.string() }),
  /** A running node's output port, read until the watch stops. */
  z.object({ kind: z.literal("port_viewer"), target: portViewerTargetSchema }),
  /** What is wired into one of a `node` view's own inputs. */
  z.object({ kind: z.literal("input"), input: z.string() }),
  /** Pyright's language server for a project folder, started for this watch and stopped with it; messages to it go as `send_to_python_language_server` asks. */
  z.object({ kind: z.literal("python_language_server"), project_folder: z.string() }),
  z.object({ kind: z.literal("settings") }),
  z.object({ kind: z.literal("opened_on") }),
  z.object({ kind: z.literal("header_row") }),
]);
/** What a view may watch. */
export type ViewWatchedSubject = z.infer<typeof viewWatchedSubjectSchema>;

/** A file of the open project or its imports, or a running node's output port, that a view of some type is opened on. */
export const viewOpeningTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), file: z.string() }),
  z.object({ kind: z.literal("port"), target: portViewerTargetSchema }),
]);
/** What a view of some type is opened on. */
export type ViewOpeningTarget = z.infer<typeof viewOpeningTargetSchema>;

/** What a view may ask Studio to do; an output's payload travels beside the ask in the same message. */
export const viewAskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("select"), selection: studioSelectionSchema }),
  z.object({ kind: z.literal("open_stream_tab"), stream_tab: streamTabAddressSchema }),
  /** Open a view of `view_type_id` on `on`, in an area showing that type, or in the area the layout gives it. */
  z.object({ kind: z.literal("open_view"), view_type_id: z.string(), on: viewOpeningTargetSchema }),
  /** Keep `settings` with the view's area, checked against the view's declared settings. */
  z.object({ kind: z.literal("remember_settings"), settings: jsonValueSchema }),
  z.object({ kind: z.literal("read_project_file"), file: z.string() }),
  /** Write `text` to `file` whole when it is still at `based_on_version` on disk (`null` for a new file); never over a file changed since, or an import's. */
  z.object({ kind: z.literal("save_project_file"), file: z.string(), text: z.string(), based_on_version: z.string().nullable() }),
  z.object({ kind: z.literal("list_project_files"), project_folder: z.string() }),
  /** One JSON-RPC message for the language server the view's watch `watch_id` started. */
  z.object({ kind: z.literal("send_to_python_language_server"), watch_id: watchOrAskIdSchema, message: jsonValueSchema }),
  z.object({ kind: z.literal("send_output"), output: z.string() }),
]);
/** What a view may ask Studio to do. */
export type ViewAsk = z.infer<typeof viewAskSchema>;

/** One message a view sends Studio. */
export const messageFromTheViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("watch"), watch_id: watchOrAskIdSchema, subject: viewWatchedSubjectSchema }),
  z.object({ kind: z.literal("stop_watching"), watch_id: watchOrAskIdSchema }),
  /** `payload`, beside a `send_output` ask: a `VideoFrame` from a full-access view or an `ImageBitmap` for Image, which Studio then owns, or JSON. */
  z.object({ kind: z.literal("ask"), ask_id: watchOrAskIdSchema, ask: viewAskSchema, payload: z.unknown().optional() }),
]);
/** One message a view sends Studio. */
export type MessageFromTheView = z.infer<typeof messageFromTheViewSchema>;

/** What an input or a port viewer delivers to a sandboxed view: an Image frame as a transferred `ImageBitmap` with its frame's timestamp, which the SDK makes a `VideoFrame` again inside the view. */
export const imageBitmapEventSchema = z.object({
  kind: z.literal("image_bitmap"),
  image_bitmap: z.custom<ImageBitmap>((value) => typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap, "an Image frame is an ImageBitmap"),
  timestamp_microseconds: z.number(),
  format_wire_name: z.string(),
  skipped_since_last_read: z.number(),
});

/** What an input delivers: its port viewer's events, or why nothing is wired into it. */
export const viewInputEventSchema = z.union([portViewerEventSchema, z.object({ kind: z.literal("unwired"), because: z.string() })]);
/** What an input delivers. */
export type ViewInputEvent = z.infer<typeof viewInputEventSchema>;

/** One reading of a watched subject, tagged with the subject's kind. */
export const viewWatchedReadingSchema = z.discriminatedUnion("subject", [
  z.object({ subject: z.literal("open_project"), reading: openProjectReadingSchema }),
  z.object({ subject: z.literal("listed_streams"), reading: listedStreamsReadingSchema }),
  z.object({ subject: z.literal("active_stream_tab"), reading: streamTabAddressSchema.nullable() }),
  z.object({ subject: z.literal("selection"), reading: studioSelectionSchema }),
  z.object({ subject: z.literal("stream_graph"), reading: streamGraphReadingSchema }),
  z.object({ subject: z.literal("node_catalog"), reading: nodeCatalogReadingSchema }),
  z.object({ subject: z.literal("project_log"), reading: projectLogReadingSchema }),
  z.object({ subject: z.literal("project_node_types"), reading: projectNodeTypesReadingSchema }),
  z.object({ subject: z.literal("port_viewer"), reading: z.union([portViewerEventSchema, imageBitmapEventSchema]) }),
  z.object({ subject: z.literal("input"), reading: z.union([viewInputEventSchema, imageBitmapEventSchema]) }),
  z.object({ subject: z.literal("python_language_server"), reading: pythonLanguageServerConnectionEventSchema }),
  z.object({ subject: z.literal("settings"), reading: jsonValueSchema }),
  z.object({ subject: z.literal("opened_on"), reading: viewOpenedOnSchema }),
  z.object({ subject: z.literal("header_row"), reading: viewHeaderRowSchema }),
]);
/** One reading of a watched subject. */
export type ViewWatchedReading = z.infer<typeof viewWatchedReadingSchema>;

/** What Studio answers an ask with: done, refused in words, or what was read, saved or listed. */
export const viewAskAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done") }),
  z.object({ kind: z.literal("refused"), because: z.string() }),
  z.object({ kind: z.literal("project_file_read"), file_read: projectFileReadSchema }),
  z.object({ kind: z.literal("project_file_saved"), version: z.string() }),
  z.object({ kind: z.literal("project_files_listed"), project_files: projectFilesSchema }),
]);
/** What Studio answers an ask with. */
export type ViewAskAnswer = z.infer<typeof viewAskAnswerSchema>;

/** What Studio granted the view, as it reads it on connecting: its id, the contract served, its placement and declared ports, whether it runs sandboxed, and its capabilities, every one for a full-access view. */
export const viewGrantSchema = z.object({
  view_type_id: z.string(),
  contract: z.string(),
  placement: z.enum(["area", "node"]),
  sandboxed: z.boolean(),
  inputs: z.array(viewDeclaredPortSchema),
  outputs: z.array(viewDeclaredPortSchema),
  capabilities: z.array(z.enum(VIEW_CAPABILITIES)),
});
/** What Studio granted the view. */
export type ViewGrant = z.infer<typeof viewGrantSchema>;

/** One message Studio sends a view. */
export const messageFromStudioSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hello"), grant: viewGrantSchema }),
  z.object({ kind: z.literal("watched"), watch_id: watchOrAskIdSchema, watched: viewWatchedReadingSchema }),
  z.object({ kind: z.literal("watch_refused"), watch_id: watchOrAskIdSchema, because: z.string() }),
  z.object({ kind: z.literal("answered"), ask_id: watchOrAskIdSchema, answer: viewAskAnswerSchema }),
]);
/** One message Studio sends a view. */
export type MessageFromStudio = z.infer<typeof messageFromStudioSchema>;

/** The capability a subject needs beyond what every view gets, or `null` when every view may watch it. */
export function capabilityToWatch(subject: ViewWatchedSubject): ViewCapability | null {
  switch (subject.kind) {
    case "selection":
      return "read.selection";
    case "stream_graph":
    case "node_catalog":
    case "port_viewer":
      return "read.stream_graph";
    case "project_log":
    case "project_node_types":
    case "python_language_server":
      return "read.project_assets";
    case "open_project":
    case "listed_streams":
    case "active_stream_tab":
    case "input":
    case "settings":
    case "opened_on":
    case "header_row":
      return null;
  }
}

/** The capability an ask needs beyond what every view gets, or `null` when every view may ask it. */
export function capabilityToAsk(ask: ViewAsk): ViewCapability | null {
  switch (ask.kind) {
    case "select":
    case "open_stream_tab":
    case "open_view":
      return "write.selection";
    case "read_project_file":
    case "list_project_files":
    case "send_to_python_language_server":
      return "read.project_assets";
    case "save_project_file":
      return "write.project_assets";
    case "remember_settings":
    case "send_output":
      return null;
  }
}
