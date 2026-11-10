import type { JsonValue, ViewSettings } from "@tatolab/tato-app-view-sdk";

/** Where the person left a stream's graph: the canvas's pan and zoom, `null` before the canvas has been framed, and the node they had selected. */
export interface WhereAStreamWasLeft {
  viewport: { x: number; y: number; zoom: number } | null;
  selected_node: string | null;
}

/** The Stream graph area's setting that keeps where each stream was left, by stream id. */
const WHERE_EACH_STREAM_WAS_LEFT = "where_each_stream_was_left";

const isAJsonObject = (value: JsonValue | undefined): value is { [key: string]: JsonValue } => typeof value === "object" && value !== null && !Array.isArray(value);

function viewportKept(value: JsonValue | undefined): WhereAStreamWasLeft["viewport"] | undefined {
  if (value === undefined || value === null) return null;
  if (!isAJsonObject(value)) return undefined;
  const { x, y, zoom } = value;
  return typeof x === "number" && typeof y === "number" && typeof zoom === "number" && zoom > 0 ? { x, y, zoom } : undefined;
}

/** Where `stream` was left, as the area's settings keep it; `null` for a stream it holds no readable record of. */
export function whereTheStreamWasLeft(settings: ViewSettings, stream: string): WhereAStreamWasLeft | null {
  const everyStream = settings?.[WHERE_EACH_STREAM_WAS_LEFT];
  const left = isAJsonObject(everyStream) ? everyStream[stream] : undefined;
  if (!isAJsonObject(left)) return null;
  const viewport = viewportKept(left["viewport"]);
  const selectedNode = left["selected_node"] ?? null;
  if (viewport === undefined || (selectedNode !== null && typeof selectedNode !== "string")) return null;
  return { viewport, selected_node: selectedNode };
}

/** Whether two records of where a stream was left say the same. */
export function isTheSamePlaceLeft(one: WhereAStreamWasLeft, other: WhereAStreamWasLeft): boolean {
  const sameViewport = one.viewport === null || other.viewport === null ? one.viewport === other.viewport : one.viewport.x === other.viewport.x && one.viewport.y === other.viewport.y && one.viewport.zoom === other.viewport.zoom;
  return sameViewport && one.selected_node === other.selected_node;
}

/** How many streams' records the area keeps; the streams left longest ago go first. */
export const STREAMS_WHOSE_PLACE_LEFT_IS_KEPT = 50;

/** `settings` with `stream` left at `left`, as the newest record, keeping the other streams' records up to the limit. */
export function settingsWithTheStreamLeft(settings: ViewSettings, stream: string, left: WhereAStreamWasLeft): { [settingName: string]: JsonValue } {
  const everyStream = settings?.[WHERE_EACH_STREAM_WAS_LEFT];
  const otherStreamsKept = Object.entries(isAJsonObject(everyStream) ? everyStream : {})
    .filter(([keptStream]) => keptStream !== stream)
    .slice(-(STREAMS_WHOSE_PLACE_LEFT_IS_KEPT - 1));
  return { ...settings, [WHERE_EACH_STREAM_WAS_LEFT]: { ...Object.fromEntries(otherStreamsKept), [stream]: { viewport: left.viewport === null ? null : { ...left.viewport }, selected_node: left.selected_node } } };
}
