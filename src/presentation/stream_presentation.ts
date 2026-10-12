import type { ListedStream } from "../backend/tatolab_backend_contract";

/** The chip's colour says how the runtime holds the stream: attached, kept, stopped, failed, or unknown. */
export type StreamStateChipTone = "ok" | "accent" | "neutral" | "error" | "outline";

/** The dot's colour says whether the stream runs: loaded, not loaded yet, stopped, or failed. */
export type StreamStateDotTone = "ok" | "idle" | "error" | "pending";

/** How a stream's row and header show its state. */
export interface StreamStatePresentation {
  label: string;
  chipTone: StreamStateChipTone;
  dotTone: StreamStateDotTone;
}

/** Why a listed stream has no live graph or logs. */
export type StreamNotLoadedReason = "stopped" | "failed" | "loading" | "not_loaded";

/** A stream is loaded while the runtime counts its graph's nodes. */
function isStreamLoaded(stream: ListedStream): boolean {
  return stream.node_count !== null;
}

/** `awaiting_restart` reads `Awaiting restart`. */
function labelUnknownStreamState(wireState: string): string {
  const spaced = wireState.replace(/[_-]+/g, " ").trim();
  return spaced === "" ? "Unknown" : spaced[0].toUpperCase() + spaced.slice(1);
}

/** The label, chip and dot for a stream's state, including a state newer than this app. */
export function presentStreamState(stream: ListedStream): StreamStatePresentation {
  const loadedDotTone: StreamStateDotTone = isStreamLoaded(stream) ? "ok" : "pending";
  switch (stream.state) {
    case "attached":
      return { label: "Attached", chipTone: "ok", dotTone: loadedDotTone };
    case "kept":
      return { label: "Kept", chipTone: "accent", dotTone: loadedDotTone };
    case "stopped":
      return { label: "Stopped", chipTone: "neutral", dotTone: "idle" };
    case "failed":
      return { label: "Failed", chipTone: "error", dotTone: "error" };
    default:
      return { label: labelUnknownStreamState(stream.state), chipTone: "outline", dotTone: loadedDotTone };
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

/** `1 stream`, `2,000 lines`. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

const MACOS_HOME_DIRECTORY_PREFIX = /^\/Users\/[^/]+(?=\/|$)/;

/** Shortens `/Users/<name>/…` to `~/…` for display. */
export function abbreviateHomeDirectory(absolutePath: string): string {
  return absolutePath.replace(MACOS_HOME_DIRECTORY_PREFIX, "~");
}
