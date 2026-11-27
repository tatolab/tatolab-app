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
import { everyOneRead, jsonObject, type JsonObjectOnTheWire, requiredArray, requiredObject, requiredText } from "./json_on_the_wire.js";
import { succeeded, type Result } from "./result.js";

// Each set as a record of its values, so a value the contract adds and this app's type names fails to compile until it is here.
const STREAM_LOADS: Readonly<Record<StreamLoad, true>> = { loading: true, loaded: true, unloading: true, not_loaded: true };
const STREAM_PLAYBACKS: Readonly<Record<StreamPlayback, true>> = { starting: true, playing: true, paused: true, stopping: true, stopped: true };
const STREAM_HEALTHS: Readonly<Record<StreamHealth, true>> = { healthy: true, degraded: true, failed: true };
const STREAM_DIAGNOSTIC_KINDS: Readonly<Record<StreamDiagnosticKind, true>> = {
  project_venv_not_made: true,
  load_refused: true,
  start_refused: true,
  node_type_not_described: true,
  link_refused: true,
  keeps_crashing_the_runtime: true,
  recorded_by_an_earlier_runtime: true,
  node_failed: true,
  node_raising: true,
  node_not_ready: true,
  edit_not_live: true,
  link_not_wired: true,
  link_pin_types_differ: true,
  computed_value_not_yet_built: true,
  computed_value_build_failed: true,
  computed_value_build_panicked: true,
  computed_value_comparison_panicked: true,
  other: true,
};
const STREAM_DIAGNOSTIC_RECOVERIES: Readonly<Record<StreamDiagnosticRecovery, true>> = {
  fix_the_code: true,
  fix_the_dependencies: true,
  fix_the_link: true,
  restart_the_playback: true,
  remove_the_stream: true,
  wait_for_the_node: true,
  change_an_input_the_build_read: true,
  retry_the_load: true,
};

/** Whether `spelled` is one of `values`. */
function isOneOf<Value extends string>(values: Readonly<Record<Value, true>>, spelled: string): spelled is Value {
  return Object.hasOwn(values, spelled);
}

/** The text at `key` read into `values`, a value newer than this app read as `fallback`. */
function setValueOnTheWire<Value extends string>(onTheWire: JsonObjectOnTheWire, key: string, values: Readonly<Record<Value, true>>, fallback: Value): Result<Value, string> {
  const spelled = requiredText(onTheWire, key);
  if (!spelled.ok) return spelled;
  return succeeded(isOneOf(values, spelled.value) ? spelled.value : fallback);
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

/** One diagnostic as the condition lists it: its kind, place, words and recovery. */
function streamDiagnosticOnTheWire(diagnosticOnTheWire: unknown): Result<StreamDiagnostic, string> {
  const diagnostic = jsonObject(diagnosticOnTheWire, "a diagnostic");
  if (!diagnostic.ok) return diagnostic;
  const kind = setValueOnTheWire(diagnostic.value, "kind", STREAM_DIAGNOSTIC_KINDS, "other");
  if (!kind.ok) return kind;
  const placeOnTheWire = requiredObject(diagnostic.value, "place");
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
  switch (on.value) {
    case "node": {
      const nodeId = requiredText(place, "node_id");
      if (!nodeId.ok) return nodeId;
      const nodeName = requiredText(place, "node_name");
      if (!nodeName.ok) return nodeName;
      return succeeded({ on: "node", node_id: nodeId.value, node_name: nodeName.value });
    }
    case "link": {
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
    default:
      return succeeded({ on: "stream" });
  }
}
