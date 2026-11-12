import { expect, test } from "vitest";
import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";
import { chosenProjectAssetOf, chosenProjectAssetWords, projectAssetsForTheAssetFieldsOf } from "./project_asset_choices";

const assetAt = (path: string, kind: string, mediaItsBytesHold: string[] | null): ProjectAsset => ({
  asset: `uuid-of-${path}`,
  kind,
  path,
  content_sha256: "0".repeat(64),
  content_byte_len: 1,
  import_settings: {},
  preview: null,
  media_its_bytes_hold: mediaItsBytesHold,
});

const HARBOUR_LIGHTS = [assetAt("luts/warm.cube", "data", ["lut"]), assetAt("media/harbour-dusk.png", "media", ["image"]), assetAt("media/quay-walk.mp4", "media", ["video", "audio"])];

test("the_chosen_asset_reads_as_its_path_none_as_none_and_a_value_naming_no_asset_as_written", () => {
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "uuid-of-media/harbour-dusk.png")).toBe("media/harbour-dusk.png");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "")).toBe("None");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, null)).toBe("None");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "tato-badge.png")).toBe("tato-badge.png");
});

test("the_field_names_an_asset_of_the_project_only_by_its_uuid", () => {
  expect(chosenProjectAssetOf(HARBOUR_LIGHTS, "uuid-of-luts/warm.cube")?.path).toBe("luts/warm.cube");
  expect(chosenProjectAssetOf(HARBOUR_LIGHTS, "luts/warm.cube")).toBeNull();
  expect(chosenProjectAssetOf(HARBOUR_LIGHTS, "")).toBeNull();
});

test("the_projects_assets_are_listed_not_listed_yet_or_refused_in_the_runtimes_words", () => {
  expect(projectAssetsForTheAssetFieldsOf(null)).toEqual({ kind: "not_listed_yet" });
  expect(projectAssetsForTheAssetFieldsOf({ kind: "listed", listing: { project_directory: "/p", project: "p", project_name: "p", assets: HARBOUR_LIGHTS } })).toEqual({ kind: "listed", assets: HARBOUR_LIGHTS });
  expect(projectAssetsForTheAssetFieldsOf({ kind: "not_listed", because: "list_assets failed: /p holds no project" })).toEqual({ kind: "refused", because: "list_assets failed: /p holds no project" });
});
