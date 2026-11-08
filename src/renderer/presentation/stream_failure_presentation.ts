/** What the window says of why a stream the runtime lists failed: the runtime's own words, whole, or that it gave none. */
export function streamFailureWords(failedBecause: string | null): string {
  return failedBecause ?? "The runtime lists it failed and gives no reason.";
}
