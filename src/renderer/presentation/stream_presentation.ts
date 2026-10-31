import type { ListedStream, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";

/** How strongly a stream's state word reads: plain, with a spinner while an action works on it, dimmed while stopped, amber with a warning icon while it waits for access, or red with an alert icon when failed. */
export type StreamStateEmphasis = "plain" | "starting" | "quiet" | "warning" | "failure";

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

/** The capture devices a running stream waits for access to, which nobody has asked the person for, in plain words such as `camera` or `camera and microphone`; `null` while it waits for none. */
export function captureDevicesAwaitingAccessWords(stream: ListedStream): string | null {
  if (stream.state !== "running" || stream.capture_devices_whose_access_was_never_asked_for.length === 0) return null;
  return stream.capture_devices_whose_access_was_never_asked_for.map((captureDevice) => labelUnknownStreamState(captureDevice).toLowerCase()).join(" and ");
}

/** What a stream waiting for capture-device access says it waits for, and why macOS has not asked yet. */
export interface CaptureDeviceAccessAwaitedPresentation {
  title: string;
  explanation: string;
}

/** `Waiting for camera access` and why, for a running stream waiting for access nobody has asked for; `null` while it waits for none. */
export function presentCaptureDeviceAccessAwaited(stream: ListedStream): CaptureDeviceAccessAwaitedPresentation | null {
  const captureDevicesWords = captureDevicesAwaitingAccessWords(stream);
  if (captureDevicesWords === null) return null;
  return {
    title: `Waiting for ${captureDevicesWords} access`,
    explanation: "The runtime brought this stream back on its own when it started, so macOS has not asked you yet. Allow restarts it, and macOS asks.",
  };
}

/** `awaiting_restart` reads `Awaiting restart`. */
export function labelUnknownStreamState(wireState: string): string {
  const spaced = wireState.replace(/[_-]+/g, " ").trim();
  return spaced === "" ? "Unknown" : spaced[0].toUpperCase() + spaced.slice(1);
}

/** The word, emphasis and meaning of a stream's state, including a state newer than this app. */
export function presentStreamState(stream: ListedStream): StreamStatePresentation {
  switch (stream.state) {
    case "running": {
      const captureDeviceAccessAwaited = presentCaptureDeviceAccessAwaited(stream);
      if (captureDeviceAccessAwaited !== null) {
        return {
          label: captureDeviceAccessAwaited.title,
          emphasis: "warning",
          iconTone: "idle",
          meaning: `${captureDeviceAccessAwaited.title}: ${captureDeviceAccessAwaited.explanation}`,
        };
      }
      return { label: "Running", emphasis: "plain", iconTone: "running", meaning: "Running: its graph is loaded in the runtime." };
    }
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

/** What a stream's leading action asks of the runtime: one stream action, or a stop then a start, so macOS asks for the capture devices the stream waits on. */
export type StreamPrimaryActionName = TatolabStreamActionName | "restart_to_be_asked_for_capture_device_access";

/** The one action a stream's row leads with: what it asks of the runtime, its word, and what it does. */
export interface StreamPrimaryActionPresentation {
  streamAction: StreamPrimaryActionName;
  label: "Stop" | "Start" | "Retry" | "Allow";
  meaning: string;
}

/** Stop: unloads a running stream and remembers it stopped. */
export const STOP_STREAM_ACTION: StreamPrimaryActionPresentation = { streamAction: "stop_stream", label: "Stop", meaning: "Stop: unloads it and remembers it stopped" };

/** Stop for a stream whose leading action is Allow, which a person may stop rather than allow; `null` for every other stream. */
export function presentStopBesideAllow(stream: ListedStream): StreamPrimaryActionPresentation | null {
  return presentStreamPrimaryAction(stream)?.streamAction === "restart_to_be_asked_for_capture_device_access" ? STOP_STREAM_ACTION : null;
}

/** Allow for a running stream waiting for access nobody has asked for, Stop for any other running stream, Start for a stopped one, Retry for a failed one; `null` while an action works on it, and for a state newer than this app. */
export function presentStreamPrimaryAction(stream: ListedStream): StreamPrimaryActionPresentation | null {
  switch (stream.state) {
    case "running": {
      const captureDevicesWords = captureDevicesAwaitingAccessWords(stream);
      if (captureDevicesWords !== null) {
        return { streamAction: "restart_to_be_asked_for_capture_device_access", label: "Allow", meaning: `Allow: restarts it, and macOS asks for the ${captureDevicesWords}` };
      }
      return STOP_STREAM_ACTION;
    }
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

/** An action the window asks of the runtime on a stream: a stop, a start, a restart so macOS asks for access, the removal of its whole project, or the cancel of the action the listing names on it. */
export type StreamActionAskedByTheWindow = StreamPrimaryActionName | "remove_project" | "cancel_stream_action";

/** What a row says while its stream action is being asked for, until the listing shows it under way. */
export function streamActionPendingWords(streamAction: StreamActionAskedByTheWindow): string {
  switch (streamAction) {
    case "stop_stream":
      return "Stopping…";
    case "start_stream":
      return "Starting…";
    case "restart_to_be_asked_for_capture_device_access":
      return "Restarting…";
    case "remove_project":
      return "Removing…";
    case "cancel_stream_action":
      return "Cancelling…";
  }
}

/** The Cancel a row and a stream page offer while the listing names an action on the stream: the action, and what Cancel does to it. */
export interface StreamActionCancelPresentation {
  action: string;
  meaning: string;
}

/** Cancel for the action the listing names on a `preparing` or `stopping` stream, a running stop among them, which the runtime refuses in its own words; `null` while it names none. */
export function presentStreamActionCancel(stream: ListedStream): StreamActionCancelPresentation | null {
  if (stream.action === null || (stream.state !== "preparing" && stream.state !== "stopping")) return null;
  return { action: stream.action, meaning: streamActionCancelMeaning(stream.state, stream.step) };
}

function streamActionCancelMeaning(state: "preparing" | "stopping", step: string | null): string {
  if (step === null) return "Cancel: drops it from its project's queue";
  return state === "preparing" ? "Cancel: stops it at the step it is on" : "Cancel: a stop that has begun unloading runs to its end";
}

/** The lead before a refusal in the runtime's words: `Retry was refused:` for the action the person chose. */
export function streamActionRefusalLead(chosenActionLabel: StreamPrimaryActionPresentation["label"] | "Remove project" | "Cancel"): string {
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
