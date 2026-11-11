import { describe, expect, it } from "vitest";
import type { ProjectAsset, ProjectAssetListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import { assetFileName, assetFolderIdShownOf, importRefusalsOf, assetKindAndSizeWords, noAssetShownWords, assetFormatWords, assetPictureToneOf, assetsShownInTheFolder, assetsTheLibraryLists, byteLengthInWords, EVERY_ASSET_FOLDER_ID, libraryAssetFoldersOf, shortenedDigest } from "./library_assets_of_the_listing";

const assetAt = (path: string, kind: string, contentByteLen = 1): ProjectAsset => ({ asset: `uuid-of-${path}`, kind, path, content_sha256: "0".repeat(64), content_byte_len: contentByteLen, import_settings: {} });

const LOBBY_CAMERA_LISTING: ProjectAssetListing = {
  project_directory: "/home/sam/Tato Studio/Lobby Camera",
  project: "9ffa289f-60a1-48ed-a867-f19e3726aa96",
  project_name: "Lobby Camera",
  assets: [
    assetAt("luts/warm.cube", "data", 75),
    assetAt("media/lobby-intro.mp4", "media", 39_845_888),
    assetAt("media/poster.png", "media", 11_194),
    assetAt("readme-cover.jpg", "media"),
    assetAt("streams/main.graph.json", "stream"),
  ],
};

describe("the Library's assets", () => {
  it("lists every imported file but the graph documents, which are the project's streams", () => {
    expect(assetsTheLibraryLists(LOBBY_CAMERA_LISTING).map((asset) => asset.path)).toEqual(["luts/warm.cube", "media/lobby-intro.mp4", "media/poster.png", "readme-cover.jpg"]);
  });

  it("groups them by their folder at the project's top, every asset first, each with its count", () => {
    expect(libraryAssetFoldersOf(assetsTheLibraryLists(LOBBY_CAMERA_LISTING))).toEqual([
      { folder_id: EVERY_ASSET_FOLDER_ID, label: "All assets", asset_count: 4 },
      { folder_id: "folder:.", label: "Project folder", asset_count: 1 },
      { folder_id: "folder:luts", label: "luts", asset_count: 1 },
      { folder_id: "folder:media", label: "media", asset_count: 2 },
    ]);
  });

  it("shows a folder's assets, narrowed to the paths holding the search words whatever their case", () => {
    const assets = assetsTheLibraryLists(LOBBY_CAMERA_LISTING);
    expect(assetsShownInTheFolder(assets, "folder:media", "").map((asset) => asset.path)).toEqual(["media/lobby-intro.mp4", "media/poster.png"]);
    expect(assetsShownInTheFolder(assets, EVERY_ASSET_FOLDER_ID, " POSTER ").map((asset) => asset.path)).toEqual(["media/poster.png"]);
    expect(assetsShownInTheFolder(assets, "folder:luts", "poster")).toEqual([]);
  });

  it("names a file, its format, its size and its card's tint in words", () => {
    expect(assetFileName("media/lobby-intro.mp4")).toBe("lobby-intro.mp4");
    expect(assetFormatWords(assetAt("media/lobby-intro.mp4", "media"))).toBe("MP4");
    expect(assetFormatWords(assetAt("models/weights", "data"))).toBe("data");
    expect([1, 75, 11_194, 39_845_888, 2_621_440_000].map(byteLengthInWords)).toEqual(["1 byte", "75 bytes", "11 KB", "40 MB", "2.6 GB"]);
    expect(["media", "scene", "data", "tensor"].map((kind) => assetPictureToneOf(assetAt("x", kind)))).toEqual(["media", "scene", "data", "other"]);
    expect(shortenedDigest("16e89515f01295ded2534fd319db70fbd6bce1e95ed619b0127105489cc82700")).toBe("16e8…2700");
  });

  it("says what a card shows under its name, and why no card shows", () => {
    expect(assetKindAndSizeWords(assetAt("media/poster.png", "media", 11_194))).toBe("media · 11 KB");
    expect(noAssetShownWords(0, "All assets", "")).toEqual({ title: "No assets yet", explanation: "A file imported into the project, a video, an image, a LUT or a model, is listed here." });
    expect(noAssetShownWords(4, "luts", " poster ")).toEqual({ title: "No asset matches", explanation: "Nothing in luts has “poster” in its path." });
  });

  it("shows the folder chosen while the project still has it, every asset otherwise", () => {
    const folders = libraryAssetFoldersOf(assetsTheLibraryLists(LOBBY_CAMERA_LISTING));
    expect([assetFolderIdShownOf(folders, "folder:media"), assetFolderIdShownOf(folders, "folder:fonts")]).toEqual(["folder:media", EVERY_ASSET_FOLDER_ID]);
  });

  it("names each file the runtime refused to import in its words, and why nothing was imported", () => {
    expect(
      importRefusalsOf({
        kind: "imported",
        assets_imported: { imported: [{ asset: "a", path: "media/intro.mp4" }], refused: [{ file_name: "poster.png", because: "import_asset failed: `media/poster.png` is already the path of the asset b" }] },
      }),
    ).toEqual([{ lead: "Didn't import poster.png:", because: "import_asset failed: `media/poster.png` is already the path of the asset b" }]);
    expect(importRefusalsOf({ kind: "nothing_chosen" })).toEqual([]);
    expect(importRefusalsOf({ kind: "not_imported", because: "No project is open in this window." })).toEqual([{ lead: "Didn't import:", because: "No project is open in this window." }]);
  });
});
