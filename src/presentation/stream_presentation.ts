import type { ListedStream } from "../backend/tatolab_backend_contract";

/** How strongly a stream's state word reads: plain, dimmed while stopped, or red with an alert icon when failed. */
export type StreamStateEmphasis = "plain" | "quiet" | "failure";

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
function isStreamLoaded(stream: ListedStream): boolean {
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
      return { label: "Attached", emphasis: "plain", meaning: "Attached: it runs while the terminal that started it does." };
    case "kept":
      return {
        label: "Kept",
        emphasis: "plain",
        meaning: "Kept: Tatolab loads it every time the runtime starts, until you stop it.",
      };
    case "stopped":
      return {
        label: "Stopped",
        emphasis: "quiet",
        meaning: `Stopped: remembered, not loaded. tatolab start ${stream.name} loads it.`,
      };
    case "failed":
      return { label: "Failed", emphasis: "failure", meaning: stream.failed_because ?? "Failed at its last start." };
    default: {
      const label = labelUnknownStreamState(stream.state);
      return { label, emphasis: "plain", meaning: `${label}: this version of Tatolab doesn't know this state yet.` };
    }
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

/** A home directory where macOS (`/Users/<name>`) and Linux (`/home/<name>`) put one. */
const HOME_DIRECTORY_PREFIX = /^\/(?:Users|home)\/[^/]+(?=\/|$)/;

/** Shortens `/Users/<name>/…` or `/home/<name>/…` to `~/…` for display. */
export function abbreviateHomeDirectory(absolutePath: string): string {
  return absolutePath.replace(HOME_DIRECTORY_PREFIX, "~");
}
