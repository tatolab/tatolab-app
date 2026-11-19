// A stream's `condition` as `list_streams` answers it: its load, playback and health, each read
// into this app's set with a value newer than it read as that set's fallback, and each diagnostic
// with its kind, place, words and recovery.

import type {
  StreamCondition,
  StreamDiagnostic,
  StreamDiagnosticKind,
  StreamDiagnosticPlace,
  StreamDiagnosticRecovery,
  StreamHealth,
  StreamLoad,
  StreamPlayback,
} from "../shared/tatolab_backend_contract.js";
import { everyOneRead, jsonObject, type JsonObjectOnTheWire, requiredArray, requiredText } from "./json_on_the_wire.js";
import { succeeded, type Result } from "./result.js";

const STREAM_LOADS: readonly StreamLoad[] = ["loading", "loaded", "unloading", "not_loaded"];
const STREAM_PLAYBACKS: readonly StreamPlayback[] = ["starting", "playing", "paused", "stopping", "stopped"];
const STREAM_HEALTHS: readonly StreamHealth[] = ["healthy", "degraded", "failed"];
const STREAM_DIAGNOSTIC_KINDS: readonly StreamDiagnosticKind[] = [
  "project_venv_not_made",
  "load_refused",
  "start_refused",
  "node_type_not_described",
  "link_refused",
  "keeps_crashing_the_runtime",
  "recorded_by_an_earlier_runtime",
  "node_failed",
  "node_raising",
  "node_not_ready",
  "edit_not_live",
  "other",
];
const STREAM_DIAGNOSTIC_RECOVERIES: readonly StreamDiagnosticRecovery[] = [
  "fix_the_code",
  "fix_the_dependencies",
  "fix_the_link",
  "restart_the_playback",
  "remove_the_stream",
  "wait_for_the_node",
  "retry_the_load",
];

/** The value of `values` spelled `spelled`, or `fallback` for one newer than this app. */
function oneOfOrFallback<Value extends string>(values: readonly Value[], spelled: string, fallback: Value): Value {
  return values.find((value) => value === spelled) ?? fallback;
}

/** The text at `key` read into `values`, a value newer than this app read as `fallback`. */
function setValueOnTheWire<Value extends string>(onTheWire: JsonObjectOnTheWire, key: string, values: readonly Value[], fallback: Value): Result<Value, string> {
  const spelled = requiredText(onTheWire, key);
  return spelled.ok ? succeeded(oneOfOrFallback(values, spelled.value, fallback)) : spelled;
}

/** A stream's condition as `list_streams` renders it under `condition`. */
export function streamConditionOnTheWire(conditionOnTheWire: JsonObjectOnTheWire): Result<StreamCondition, string> {
  const load = setValueOnTheWire(conditionOnTheWire, "load", STREAM_LOADS, "not_loaded");
  if (!load.ok) return load;
  const playback = setValueOnTheWire(conditionOnTheWire, "playback", STREAM_PLAYBACKS, "stopped");
  if (!playback.ok) return playback;
  const health = setValueOnTheWire(conditionOnTheWire, "health", STREAM_HEALTHS, "failed");
  if (!health.ok) return health;
  const diagnosticsOnTheWire = requiredArray(conditionOnTheWire, "diagnostics");
  if (!diagnosticsOnTheWire.ok) return diagnosticsOnTheWire;
  const diagnostics = everyOneRead(diagnosticsOnTheWire.value, streamDiagnosticOnTheWire);
  if (!diagnostics.ok) return diagnostics;
  return succeeded({ load: load.value, playback: playback.value, health: health.value, diagnostics: diagnostics.value });
}

function streamDiagnosticOnTheWire(diagnosticOnTheWire: unknown): Result<StreamDiagnostic, string> {
  const diagnostic = jsonObject(diagnosticOnTheWire, "a diagnostic");
  if (!diagnostic.ok) return diagnostic;
  const kind = setValueOnTheWire(diagnostic.value, "kind", STREAM_DIAGNOSTIC_KINDS, "other");
  if (!kind.ok) return kind;
  const placeOnTheWire = jsonObject(diagnostic.value["place"], "a diagnostic's `place`");
  if (!placeOnTheWire.ok) return placeOnTheWire;
  const place = streamDiagnosticPlaceOnTheWire(placeOnTheWire.value);
  if (!place.ok) return place;
  const words = requiredText(diagnostic.value, "words");
  if (!words.ok) return words;
  const recovery = setValueOnTheWire(diagnostic.value, "recovery", STREAM_DIAGNOSTIC_RECOVERIES, "retry_the_load");
  if (!recovery.ok) return recovery;
  return succeeded({ kind: kind.value, place: place.value, words: words.value, recovery: recovery.value });
}

/** Where a diagnostic applies; a place newer than this app reads as the stream as a whole. */
function streamDiagnosticPlaceOnTheWire(place: JsonObjectOnTheWire): Result<StreamDiagnosticPlace, string> {
  const on = requiredText(place, "on");
  if (!on.ok) return on;
  if (on.value === "node") {
    const nodeId = requiredText(place, "node_id");
    if (!nodeId.ok) return nodeId;
    const nodeName = requiredText(place, "node_name");
    if (!nodeName.ok) return nodeName;
    return succeeded({ on: "node", node_id: nodeId.value, node_name: nodeName.value });
  }
  if (on.value === "link") {
    const fromNode = requiredText(place, "from_node");
    if (!fromNode.ok) return fromNode;
    const fromPort = requiredText(place, "from_port");
    if (!fromPort.ok) return fromPort;
    const toNode = requiredText(place, "to_node");
    if (!toNode.ok) return toNode;
    const toPort = requiredText(place, "to_port");
    if (!toPort.ok) return toPort;
    return succeeded({ on: "link", from_node: fromNode.value, from_port: fromPort.value, to_node: toNode.value, to_port: toPort.value });
  }
  return succeeded({ on: "stream" });
}
