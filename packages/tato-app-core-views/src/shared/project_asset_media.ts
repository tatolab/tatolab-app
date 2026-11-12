// Which of the open project's assets a config field naming one takes: those whose bytes hold one of the
// media its schema's `x-tatolab-project-asset` keyword names, as the runtime's `list_assets` reads them.

import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The assets a field taking `mediaItTakes` offers, in the listing's order, which is by path: each one whose bytes hold one of those media, or every asset when it takes any. */
export function projectAssetsTheFieldOffers(assets: readonly ProjectAsset[], mediaItTakes: readonly string[] | null): ProjectAsset[] {
  if (mediaItTakes === null) return [...assets];
  return assets.filter((asset) => asset.media_its_bytes_hold?.some((medium) => mediaItTakes.includes(medium)) === true);
}

/** Each `media_facts` member the runtime names, in the window's words. */
const MEDIUM_WORDS: Readonly<Record<string, string>> = { image: "image", video: "video", audio: "audio file", lut: "LUT", scene: "3D scene" };

/** The media a field takes, in words, as "image" or "image or video"; "asset" for any. */
export function projectAssetMediaWords(mediaItTakes: readonly string[] | null): string {
  if (mediaItTakes === null || mediaItTakes.length === 0) return "asset";
  return mediaItTakes.map((medium) => MEDIUM_WORDS[medium] ?? medium).join(" or ");
}

/** What Studio's asset picker is titled for a pick of `mediaItTakes`, as "Choose an image". */
export function projectAssetPickTitle(mediaItTakes: readonly string[] | null): string {
  const mediaWords = projectAssetMediaWords(mediaItTakes);
  return `Choose ${/^[aeiou]/i.test(mediaWords) ? "an" : "a"} ${mediaWords}`;
}
