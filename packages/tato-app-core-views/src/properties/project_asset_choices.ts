// What a config field naming a project asset offers to pick from: the open project's assets as the
// runtime's `list_assets` lists them, narrowed to the media the field's schema says it takes.

import type { JsonValue, ProjectAsset, ProjectAssetsReading } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The open project's assets as Properties holds them: listed, not listed yet, or refused in the runtime's words. */
export type ProjectAssetsForTheAssetFields = { kind: "listed"; assets: readonly ProjectAsset[] } | { kind: "not_listed_yet" } | { kind: "refused"; because: string };

/** The open project's assets from a reading of them, `null` while none arrived. */
export function projectAssetsForTheAssetFieldsOf(reading: ProjectAssetsReading | null): ProjectAssetsForTheAssetFields {
  if (reading === null) return { kind: "not_listed_yet" };
  if (reading.kind === "listed") return { kind: "listed", assets: reading.listing.assets };
  return { kind: "refused", because: reading.because };
}

/** The assets a field taking `mediaItTakes` offers, in the listing's order, which is by path: each one whose bytes hold one of those media, or every asset when it takes any. */
export function projectAssetsTheFieldOffers(assets: readonly ProjectAsset[], mediaItTakes: readonly string[] | null): ProjectAsset[] {
  if (mediaItTakes === null) return [...assets];
  return assets.filter((asset) => asset.media_its_bytes_hold?.some((medium) => mediaItTakes.includes(medium)) === true);
}

/** The field's value in words: the path of the asset it names, nothing for no asset, and a value naming no asset of the project as written. */
export function chosenProjectAssetWords(assets: readonly ProjectAsset[], value: JsonValue): string {
  if (value === null || value === "") return "None";
  if (typeof value !== "string") return JSON.stringify(value);
  return assets.find((asset) => asset.asset === value)?.path ?? value;
}

/** Each `media_facts` member the runtime names, in the window's words. */
const MEDIUM_WORDS: Readonly<Record<string, string>> = { image: "image", video: "video", audio: "audio file", lut: "LUT", scene: "3D scene" };

/** The media a field takes, in words, as "image" or "image or video"; "asset" for any. */
function mediaWords(mediaItTakes: readonly string[] | null): string {
  if (mediaItTakes === null || mediaItTakes.length === 0) return "asset";
  return mediaItTakes.map((medium) => MEDIUM_WORDS[medium] ?? medium).join(" or ");
}

/** The line the picker's menu shows above its choices: why it offers none, or `undefined` when it offers some. */
export function projectAssetPickerNote(projectAssets: ProjectAssetsForTheAssetFields, mediaItTakes: readonly string[] | null): string | undefined {
  if (projectAssets.kind === "not_listed_yet") return "Reading the project's assets…";
  if (projectAssets.kind === "refused") return projectAssets.because;
  if (projectAssetsTheFieldOffers(projectAssets.assets, mediaItTakes).length > 0) return undefined;
  return `No ${mediaWords(mediaItTakes)} of the project is ready to pick. Import one in the Library, and a file just imported shows here once the runtime has read it.`;
}
