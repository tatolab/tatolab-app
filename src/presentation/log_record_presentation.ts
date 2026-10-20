// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** The levels the runtime writes, least severe first; a level this app does not know ranks as info. */
const LOG_LEVEL_RANKS: Record<string, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

const UNKNOWN_LOG_LEVEL_RANK = LOG_LEVEL_RANKS.info;

/** Where `level` sorts among the runtime's levels, for the console's minimum-level filter. */
export function rankLogLevel(level: string | null): number {
  if (level === null) return UNKNOWN_LOG_LEVEL_RANK;
  return LOG_LEVEL_RANKS[level.toLowerCase()] ?? UNKNOWN_LOG_LEVEL_RANK;
}

/** One segment of the log dock's level control: the lowest level it shows, and the level its count counts. */
export interface LogLevelSegment {
  label: string;
  minimumRank: number;
  /** The segment counts the held lines at exactly this rank; `null` for a segment with no count. */
  countedRank: number | null;
}

/** All, Warnings and Errors: Warnings shows warn and above, and counts the warn lines alone. */
export const LOG_LEVEL_SEGMENTS: readonly LogLevelSegment[] = [
  { label: "All", minimumRank: LOG_LEVEL_RANKS.trace, countedRank: null },
  { label: "Warnings", minimumRank: LOG_LEVEL_RANKS.warn, countedRank: LOG_LEVEL_RANKS.warn },
  { label: "Errors", minimumRank: LOG_LEVEL_RANKS.error, countedRank: LOG_LEVEL_RANKS.error },
];

/** How a log line's level word reads: quiet for trace and debug, amber for warn, red for error, else plain. */
export type LogLevelWordTone = "quiet" | "plain" | "warn" | "error";

/** The tone of `level`'s word; a level this app does not know reads as plainly as info. */
export function presentLogLevelWord(level: string | null): LogLevelWordTone {
  const rank = rankLogLevel(level);
  if (rank <= LOG_LEVEL_RANKS.debug) return "quiet";
  if (rank === LOG_LEVEL_RANKS.warn) return "warn";
  if (rank === LOG_LEVEL_RANKS.error) return "error";
  return "plain";
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function dateOfHostTimestamp(hostTimestampNanoseconds: number): Date {
  return new Date(hostTimestampNanoseconds / 1_000_000);
}

/** `HH:MM:SS.mmm` in local time. */
export function formatLogRecordTime(hostTimestampNanoseconds: number | null): string {
  if (hostTimestampNanoseconds === null) return "--:--:--.---";
  const recordedAt = dateOfHostTimestamp(hostTimestampNanoseconds);
  return `${padNumber(recordedAt.getHours(), 2)}:${padNumber(recordedAt.getMinutes(), 2)}:${padNumber(
    recordedAt.getSeconds(),
    2,
  )}.${padNumber(recordedAt.getMilliseconds(), 3)}`;
}

/** The date and time a record was written, for the tooltip on its time. */
export function formatLogRecordDateTime(hostTimestampNanoseconds: number | null): string {
  if (hostTimestampNanoseconds === null) return "No timestamp";
  return dateOfHostTimestamp(hostTimestampNanoseconds).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/** An attribute value as logfmt writes it: quoted when it is empty or holds a space, `=` or `"`. */
export function formatLogAttrValue(value: string): string {
  return value === "" || /[\s="]/.test(value) ? JSON.stringify(value) : value;
}
