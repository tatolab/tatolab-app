// The view contract as it crosses the MessagePort between a sandboxed view and the studio. Every
// message is structured-cloned, and an Image frame crosses as a transferred `ImageBitmap`: Chromium
// refuses a `VideoFrame` into a frame of another agent cluster, which a sandboxed frame's opaque
// origin is, with a `messageerror`. The host reads what a view sends as untrusted and refuses
// anything its grant does not cover.

import type { JsonValue, OpenProjectReading } from "../../shared/tatolab_backend_contract";
import type { StudioViewCapability, StudioViewDeclaredPort } from "../../shared/studio_view_manifest";
import type {
  ListedStreamsReading,
  NodeCatalogReading,
  PortViewerConnectionEvent,
  StreamGraphReading,
  StreamTabAddress,
  StudioSelection,
} from "./studio_view_contract";

/** The type of the message the studio posts into a view's frame, carrying the view's end of its MessagePort as its one transferred port. */
export const STUDIO_VIEW_PORT_HANDOVER = "tatolab_studio_view_port";

/** What a view may watch: the studio's open project, streams, active tab and selection, a stream's graph or catalog, or one of its own inputs. */
export type StudioViewWatchedSubject =
  | { kind: "open_project" }
  | { kind: "listed_streams" }
  | { kind: "active_stream_tab" }
  | { kind: "selection" }
  | { kind: "stream_graph"; stream: string }
  | { kind: "node_catalog"; stream: string }
  | { kind: "input"; input: string };

/** What a view may ask the studio to do; an output's payload travels beside the ask. */
export type StudioViewAsk =
  | { kind: "select"; selection: StudioSelection }
  | { kind: "open_stream_tab"; stream_tab: StreamTabAddress }
  | { kind: "send_output"; output: string };

/** One message a view sends the studio. */
export type MessageFromTheStudioView =
  | { kind: "watch"; watch_id: number; subject: StudioViewWatchedSubject }
  | { kind: "stop_watching"; watch_id: number }
  | { kind: "ask"; ask_id: number; ask: StudioViewAsk };

/** What a view's input delivers: its port viewer's events, an Image frame as a `VideoFrame` the view closes once drawn, or why nothing is wired into it. */
export type StudioViewInputEvent = PortViewerConnectionEvent | { kind: "unwired"; because: string };

/** A view input's event as it crosses the port: an Image frame as a transferred `ImageBitmap` with its frame's timestamp, which the SDK makes a `VideoFrame` again inside the view. */
export type StudioViewInputEventOnThePort =
  | { kind: "image_bitmap"; image_bitmap: ImageBitmap; timestamp_microseconds: number; format_wire_name: string; skipped_since_last_read: number }
  | Exclude<StudioViewInputEvent, { kind: "image_frame" }>;

/** One reading of a watched subject, tagged with the subject's kind. */
export type StudioViewWatchedReading =
  | { subject: "open_project"; reading: OpenProjectReading }
  | { subject: "listed_streams"; reading: ListedStreamsReading }
  | { subject: "active_stream_tab"; reading: StreamTabAddress | null }
  | { subject: "selection"; reading: StudioSelection }
  | { subject: "stream_graph"; reading: StreamGraphReading }
  | { subject: "node_catalog"; reading: NodeCatalogReading }
  | { subject: "input"; reading: StudioViewInputEventOnThePort };

/** What the studio answers an ask with: done, or refused in words. */
export type StudioViewAskAnswer = { kind: "done" } | { kind: "refused"; because: string };

/** What the studio granted the view, as it reads it on connecting: its type, the contract served, its declared ports and its capabilities. */
export interface StudioViewGrant {
  view_type_id: string;
  contract: { major: number; minor: number };
  inputs: StudioViewDeclaredPort[];
  outputs: StudioViewDeclaredPort[];
  capabilities: StudioViewCapability[];
}

/** One message the studio sends a view. */
export type MessageFromTheStudioHost =
  | { kind: "hello"; grant: StudioViewGrant }
  | { kind: "watched"; watch_id: number; watched: StudioViewWatchedReading }
  | { kind: "watch_refused"; watch_id: number; because: string }
  | { kind: "answered"; ask_id: number; answer: StudioViewAskAnswer };

/** The capability a subject needs beyond what every view gets, or `null` when every view may watch it. */
export function capabilityToWatch(subject: StudioViewWatchedSubject): StudioViewCapability | null {
  switch (subject.kind) {
    case "selection":
      return "read.selection";
    case "stream_graph":
    case "node_catalog":
      return "read.stream_graph";
    case "open_project":
    case "listed_streams":
    case "active_stream_tab":
    case "input":
      return null;
  }
}

/** The capability an ask needs beyond what every view gets, or `null` when every view may ask it. */
export function capabilityToAsk(ask: StudioViewAsk): StudioViewCapability | null {
  switch (ask.kind) {
    case "select":
    case "open_stream_tab":
      return "write.selection";
    case "send_output":
      return null;
  }
}

type JsonObjectFromTheView = { readonly [key: string]: unknown };

function isAnObject(value: unknown): value is JsonObjectFromTheView {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function studioSelectionFromTheView(value: unknown): StudioSelection | null {
  if (!isAnObject(value)) return null;
  switch (value["kind"]) {
    case "nothing":
      return { kind: "nothing" };
    case "project": {
      const projectName = value["project_name"];
      const projectFolder = value["project_folder"];
      if (typeof projectName !== "string" || (projectFolder !== null && typeof projectFolder !== "string")) return null;
      return { kind: "project", project_name: projectName, project_folder: projectFolder };
    }
    case "stream": {
      const { stream, project_folder: projectFolder } = value;
      if (typeof stream !== "string" || typeof projectFolder !== "string") return null;
      return { kind: "stream", stream, project_folder: projectFolder };
    }
    case "node": {
      const { stream, node } = value;
      if (typeof stream !== "string" || typeof node !== "string") return null;
      return { kind: "node", stream, node };
    }
    default:
      return null;
  }
}

function streamTabAddressFromTheView(value: unknown): StreamTabAddress | null {
  if (!isAnObject(value)) return null;
  const { stream, project_name: projectName, display_name: displayName } = value;
  if (typeof stream !== "string" || typeof projectName !== "string" || typeof displayName !== "string") return null;
  return { stream, project_name: projectName, display_name: displayName };
}

function watchedSubjectFromTheView(value: unknown): StudioViewWatchedSubject | null {
  if (!isAnObject(value)) return null;
  const kind = value["kind"];
  if (kind === "open_project" || kind === "listed_streams" || kind === "active_stream_tab" || kind === "selection") return { kind };
  if (kind === "stream_graph" || kind === "node_catalog") {
    const stream = value["stream"];
    return typeof stream === "string" ? { kind, stream } : null;
  }
  if (kind === "input") {
    const input = value["input"];
    return typeof input === "string" ? { kind, input } : null;
  }
  return null;
}

function askFromTheView(value: unknown): StudioViewAsk | null {
  if (!isAnObject(value)) return null;
  switch (value["kind"]) {
    case "select": {
      const selection = studioSelectionFromTheView(value["selection"]);
      return selection === null ? null : { kind: "select", selection };
    }
    case "open_stream_tab": {
      const streamTab = streamTabAddressFromTheView(value["stream_tab"]);
      return streamTab === null ? null : { kind: "open_stream_tab", stream_tab: streamTab };
    }
    case "send_output": {
      const output = value["output"];
      return typeof output === "string" ? { kind: "send_output", output } : null;
    }
    default:
      return null;
  }
}

/** `data`, posted by a view, as one message of the contract, or `null` when it is out of the contract's shape. */
export function messageFromTheStudioView(data: unknown): MessageFromTheStudioView | null {
  if (!isAnObject(data)) return null;
  switch (data["kind"]) {
    case "watch": {
      const watchId = data["watch_id"];
      const subject = watchedSubjectFromTheView(data["subject"]);
      return isAWholeNumber(watchId) && subject !== null ? { kind: "watch", watch_id: watchId, subject } : null;
    }
    case "stop_watching": {
      const watchId = data["watch_id"];
      return isAWholeNumber(watchId) ? { kind: "stop_watching", watch_id: watchId } : null;
    }
    case "ask": {
      const askId = data["ask_id"];
      const ask = askFromTheView(data["ask"]);
      return isAWholeNumber(askId) && ask !== null ? { kind: "ask", ask_id: askId, ask } : null;
    }
    default:
      return null;
  }
}

/** Whether `data`, posted by the studio, is one of its messages by its kind and ids; the view trusts the studio for the rest. */
export function isMessageFromTheStudioHost(data: unknown): data is MessageFromTheStudioHost {
  if (!isAnObject(data)) return false;
  switch (data["kind"]) {
    case "hello":
      return isAnObject(data["grant"]);
    case "watched":
      return isAWholeNumber(data["watch_id"]) && isAnObject(data["watched"]);
    case "watch_refused":
      return isAWholeNumber(data["watch_id"]) && typeof data["because"] === "string";
    case "answered":
      return isAWholeNumber(data["ask_id"]) && isAnObject(data["answer"]);
    default:
      return false;
  }
}

/** What a view sends on an output, beside the ask in the same message: an `ImageBitmap` for Image, which the studio then owns, or JSON. */
export type StudioViewOutputPayload = JsonValue | ImageBitmap;
