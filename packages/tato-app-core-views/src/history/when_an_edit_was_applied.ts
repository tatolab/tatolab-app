// When an edit was applied, in the words a History row and its day heading use, from the wall-clock time the
// runtime records as `applied_at`; display only.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function startOfTheDayMs(timeMs: number): number {
  const day = new Date(timeMs);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

/** How long ago `appliedAt` was at `nowMs`: "just now", "4 min ago", "2 h ago", then the day and time. */
export function howLongAgoTheEditWasApplied(appliedAt: string, nowMs: number): string {
  const appliedAtMs = Date.parse(appliedAt);
  if (Number.isNaN(appliedAtMs)) return appliedAt;
  const agoMs = Math.max(0, nowMs - appliedAtMs);
  if (agoMs < MINUTE_MS) return "just now";
  if (agoMs < HOUR_MS) return `${Math.floor(agoMs / MINUTE_MS)} min ago`;
  if (agoMs < 12 * HOUR_MS) return `${Math.floor(agoMs / HOUR_MS)} h ago`;
  return new Date(appliedAtMs).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The heading over the edits applied on `appliedAt`'s day: "Today", "Yesterday", or the date. */
export function dayTheEditWasApplied(appliedAt: string, nowMs: number): string {
  const appliedAtMs = Date.parse(appliedAt);
  if (Number.isNaN(appliedAtMs)) return "Earlier";
  const daysAgo = Math.round((startOfTheDayMs(nowMs) - startOfTheDayMs(appliedAtMs)) / (24 * HOUR_MS));
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return new Date(appliedAtMs).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
