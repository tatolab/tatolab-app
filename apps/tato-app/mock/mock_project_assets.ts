// The browser mock's `list_assets`: the pattern project's graph documents, under the stream asset
// UUIDs its streams are listed with, beside the media, scene and data files imported into it.

import type { ProjectAsset, ProjectAssetListing, ProjectAssetsImported } from "../src/shared/tatolab_backend_contract";
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
  },
  {
    asset: "207ef246-3d00-4167-b394-bb591f7c4b8f",
    kind: "media",
    path: "media/lobby-intro.mp4",
    content_sha256: "16e89515f01295ded2534fd319db70fbd6bce1e95ed619b0127105489cc82700",
    content_byte_len: 39_845_888,
    import_settings: {},
  },
  {
    asset: "baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b",
    kind: "media",
    path: "media/poster.png",
    content_sha256: "c59c55cad7da0e71892fae1bb29aa03ae76f1158e14afaf77d83c7e2f2b0fa05",
    content_byte_len: 11_194,
    import_settings: {},
  },
  {
    asset: "6d3e1f90-2b7a-4c58-9e04-1a8f5c7d2b36",
    kind: "scene",
    path: "scenes/stage.usdz",
    content_sha256: "8a1f0c2e4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70",
    content_byte_len: 2_621_440,
    import_settings: { up_axis: "y" },
  },
];

/** The file the browser mock's open dialog answers Import asset… with, as the runtime would describe it once imported. */
const MOCK_FILE_CHOSEN_TO_IMPORT = { name: "night-sky", extension: ".jpg", kind: "media", content_sha256: "4f1b7e0c9a2d5e8f1b4c7a0d3e6f9b2c5a8d1e4f7b0c3a6d9e2f5b8c1a4d7e0f", content_byte_len: 2_202_009 } as const;

/** The mock runtime's `import_asset` of the one file its dialog answers with, into `intoFolder` of the pattern project in `streamsFolder` under the file's name numbered past one already there, kept in `assetsImportedWhileTheMockRuns`; refused for any other project in the runtime's words. */
export function mockImportTheFileChosenInto(projectDirectory: string, streamsFolder: string, intoFolder: string, assetsImportedWhileTheMockRuns: ProjectAsset[]): ProjectAssetsImported {
  const listing = mockProjectAssetListing(projectDirectory, streamsFolder, assetsImportedWhileTheMockRuns);
  if (listing === null) return { imported: [], refused: [{ file_name: `${MOCK_FILE_CHOSEN_TO_IMPORT.name}${MOCK_FILE_CHOSEN_TO_IMPORT.extension}`, because: `import_asset failed: ${projectDirectory} holds no project` }] };
  const pathsHeld = new Set(listing.assets.map((asset) => asset.path));
  const folderPrefix = intoFolder === "" ? "" : `${intoFolder}/`;
  let number = 1;
  const pathNumbered = () => `${folderPrefix}${MOCK_FILE_CHOSEN_TO_IMPORT.name}${number === 1 ? "" : ` ${number}`}${MOCK_FILE_CHOSEN_TO_IMPORT.extension}`;
  while (pathsHeld.has(pathNumbered())) number += 1;
  const imported: ProjectAsset = {
    asset: `5e0c6a1d-7f2b-4c93-8a1e-${String(assetsImportedWhileTheMockRuns.length + 1).padStart(12, "0")}`,
    kind: MOCK_FILE_CHOSEN_TO_IMPORT.kind,
    path: pathNumbered(),
    content_sha256: MOCK_FILE_CHOSEN_TO_IMPORT.content_sha256,
    content_byte_len: MOCK_FILE_CHOSEN_TO_IMPORT.content_byte_len,
    import_settings: {},
  };
  assetsImportedWhileTheMockRuns.push(imported);
  return { imported: [{ asset: imported.asset, path: imported.path }], refused: [] };
}

/** The mock runtime's `list_assets` for `projectDirectory` in `streamsFolder`, `assetsImportedWhileTheMockRuns` among them, or `null` for a folder it holds no project in. */
export function mockProjectAssetListing(projectDirectory: string, streamsFolder: string, assetsImportedWhileTheMockRuns: readonly ProjectAsset[]): ProjectAssetListing | null {
  if (projectDirectory !== `${streamsFolder}/pattern`) return null;
  const graphDocuments = ["main", "pattern_two", "recorder"].map(
    (streamName): ProjectAsset => ({
      asset: mockStreamLocationOf({ project_directory: projectDirectory, stream_name: streamName }).stream_asset,
      kind: "stream",
      path: `streams/${streamName}.graph.json`,
      content_sha256: "7532ea351de7579977e9522904ac0e774b55b702a15ad4e051ab50203fee6ff6",
      content_byte_len: 1_112,
      import_settings: {},
    }),
  );
  return {
    project_directory: projectDirectory,
    project: PATTERN_PROJECT,
    project_name: "pattern",
    assets: [...IMPORTED_INTO_THE_PATTERN_PROJECT, ...assetsImportedWhileTheMockRuns, ...graphDocuments].sort((first, second) => first.path.localeCompare(second.path)),
  };
}
