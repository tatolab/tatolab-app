/** The levels the runtime writes, least severe first; a level this app does not know ranks as info. */
const LOG_LEVEL_RANKS: Record<string, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

const UNKNOWN_LOG_LEVEL_RANK = LOG_LEVEL_RANKS.info;

/** Where `level` sorts among the runtime's levels, for the console's minimum-level filter. */
export function rankLogLevel(level: string | null): number {
  if (level === null) return UNKNOWN_LOG_LEVEL_RANK;
  return LOG_LEVEL_RANKS[level.toLowerCase()] ?? UNKNOWN_LOG_LEVEL_RANK;
}

/** The minimum levels the console's level filter offers. */
export const LOG_LEVEL_FILTER_CHOICES: readonly { label: string; minimumRank: number }[] = [
  { label: "All levels", minimumRank: LOG_LEVEL_RANKS.trace },
  { label: "Debug and above", minimumRank: LOG_LEVEL_RANKS.debug },
  { label: "Info and above", minimumRank: LOG_LEVEL_RANKS.info },
  { label: "Warnings and errors", minimumRank: LOG_LEVEL_RANKS.warn },
  { label: "Errors only", minimumRank: LOG_LEVEL_RANKS.error },
];

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
