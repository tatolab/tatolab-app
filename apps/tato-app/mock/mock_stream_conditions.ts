import type { ListedStream, StreamCondition, StreamDiagnosticKind, StreamDiagnosticRecovery } from "../src/shared/tatolab_backend_contract";
import { MOCK_UV_SYNC_REFUSAL } from "./mock_tatolab_simulation_constants";

/** The recovery the runtime gives a diagnostic of each kind. */
const RECOVERY_OF_EACH_KIND: Record<StreamDiagnosticKind, StreamDiagnosticRecovery> = {
  project_venv_not_made: "fix_the_dependencies",
  load_refused: "fix_the_code",
  node_type_not_described: "fix_the_code",
  node_raising: "fix_the_code",
  computed_value_build_panicked: "fix_the_code",
  computed_value_comparison_panicked: "fix_the_code",
  start_refused: "restart_the_playback",
  node_failed: "restart_the_playback",
  edit_not_live: "restart_the_playback",
  link_not_wired: "restart_the_playback",
  link_refused: "fix_the_link",
  link_pin_types_differ: "fix_the_link",
  keeps_crashing_the_runtime: "retry_the_load",
  other: "retry_the_load",
  recorded_by_an_earlier_runtime: "remove_the_stream",
  node_not_ready: "wait_for_the_node",
  computed_value_not_yet_built: "wait_for_the_node",
  computed_value_build_failed: "change_an_input_the_build_read",
};

/** What kept a failed stream from running, as the runtime names it: no venv, a record of an earlier runtime, its load refused while it is not loaded, its start refused while it is. */
function failureKindOf(listing: ListedStream, isLoaded: boolean): StreamDiagnosticKind {
  if (listing.failed_because?.includes(MOCK_UV_SYNC_REFUSAL) === true) return "project_venv_not_made";
  if (listing.location === null) return "recorded_by_an_earlier_runtime";
  return isLoaded ? "start_refused" : "load_refused";
}

/** `listing`'s condition as the mock runtime lists it, from its state and whether the runtime holds it loaded. */
export function mockConditionOf(listing: ListedStream, isLoaded: boolean): StreamCondition {
  switch (listing.state) {
    case "running":
      return { load: "loaded", playback: "playing", health: "healthy", diagnostics: [] };
    case "preparing":
      return { load: "loading", playback: "starting", health: "healthy", diagnostics: [] };
    case "stopping":
      return { load: "loaded", playback: "stopping", health: "healthy", diagnostics: [] };
    case "failed": {
      const kind = failureKindOf(listing, isLoaded);
      return {
        load: isLoaded ? "loaded" : "not_loaded",
        playback: "stopped",
        health: "failed",
        diagnostics: [{ kind, place: { on: "stream" }, words: listing.failed_because ?? "The runtime gives no reason.", recovery: RECOVERY_OF_EACH_KIND[kind] }],
      };
    }
    default:
      return { load: isLoaded ? "loaded" : "not_loaded", playback: "stopped", health: "healthy", diagnostics: [] };
  }
}
