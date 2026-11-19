// What a view says of a stream's condition as the runtime lists it: its load, playback and health in
// words, and each diagnostic where it applies, in the runtime's words, with what recovers from it.

import type { ProjectStreamsRecovery, StreamCondition, StreamDiagnostic, StreamDiagnosticKind, StreamDiagnosticPlace, StreamDiagnosticRecovery, StreamHealth, StreamLoad, StreamPlayback } from "@tatolab/tato-app-view-sdk/studio_readings";

/** What recovers from a diagnostic: an ask Studio runs on the project, the link it names disconnected, or nothing Studio can do. */
export type StreamDiagnosticAction =
  | { kind: "ask_studio"; recovery: ProjectStreamsRecovery; label: string }
  | { kind: "disconnect_the_link"; label: string }
  | { kind: "none" };

/** One diagnostic as a view lists it. */
export interface StreamDiagnosticLine {
  tone: "failure" | "warning";
  /** Where it applies, as the view leads its words with it. */
  lead: string;
  /** The runtime's words, then what the person does about it. */
  words: string;
  action: StreamDiagnosticAction;
  diagnostic: StreamDiagnostic;
}

const LOAD_WORDS: Record<StreamLoad, string> = { loading: "loading", loaded: "loaded", unloading: "unloading", not_loaded: "not loaded" };
const PLAYBACK_WORDS: Record<StreamPlayback, string> = { starting: "starting", playing: "playing", paused: "paused", stopping: "stopping", stopped: "stopped" };
const HEALTH_WORDS: Record<StreamHealth, string> = { healthy: "healthy", degraded: "degraded", failed: "failed" };

/** The diagnostics that leave a stream running as it was: the rest keep it, or a part of it, from running. */
const DIAGNOSTICS_THAT_WARN: ReadonlySet<StreamDiagnosticKind> = new Set(["node_not_ready", "edit_not_live", "recorded_by_an_earlier_runtime"]);

const RESTART_THE_PLAYBACK: StreamDiagnosticAction = { kind: "ask_studio", recovery: "restart_the_playback", label: "Restart playback" };
const RELOAD_THE_PROJECT: StreamDiagnosticAction = { kind: "ask_studio", recovery: "reload_the_project", label: "Reload project" };

/** What the person does about a diagnostic whose recovery is `recovery`, in words, and the action that does it. */
const RECOVERY_WORDS_AND_ACTION: Record<StreamDiagnosticRecovery, { words: string; action: StreamDiagnosticAction }> = {
  fix_the_code: { words: "Fix the code, then reload the project.", action: RELOAD_THE_PROJECT },
  fix_the_dependencies: { words: "Fix the project's Python packages, then reload the project.", action: RELOAD_THE_PROJECT },
  fix_the_link: { words: "Disconnect the link, or wire it to ports that take each other.", action: { kind: "disconnect_the_link", label: "Disconnect link" } },
  restart_the_playback: { words: "Restart the playback to make it live.", action: RESTART_THE_PLAYBACK },
  remove_the_stream: { words: "Remove the stream from the project, or fix what it names.", action: { kind: "none" } },
  wait_for_the_node: { words: "It clears once the node is ready.", action: { kind: "none" } },
  retry_the_load: { words: "Reload the project to try again.", action: RELOAD_THE_PROJECT },
};

/** The condition in one line: its load, playback and health. */
export function streamConditionSummary(condition: StreamCondition): string {
  return `${LOAD_WORDS[condition.load]}, ${PLAYBACK_WORDS[condition.playback]}, ${HEALTH_WORDS[condition.health]}`;
}

/** Where `place` is, in words, the stream as a whole named `streamWords`. */
export function diagnosticPlaceWords(place: StreamDiagnosticPlace, streamWords: string): string {
  switch (place.on) {
    case "stream":
      return streamWords;
    case "node":
      return place.node_name;
    case "link":
      return `${place.from_node}.${place.from_port} → ${place.to_node}.${place.to_port}`;
  }
}

/** Each diagnostic of `condition` as a view lists it, the stream named `streamWords`; none while the runtime lists no condition. */
export function streamDiagnosticLines(condition: StreamCondition | null, streamWords: string): StreamDiagnosticLine[] {
  return (condition?.diagnostics ?? []).map((diagnostic) => {
    const { words, action } = RECOVERY_WORDS_AND_ACTION[diagnostic.recovery];
    return {
      tone: DIAGNOSTICS_THAT_WARN.has(diagnostic.kind) ? "warning" : "failure",
      lead: `${diagnosticPlaceWords(diagnostic.place, streamWords)}:`,
      words: `${diagnostic.words} ${words}`,
      action,
      diagnostic,
    };
  });
}

/** The diagnostics of `condition` at the node named `nodeName`. */
export function diagnosticsAtTheNode(condition: StreamCondition | null, nodeName: string): StreamDiagnostic[] {
  return (condition?.diagnostics ?? []).filter((diagnostic) => diagnostic.place.on === "node" && diagnostic.place.node_name === nodeName);
}

/** The diagnostics of `condition` at the link from `source_node`'s `source_port` to `target_node`'s `target_port`. */
export function diagnosticsAtTheLink(condition: StreamCondition | null, link: { source_node: string; source_port: string; target_node: string; target_port: string }): StreamDiagnostic[] {
  return (condition?.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.place.on === "link" &&
      diagnostic.place.from_node === link.source_node &&
      diagnostic.place.from_port === link.source_port &&
      diagnostic.place.to_node === link.target_node &&
      diagnostic.place.to_port === link.target_port,
  );
}

/** Whether a diagnostic of `kind` warns, leaving what it is at running as it was. */
export function doesTheDiagnosticWarn(kind: StreamDiagnosticKind): boolean {
  return DIAGNOSTICS_THAT_WARN.has(kind);
}
