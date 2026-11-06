/**
 * How this build updates itself: Squirrel.Mac from a signed `.zip` on macOS; an AppImage replacing the file
 * at `appImagePath`; a `.deb`, which only finds the newer version and opens its download; or why it cannot.
 */
export type TatolabAppUpdatePackaging =
  | { kind: "squirrel_mac_zip" }
  | { kind: "appimage"; appImagePath: string }
  | { kind: "deb" }
  | { kind: "not_offered"; reason: string };

/** Why an unpackaged app offers no updates. */
export const UNPACKAGED_APP_UPDATE_REFUSAL = "Only a packaged Tato Studio updates itself.";
