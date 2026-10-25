// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";

/** How strongly a stream's state word reads: plain, with a spinner while it loads, dimmed while stopped, or red with an alert icon when failed. */
export type StreamStateEmphasis = "plain" | "starting" | "quiet" | "failure";

/** How a stream's row and title show its state: a word, its emphasis, and what the word means. */
export interface StreamStatePresentation {
  label: string;
  emphasis: StreamStateEmphasis;
  /** The tooltip on the word; a failed stream's is the runtime's whole reason. */
  meaning: string;
}

/** Why a listed stream has no live graph or logs. */
export type StreamNotLoadedReason = "stopped" | "failed" | "loading" | "not_loaded";

/** A stream is loaded while the runtime counts its graph's nodes. */
export function isStreamLoaded(stream: ListedStream): boolean {
  return stream.node_count !== null;
}

/** `awaiting_restart` reads `Awaiting restart`. */
export function labelUnknownStreamState(wireState: string): string {
  const spaced = wireState.replace(/[_-]+/g, " ").trim();
  return spaced === "" ? "Unknown" : spaced[0].toUpperCase() + spaced.slice(1);
}

/** The word, emphasis and meaning of a stream's state, including a state newer than this app. */
export function presentStreamState(stream: ListedStream): StreamStatePresentation {
  switch (stream.state) {
    case "attached":
    case "kept":
      return isStreamLoaded(stream)
        ? { label: "Running", emphasis: "plain", meaning: "Running: its graph is loaded in the runtime." }
        : { label: "Starting", emphasis: "starting", meaning: "Starting: the runtime is loading its graph." };
    case "stopped":
      return { label: "Stopped", emphasis: "quiet", meaning: "Stopped: remembered, not loaded. Start loads it again." };
    case "failed":
      return { label: "Failed", emphasis: "failure", meaning: stream.failed_because ?? "Failed at its last start." };
    default: {
      const label = labelUnknownStreamState(stream.state);
      return { label, emphasis: "plain", meaning: `${label}: this version of Tatolab doesn't know this state yet.` };
    }
  }
}

/**
 * A row's state word once the runtime has answered a stop it could not record: it unloaded the stream, which
 * `list_streams` still lists as kept with no graph, so the row reads Stopped rather than Starting.
 */
export function presentStreamStateAfterAStopNotRecorded(stream: ListedStream): StreamStatePresentation {
  if (stream.state !== "kept" || isStreamLoaded(stream)) return presentStreamState(stream);
  return { label: "Stopped", emphasis: "quiet", meaning: "Stopped: unloaded, but not recorded stopped, so the runtime loads it again when it restarts." };
}

/** Each run mode in the person's words. */
export const STREAM_RUN_MODE_LABELS = { always_on: "Always on", dev_session: "Dev session" } as const;

/** How a stream runs, in the person's words, with the runtime's own term beside them. */
export interface StreamRunModePresentation {
  runMode: keyof typeof STREAM_RUN_MODE_LABELS;
  label: (typeof STREAM_RUN_MODE_LABELS)[keyof typeof STREAM_RUN_MODE_LABELS];
  /** The `list_streams` state the words stand for. */
  runtimeTerm: string;
  meaning: string;
}

/** Always on for a kept stream (stopped and failed included), Dev session for an attached one; `null` for a state newer than this app. */
export function presentStreamRunMode(stream: ListedStream): StreamRunModePresentation | null {
  switch (stream.state) {
    case "kept":
    case "stopped":
    case "failed":
      return {
        runMode: "always_on",
        label: STREAM_RUN_MODE_LABELS.always_on,
        runtimeTerm: stream.state,
        meaning: "Loaded every time the runtime starts, until it is stopped. Keeps running when the app and the terminal close.",
      };
    case "attached":
      return {
        runMode: "dev_session",
        label: STREAM_RUN_MODE_LABELS.dev_session,
        runtimeTerm: stream.state,
        meaning: "Run by tatolab dev or tatolab run in a terminal, and ends with that session.",
      };
    default:
      return null;
  }
}

/** The steps of a stream's loaded graph, or a dash while it is not loaded. */
export function streamStepCountLabel(stream: ListedStream): string {
  return stream.node_count === null ? "—" : String(stream.node_count);
}

/** The one action a stream's row leads with: what it asks of the runtime, its word, and what it does. */
export interface StreamPrimaryActionPresentation {
  streamAction: Extract<TatolabStreamActionName, "stop_stream" | "start_stream">;
  label: "Stop" | "Start" | "Retry";
  meaning: string;
}

/** Stop for a loaded or loading stream, Start for a stopped one, Retry for a failed one; `null` for a state newer than this app. */
export function presentStreamPrimaryAction(stream: ListedStream): StreamPrimaryActionPresentation | null {
  switch (stream.state) {
    case "attached":
      return { streamAction: "stop_stream", label: "Stop", meaning: "Stop: ends the tatolab dev session that runs it" };
    case "kept":
      return { streamAction: "stop_stream", label: "Stop", meaning: "Stop: unloads it and remembers it stopped" };
    case "stopped":
      return { streamAction: "start_stream", label: "Start", meaning: "Start: loads it again from its record" };
    case "failed":
      return { streamAction: "start_stream", label: "Retry", meaning: "Retry: loads it again from its record" };
    default:
      return null;
  }
}

/** Why `stream` has no live graph or logs; `null` while it is loaded. */
export function streamNotLoadedReason(stream: ListedStream): StreamNotLoadedReason | null {
  if (stream.state === "stopped") return "stopped";
  if (stream.state === "failed") return "failed";
  if (isStreamLoaded(stream)) return null;
  if (stream.state === "kept" || stream.state === "attached") return "loading";
  return "not_loaded";
}

/** What a row says while its stream action is under way. */
export function streamActionPendingWords(streamAction: TatolabStreamActionName): string {
  switch (streamAction) {
    case "stop_stream":
      return "Stopping…";
    case "start_stream":
      return "Starting…";
    case "remove_stream":
      return "Removing…";
  }
}

/** The lead before a refusal in the runtime's words: `Retry was refused:` for the action the person chose. */
export function streamActionRefusalLead(chosenActionLabel: StreamPrimaryActionPresentation["label"] | "Remove"): string {
  return `${chosenActionLabel} was refused:`;
}

/** The lead before the runtime's reason when it stopped a kept stream but could not record it stopped. */
export const STOP_NOT_RECORDED_LEAD = "Stopped, but not recorded, so it loads again when the runtime restarts:";

/** `1 stream`, `2,000 lines`. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** A home directory where macOS (`/Users/<name>`) and Linux (`/home/<name>`) put one. */
const HOME_DIRECTORY_PREFIX = /^\/(?:Users|home)\/[^/]+(?=\/|$)/;

/** Shortens `/Users/<name>/…` or `/home/<name>/…` to `~/…` for display. */
export function abbreviateHomeDirectory(absolutePath: string): string {
  return absolutePath.replace(HOME_DIRECTORY_PREFIX, "~");
}
