/** Why `displayName` cannot be a stream's name, before the runtime is asked, or `null` when it can; the runtime refuses a name that shows nothing. */
export function streamDisplayNameRefusal(displayName: string): string | null {
  return displayName.trim() === "" ? "Give the stream a name." : null;
}
