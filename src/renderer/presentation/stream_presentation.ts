import type { ListedStream, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";

/** How strongly a stream's state word reads: plain, with a spinner while an action works on it, dimmed while stopped, or red with an alert icon when failed. */
export type StreamStateEmphasis = "plain" | "starting" | "quiet" | "failure";

/** The colour a stream's icon takes: running, failed, or neither (stopped, preparing, stopping, or a state newer than this app). */
export type StreamStateIconTone = "running" | "failed" | "idle";

/** How a stream's row and title show its state: a word, its emphasis, its icon's tone, and what the word means. */
export interface StreamStatePresentation {
  label: string;
  emphasis: StreamStateEmphasis;
  iconTone: StreamStateIconTone;
  /** The tooltip on the word; a failed stream's is the runtime's whole reason. */
  meaning: string;
}

/** Why a listed stream has no live graph or logs. */
export type StreamNotLoadedReason = "stopped" | "failed" | "loading" | "not_loaded";

/** A stream is loaded while the runtime counts its graph's nodes. */
export function isStreamLoaded(stream: ListedStream): boolean {
  return stream.node_count !== null;
}

/** The project folder the runtime lists `stream` from; `null` for an earlier runtime's record, which has no location. */
export function listedStreamProjectDirectory(stream: ListedStream): string | null {
  return stream.location?.project_directory ?? null;
}

/** A step of the action under way on a `preparing` or `stopping` stream, in plain words; `null` while the action waits in its project's queue. */
export function streamActionStepWords(step: string | null): string {
  switch (step) {
    case null:
      return "queued";
    case "making_the_venv":
      return "making the environment";
    case "compiling":
      return "compiling";
    case "starting":
      return "starting";
    case "stopping":
      return "stopping";
    default:
      return labelUnknownStreamState(step).toLowerCase();
  }
}

/** `awaiting_restart` reads `Awaiting restart`. */
export function labelUnknownStreamState(wireState: string): string {
  const spaced = wireState.replace(/[_-]+/g, " ").trim();
  return spaced === "" ? "Unknown" : spaced[0].toUpperCase() + spaced.slice(1);
}

/** The word, emphasis and meaning of a stream's state, including a state newer than this app. */
export function presentStreamState(stream: ListedStream): StreamStatePresentation {
  switch (stream.state) {
    case "running":
      return { label: "Running", emphasis: "plain", iconTone: "running", meaning: "Running: its graph is loaded in the runtime." };
    case "preparing": {
      const stepWords = streamActionStepWords(stream.step);
      return {
        label: `Preparing · ${stepWords}`,
        emphasis: "starting",
        iconTone: "idle",
        meaning: stream.step === null ? "Preparing: queued behind its project's earlier actions." : `Preparing: ${stepWords}. It runs once it has loaded.`,
      };
    }
    case "stopping":
      return stream.step === null
        ? { label: "Stopping · queued", emphasis: "starting", iconTone: "idle", meaning: "Stopping: queued behind its project's earlier actions." }
        : { label: "Stopping", emphasis: "starting", iconTone: "idle", meaning: "Stopping: the runtime is unloading it." };
    case "stopped":
      return { label: "Stopped", emphasis: "quiet", iconTone: "idle", meaning: "Stopped: remembered, not loaded. Start loads it again." };
    case "failed":
      return { label: "Failed", emphasis: "failure", iconTone: "failed", meaning: stream.failed_because ?? "Failed at its last start." };
    default: {
      const label = labelUnknownStreamState(stream.state);
      return { label, emphasis: "plain", iconTone: "idle", meaning: `${label}: this version of Tatolab doesn't know this state yet.` };
    }
  }
}

/** What a row and a stream page show in place of Stop or Start while the listing shows an action working on the stream, as `Preparing · compiling`; `null` while none does. */
export function streamActionInTheListingWords(stream: ListedStream): string | null {
  return stream.state === "preparing" || stream.state === "stopping" ? presentStreamState(stream).label : null;
}

/** The one action a stream's row leads with: what it asks of the runtime, its word, and what it does. */
export interface StreamPrimaryActionPresentation {
  streamAction: Extract<TatolabStreamActionName, "stop_stream" | "start_stream">;
  label: "Stop" | "Start" | "Retry";
  meaning: string;
}

/** Stop for a running stream, Start for a stopped one, Retry for a failed one; `null` while an action works on it, and for a state newer than this app. */
export function presentStreamPrimaryAction(stream: ListedStream): StreamPrimaryActionPresentation | null {
  switch (stream.state) {
    case "running":
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
  if (stream.state === "running" || stream.state === "preparing") return "loading";
  return "not_loaded";
}

/** An action the window asks of the runtime on a stream: a stop, a start, or the removal of its whole project. */
export type StreamActionAskedByTheWindow = TatolabStreamActionName | "remove_project";

/** What a row says while its stream action is being asked for, until the listing shows it under way. */
export function streamActionPendingWords(streamAction: StreamActionAskedByTheWindow): string {
  switch (streamAction) {
    case "stop_stream":
      return "Stopping…";
    case "start_stream":
      return "Starting…";
    case "remove_project":
      return "Removing…";
  }
}

/** The lead before a refusal in the runtime's words: `Retry was refused:` for the action the person chose. */
export function streamActionRefusalLead(chosenActionLabel: StreamPrimaryActionPresentation["label"] | "Remove project"): string {
  return `${chosenActionLabel} was refused:`;
}

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
