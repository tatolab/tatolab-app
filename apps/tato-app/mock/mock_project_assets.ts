// The browser mock's `list_assets`: the pattern project's graph documents, under the stream asset
// UUIDs its streams are listed with, beside the media, scene and data files imported into it, as the
// mock's own imports, renames, moves and deletes left them, and the preview pictures its media show.

import type { AssetPreviewPicture, ProjectAsset, ProjectAssetListing, ProjectAssetsImported } from "../src/shared/tatolab_backend_contract";
import { mockStreamLocationOf } from "./mock_stream_fixtures";

const PATTERN_PROJECT = "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90";

const IMPORTED_INTO_THE_PATTERN_PROJECT: readonly ProjectAsset[] = [
  {
    asset: "045c7554-dab9-483e-a8fc-064bf9ad3668",
    kind: "data",
    path: "luts/warm.cube",
    content_sha256: "b032619c504ec122fd3abd4a7fb40815eb9464d1147500265c21f53ffba41c4e",
    content_byte_len: 75,
    import_settings: {},
    preview: null,
  },
  {
    asset: "207ef246-3d00-4167-b394-bb591f7c4b8f",
    kind: "media",
    path: "media/lobby-intro.mp4",
    content_sha256: "16e89515f01295ded2534fd319db70fbd6bce1e95ed619b0127105489cc82700",
    content_byte_len: 39_845_888,
    import_settings: {},
    preview: { pixel_width: 512, pixel_height: 288, media_type: "image/png" },
  },
  {
    asset: "baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b",
    kind: "media",
    path: "media/poster.png",
    content_sha256: "c59c55cad7da0e71892fae1bb29aa03ae76f1158e14afaf77d83c7e2f2b0fa05",
    content_byte_len: 11_194,
    import_settings: {},
    preview: { pixel_width: 384, pixel_height: 512, media_type: "image/png" },
  },
  {
    asset: "6d3e1f90-2b7a-4c58-9e04-1a8f5c7d2b36",
    kind: "scene",
    path: "scenes/stage.usdz",
    content_sha256: "8a1f0c2e4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70",
    content_byte_len: 2_621_440,
    import_settings: { up_axis: "y" },
    preview: null,
  },
];

/** The file the browser mock's open dialog answers Import asset… with, as the runtime would describe it once imported. */
const MOCK_FILE_CHOSEN_TO_IMPORT = { name: "night-sky", extension: ".jpg", kind: "media", content_sha256: "4f1b7e0c9a2d5e8f1b4c7a0d3e6f9b2c5a8d1e4f7b0c3a6d9e2f5b8c1a4d7e0f", content_byte_len: 2_202_009 } as const;

/** The pattern project's assets as the mock's Import asset…, Rename, Move and Delete changed them while it runs: each imported, each put at a new path by its UUID, and each no longer tracked. */
export interface MockProjectAssetsChangedWhileTheMockRuns {
  imported: ProjectAsset[];
  relocatedPathByAsset: Map<string, string>;
  deleted: Set<string>;
}

/** No asset of the pattern project changed yet. */
export function mockProjectAssetsUnchanged(): MockProjectAssetsChangedWhileTheMockRuns {
  return { imported: [], relocatedPathByAsset: new Map(), deleted: new Set() };
}

/** What the browser mock's Import asset… does: imports the one file its dialog answers with, or also refuses a graph document chosen beside it, in the runtime's words. */
export type MockAssetImportScenario = "imports_one" | "refuses_one";

/** The mock's `import_assets_into_the_open_project`: the file its dialog answers with imported into its kind's folder of the pattern project in `streamsFolder`, as the runtime places an import that names no path, its name numbered `-2`, `-3` past one already there, kept in `assetsChangedWhileTheMockRuns`, and with `refuses_one` a graph document refused beside it. */
export function mockImportTheFilesChosen(
  projectDirectory: string,
  streamsFolder: string,
  assetsChangedWhileTheMockRuns: MockProjectAssetsChangedWhileTheMockRuns,
  assetImportScenario: MockAssetImportScenario,
): ProjectAssetsImported | string {
  const listing = mockProjectAssetListing(projectDirectory, streamsFolder, assetsChangedWhileTheMockRuns);
  if (listing === null) return `import_asset failed: ${projectDirectory} holds no project`;
  const pathsHeld = new Set(listing.assets.map((asset) => asset.path));
  let numberPastTheFilesHeld = 1;
  const pathNumbered = () =>
    `${MOCK_FILE_CHOSEN_TO_IMPORT.kind}/${MOCK_FILE_CHOSEN_TO_IMPORT.name}${numberPastTheFilesHeld === 1 ? "" : `-${numberPastTheFilesHeld}`}${MOCK_FILE_CHOSEN_TO_IMPORT.extension}`;
  while (pathsHeld.has(pathNumbered())) numberPastTheFilesHeld += 1;
  const imported: ProjectAsset = {
    asset: `5e0c6a1d-7f2b-4c93-8a1e-${String(assetsChangedWhileTheMockRuns.imported.length + 1).padStart(12, "0")}`,
    kind: MOCK_FILE_CHOSEN_TO_IMPORT.kind,
    path: pathNumbered(),
    content_sha256: MOCK_FILE_CHOSEN_TO_IMPORT.content_sha256,
    content_byte_len: MOCK_FILE_CHOSEN_TO_IMPORT.content_byte_len,
    import_settings: {},
    preview: { pixel_width: 512, pixel_height: 341, media_type: "image/png" },
  };
  assetsChangedWhileTheMockRuns.imported.push(imported);
  const refused =
    assetImportScenario === "refuses_one"
      ? [{ file_name: "main.graph.json", because: `import_asset failed: \`data/main.graph.json\` is not an asset path: it names a stream's graph document, which only the stream verbs write` }]
      : [];
  return { imported: [{ asset: imported.asset, path: imported.path }], refused };
}

/** The mock runtime's `relocate_asset` of `asset` in the pattern project in `streamsFolder` to `toPath`, kept in `assetsChangedWhileTheMockRuns`, refused in the runtime's words for an asset it does not hold or a path another asset takes. */
export function mockRelocateTheAsset(projectDirectory: string, streamsFolder: string, assetsChangedWhileTheMockRuns: MockProjectAssetsChangedWhileTheMockRuns, asset: string, toPath: string): string | null {
  const listing = mockProjectAssetListing(projectDirectory, streamsFolder, assetsChangedWhileTheMockRuns);
  if (listing === null) return `relocate_asset failed: ${projectDirectory} holds no project`;
  if (!listing.assets.some((listed) => listed.asset === asset)) return `relocate_asset failed: the project holds no asset ${asset}`;
  const takenBy = listing.assets.find((listed) => listed.path === toPath && listed.asset !== asset);
  if (takenBy !== undefined) return `relocate_asset failed: \`${toPath}\` is already the path of the asset ${takenBy.asset}`;
  assetsChangedWhileTheMockRuns.relocatedPathByAsset.set(asset, toPath);
  return null;
}

/** The mock runtime's `delete_asset` of `asset` in the pattern project in `streamsFolder`, kept in `assetsChangedWhileTheMockRuns`, refused in the runtime's words for an asset it does not hold. */
export function mockDeleteTheAsset(projectDirectory: string, streamsFolder: string, assetsChangedWhileTheMockRuns: MockProjectAssetsChangedWhileTheMockRuns, asset: string): string | null {
  const listing = mockProjectAssetListing(projectDirectory, streamsFolder, assetsChangedWhileTheMockRuns);
  if (listing === null) return `delete_asset failed: ${projectDirectory} holds no project`;
  if (!listing.assets.some((listed) => listed.asset === asset)) return `delete_asset failed: the project holds no asset ${asset}`;
  assetsChangedWhileTheMockRuns.deleted.add(asset);
  return null;
}

/** The mock runtime's `list_assets` for `projectDirectory` in `streamsFolder`, as `assetsChangedWhileTheMockRuns` left it, or `null` for a folder it holds no project in. */
export function mockProjectAssetListing(projectDirectory: string, streamsFolder: string, assetsChangedWhileTheMockRuns: MockProjectAssetsChangedWhileTheMockRuns): ProjectAssetListing | null {
  if (projectDirectory !== `${streamsFolder}/pattern`) return null;
  const graphDocuments = ["main", "pattern_two", "recorder"].map(
    (streamName): ProjectAsset => ({
      asset: mockStreamLocationOf({ project_directory: projectDirectory, stream_name: streamName }).stream_asset,
      kind: "stream",
      path: `streams/${streamName}.graph.json`,
      content_sha256: "7532ea351de7579977e9522904ac0e774b55b702a15ad4e051ab50203fee6ff6",
      content_byte_len: 1_112,
      import_settings: {},
      preview: null,
    }),
  );
  return {
    project_directory: projectDirectory,
    project: PATTERN_PROJECT,
    project_name: "pattern",
    assets: [...IMPORTED_INTO_THE_PATTERN_PROJECT, ...assetsChangedWhileTheMockRuns.imported, ...graphDocuments]
      .filter((asset) => !assetsChangedWhileTheMockRuns.deleted.has(asset.asset))
      .map((asset) => ({ ...asset, path: assetsChangedWhileTheMockRuns.relocatedPathByAsset.get(asset.asset) ?? asset.path }))
      .sort((first, second) => first.path.localeCompare(second.path)),
  };
}

/** A stand-in preview picture drawn for each media asset from its content digest: a two-colour sky, a horizon and a lit window, as an SVG `data:` URL. */
function mockPreviewPictureDrawnFor(contentSha256: string, pixelWidth: number, pixelHeight: number): string {
  const hueFromTheDigest = Number.parseInt(contentSha256.slice(0, 2), 16) * (360 / 256);
  const skyHue = Math.round(hueFromTheDigest);
  const groundHue = Math.round((hueFromTheDigest + 160) % 360);
  const pictureSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}">`,
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${skyHue} 70% 22%)"/><stop offset="1" stop-color="hsl(${skyHue} 80% 62%)"/></linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#sky)"/>`,
    `<rect x="${Math.round(pixelWidth * 0.58)}" y="${Math.round(pixelHeight * 0.42)}" width="${Math.round(pixelWidth * 0.2)}" height="${Math.round(pixelHeight * 0.24)}" rx="${Math.round(pixelHeight * 0.03)}" fill="hsl(40 95% 72%)"/>`,
    `<rect y="${Math.round(pixelHeight * 0.66)}" width="100%" height="${Math.round(pixelHeight * 0.34)}" fill="hsl(${groundHue} 45% 18%)"/>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;base64,${btoa(pictureSvg)}`;
}

/** The mock runtime's `read_asset_preview` of `asset` in the pattern project in `streamsFolder`, or why it has none in the runtime's words. */
export function mockReadTheAssetPreview(projectDirectory: string, streamsFolder: string, assetsChangedWhileTheMockRuns: MockProjectAssetsChangedWhileTheMockRuns, asset: string): AssetPreviewPicture | string {
  const listing = mockProjectAssetListing(projectDirectory, streamsFolder, assetsChangedWhileTheMockRuns);
  if (listing === null) return `read_asset_preview failed: ${projectDirectory} holds no project`;
  const listed = listing.assets.find((candidate) => candidate.asset === asset);
  if (listed === undefined) return `read_asset_preview failed: the project holds no asset ${asset}`;
  if (listed.preview === null) return `read_asset_preview failed: asset ${asset} has no preview picture; the runtime makes one for an image`;
  return { picture_url: mockPreviewPictureDrawnFor(listed.content_sha256, listed.preview.pixel_width, listed.preview.pixel_height), pixel_width: listed.preview.pixel_width, pixel_height: listed.preview.pixel_height };
}
