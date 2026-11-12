import { expect, test } from "vitest";
import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";
import { projectAssetMediaWords, projectAssetPickTitle, projectAssetsTheFieldOffers } from "./project_asset_media";

const assetAt = (path: string, mediaItsBytesHold: string[] | null): ProjectAsset => ({
  asset: `uuid-of-${path}`,
  kind: "media",
  path,
  content_sha256: "0".repeat(64),
  content_byte_len: 1,
  import_settings: {},
  preview: null,
  media_its_bytes_hold: mediaItsBytesHold,
});

const HARBOUR_LIGHTS = [assetAt("luts/warm.cube", ["lut"]), assetAt("media/harbour-dusk.png", ["image"]), assetAt("media/just-imported.png", null), assetAt("media/quay-walk.mp4", ["video", "audio"])];

test("an_image_field_offers_the_images_whose_facts_were_read_and_a_field_taking_any_offers_every_asset", () => {
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, ["image"]).map((asset) => asset.path)).toEqual(["media/harbour-dusk.png"]);
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, ["image", "audio"]).map((asset) => asset.path)).toEqual(["media/harbour-dusk.png", "media/quay-walk.mp4"]);
  expect(projectAssetsTheFieldOffers(HARBOUR_LIGHTS, null)).toHaveLength(HARBOUR_LIGHTS.length);
});

test("the_media_a_field_takes_read_in_the_windows_words_and_title_the_asset_picker", () => {
  expect(projectAssetMediaWords(["lut", "audio"])).toBe("LUT or audio file");
  expect(projectAssetMediaWords(null)).toBe("asset");
  expect(projectAssetPickTitle(["image"])).toBe("Choose an image");
  expect(projectAssetPickTitle(["scene"])).toBe("Choose a 3D scene");
  expect(projectAssetPickTitle(["lut"])).toBe("Choose a LUT");
  expect(projectAssetPickTitle(null)).toBe("Choose an asset");
});
