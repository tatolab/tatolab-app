// What a config field naming a project asset shows of the open project's assets as the runtime's
// `list_assets` lists them: the path of the one it names.

import type { JsonValue, ProjectAsset, ProjectAssetsReading } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The open project's assets as Properties holds them: listed, not listed yet, or refused in the runtime's words. */
export type ProjectAssetsForTheAssetFields = { kind: "listed"; assets: readonly ProjectAsset[] } | { kind: "not_listed_yet" } | { kind: "refused"; because: string };

/** The open project's assets from a reading of them, `null` while none arrived. */
export function projectAssetsForTheAssetFieldsOf(reading: ProjectAssetsReading | null): ProjectAssetsForTheAssetFields {
  if (reading === null) return { kind: "not_listed_yet" };
  if (reading.kind === "listed") return { kind: "listed", assets: reading.listing.assets };
  return { kind: "refused", because: reading.because };
}

/** The asset of the project the field's value names, `null` for none or a value naming no asset of the project. */
export function chosenProjectAssetOf(assets: readonly ProjectAsset[], value: JsonValue): ProjectAsset | null {
  if (typeof value !== "string" || value === "") return null;
  return assets.find((asset) => asset.asset === value) ?? null;
}

/** The field's value in words: the path of the asset it names, nothing for no asset, and a value naming no asset of the project as written. */
export function chosenProjectAssetWords(assets: readonly ProjectAsset[], value: JsonValue): string {
  if (value === null || value === "") return "None";
  if (typeof value !== "string") return JSON.stringify(value);
  return chosenProjectAssetOf(assets, value)?.path ?? value;
}
