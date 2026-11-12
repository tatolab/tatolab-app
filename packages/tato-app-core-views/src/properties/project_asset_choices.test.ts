import { expect, test } from "vitest";
import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";
import { chosenProjectAssetWords, projectAssetPickerNote, projectAssetsForTheAssetFieldsOf, projectAssetsTheFieldOffers } from "./project_asset_choices";

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

const HARBOUR_LIGHTS = [
  assetAt("luts/warm.cube", "data", ["lut"]),
  assetAt("media/harbour-dusk.png", "media", ["image"]),
  assetAt("media/just-imported.png", "media", null),
  assetAt("media/quay-walk.mp4", "media", ["video", "audio"]),
  assetAt("streams/main.graph.json", "stream", null),
];

test("an_image_field_offers_the_images_whose_facts_were_read_and_a_field_taking_any_offers_every_asset", () => {
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, ["image"]).map((asset) => asset.path)).toEqual(["media/harbour-dusk.png"]);
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, ["image", "audio"]).map((asset) => asset.path)).toEqual(["media/harbour-dusk.png", "media/quay-walk.mp4"]);
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, null)).toHaveLength(HARBOUR_LIGHTS.length);
});

test("the_chosen_asset_reads_as_its_path_none_as_none_and_a_value_naming_no_asset_as_written", () => {
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "uuid-of-media/harbour-dusk.png")).toBe("media/harbour-dusk.png");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "")).toBe("None");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, null)).toBe("None");
  expect(chosenProjectAssetWords(HARBOUR_LIGHTS, "tato-badge.png")).toBe("tato-badge.png");
});

test("the_picker_says_why_it_offers_nothing_and_says_nothing_when_it_offers_an_asset", () => {
  const listed = projectAssetsForTheAssetFieldsOf({ kind: "listed", listing: { project_directory: "/p", project: "p", project_name: "p", assets: HARBOUR_LIGHTS } });
  expect(projectAssetPickerNote(listed, ["image"])).toBeUndefined();
  expect(projectAssetPickerNote(listed, ["scene"])).toBe("No 3D scene of the project is ready to pick. Import one in the Library, and a file just imported shows here once the runtime has read it.");
  const listedEmpty = projectAssetsForTheAssetFieldsOf({ kind: "listed", listing: { project_directory: "/p", project: "p", project_name: "p", assets: [] } });
  expect(projectAssetPickerNote(listedEmpty, ["lut", "audio"])).toBe("No LUT or audio file of the project is ready to pick. Import one in the Library, and a file just imported shows here once the runtime has read it.");
  expect(projectAssetPickerNote(projectAssetsForTheAssetFieldsOf(null), ["image"])).toBe("Reading the project's assets…");
  expect(projectAssetPickerNote(projectAssetsForTheAssetFieldsOf({ kind: "not_listed", because: "list_assets failed: /p holds no project" }), ["image"])).toBe("list_assets failed: /p holds no project");
});
