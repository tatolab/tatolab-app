import { describe, expect, it } from "vitest";
import type {
  AssetPreviewReading,
  ProjectAsset,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { LibraryAssetPreviewPicturesReadOnce } from "./library_asset_preview_pictures";

const POSTER_FRAME = {
  pixel_width: 512,
  pixel_height: 288,
  media_type: "image/png",
};

const assetWithAPreview = (
  asset: string,
  contentSha256 = "a".repeat(64),
): ProjectAsset => ({
  asset,
  kind: "media",
  path: `media/${asset}.mp4`,
  content_sha256: contentSha256,
  content_byte_len: 1,
  import_settings: {},
  preview: POSTER_FRAME,
});

const pictureOf = (asset: string): AssetPreviewReading => ({
  kind: "read",
  picture: {
    picture_url: `data:image/png;base64,${asset}`,
    pixel_width: 512,
    pixel_height: 288,
  },
});

/** Preview reads answered by hand, each kept until `answer` settles it, and how often a landed picture asked for the view to be drawn again. */
function heldPreviewReads() {
  const readsAsked: {
    asset: string;
    answer: (reading: AssetPreviewReading) => void;
  }[] = [];
  let picturesLanded = 0;
  const previewPictures = new LibraryAssetPreviewPicturesReadOnce(
    (asset) => new Promise((answer) => readsAsked.push({ asset, answer })),
    () => (picturesLanded += 1),
  );
  return { previewPictures, readsAsked, picturesLanded: () => picturesLanded };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the Library's asset preview pictures", () => {
  it("asks nothing for an asset the runtime makes no preview for", async () => {
    const { previewPictures, readsAsked } = heldPreviewReads();
    expect(
      previewPictures.pictureOf({
        ...assetWithAPreview("lut"),
        kind: "data",
        preview: null,
      }),
    ).toBeNull();
    await settled();
    expect(readsAsked).toEqual([]);
  });

  it("reads a picture once, holding it as being read until it lands, then draws the view again", async () => {
    const { previewPictures, readsAsked, picturesLanded } = heldPreviewReads();
    const clip = assetWithAPreview("clip");
    expect(previewPictures.pictureOf(clip)).toEqual({ kind: "reading" });
    expect(previewPictures.pictureOf(clip)).toEqual({ kind: "reading" });
    await settled();
    expect(readsAsked.map((read) => read.asset)).toEqual(["clip"]);
    readsAsked[0]?.answer(pictureOf("clip"));
    await settled();
    expect(picturesLanded()).toBe(1);
    expect(previewPictures.pictureOf(clip)).toEqual(pictureOf("clip"));
  });

  it("keeps a picture across a rename and reads it again once the asset's bytes change", async () => {
    const { previewPictures, readsAsked } = heldPreviewReads();
    previewPictures.pictureOf(assetWithAPreview("clip"));
    await settled();
    readsAsked[0]?.answer(pictureOf("clip"));
    await settled();
    expect(
      previewPictures.pictureOf({
        ...assetWithAPreview("clip"),
        path: "media/renamed.mp4",
      }),
    ).toEqual(pictureOf("clip"));
    expect(
      previewPictures.pictureOf(assetWithAPreview("clip", "b".repeat(64))),
    ).toEqual({ kind: "reading" });
    await settled();
    expect(readsAsked.map((read) => read.asset)).toEqual(["clip", "clip"]);
  });

  it("holds a refusal in the runtime's words", async () => {
    const { previewPictures, readsAsked } = heldPreviewReads();
    const clip = assetWithAPreview("clip");
    previewPictures.pictureOf(clip);
    await settled();
    readsAsked[0]?.answer({
      kind: "not_read",
      because: "read_asset_preview failed: no file is at asset clip's path",
    });
    await settled();
    expect(previewPictures.pictureOf(clip)).toEqual({
      kind: "not_read",
      because: "read_asset_preview failed: no file is at asset clip's path",
    });
  });

  it("reads at most four pictures at once, the next starting as one lands", async () => {
    const { previewPictures, readsAsked } = heldPreviewReads();
    for (const asset of ["a", "b", "c", "d", "e", "f"])
      previewPictures.pictureOf(assetWithAPreview(asset));
    await settled();
    expect(readsAsked.map((read) => read.asset)).toEqual(["a", "b", "c", "d"]);
    readsAsked[0]?.answer(pictureOf("a"));
    await settled();
    expect(readsAsked.map((read) => read.asset)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("reads nothing more and draws nothing once stopped", async () => {
    const { previewPictures, readsAsked, picturesLanded } = heldPreviewReads();
    previewPictures.pictureOf(assetWithAPreview("clip"));
    await settled();
    previewPictures.stop();
    readsAsked[0]?.answer(pictureOf("clip"));
    await settled();
    expect(picturesLanded()).toBe(0);
  });
});
