import path from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, expect, test } from "vitest";
import type { ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import type { ProjectAssetFileFilter } from "./project_asset_file_filters.js";
import { importTheFilesThePersonChooses } from "./project_assets_imported_from_chosen_files.js";
import { failedWith, succeeded } from "./result.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { ProjectDialogs, ThisMachinesFolders } from "./studio_runtime.js";

const SAM: ProjectTransactionAuthor = { kind: "person", name: "sam" };

const localApisStarted: FakeLocalApiServer[] = [];

afterEach(async () => {
  for (const localApi of localApisStarted.splice(0)) await localApi.close();
});

/** Importing the files the dialog answers with into a runtime that refuses a `notes.txt` and places each other file in `media/` under its own name. */
async function importingFilesTheDialogAnswers(filesTheDialogAnswers: readonly string[] | null) {
  const importsAsked: Readonly<Record<string, unknown>>[] = [];
  const dialogsOpenedAt: string[] = [];
  const fileFiltersOffered: (readonly ProjectAssetFileFilter[])[] = [];
  const localApi = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    if (method !== "import_asset") return controlOperationFailedResponse(`this runtime answers no ${method}`);
    importsAsked.push(params);
    const source = typeof params["source"] === "string" ? params["source"] : "";
    if (source.endsWith("notes.txt")) return controlOperationFailedResponse("import_asset failed: a stream is never imported");
    const fileName = path.basename(source);
    return controlOperationResultResponse({
      asset: { asset: `uuid-of-${fileName}`, kind: "media", path: `media/${fileName}`, content_sha256: "0".repeat(64), content_byte_len: 4, import_settings: {} },
      transaction: "cd368349-3674-4f92-bab2-beb5c88f016e",
      commit: "e769184546f290d9ed91d980de2769655a52df9d",
    });
  });
  localApisStarted.push(localApi);
  const services = Layer.mergeAll(
    runtimeControlLayer(localApi.localApiSocketPath, 2_000),
    Layer.succeed(ThisMachinesFolders, { homeDirectory: "/home/sam", documentsDirectory: "/home/sam/Documents" }),
    Layer.mock(ProjectDialogs, {
      chooseAssetFilesToImport: (defaultFolder, fileFilters) =>
        Effect.sync(() => {
          dialogsOpenedAt.push(defaultFolder);
          fileFiltersOffered.push(fileFilters);
          return filesTheDialogAnswers;
        }),
    }),
  );
  const importTheFiles = (projectDirectory: string, media: readonly string[] | null) =>
    Effect.runPromise(
      importTheFilesThePersonChooses(projectDirectory, media, SAM).pipe(
        Effect.match({ onSuccess: (imported) => succeeded(imported), onFailure: ({ words }) => failedWith(words) }),
        Effect.provide(services),
      ),
    );
  return { importTheFiles, importsAsked, dialogsOpenedAt, fileFiltersOffered };
}

test("each chosen file is imported naming no path, so the runtime places it, by the person, one refusal leaving the rest to import", async () => {
  const { importTheFiles, importsAsked, dialogsOpenedAt, fileFiltersOffered } = await importingFilesTheDialogAnswers([
    "/home/sam/Pictures/poster.png",
    "/home/sam/notes.txt",
    "/home/sam/Movies/intro.mp4",
  ]);

  const imported = await importTheFiles("/projects/lobby", null);

  expect(dialogsOpenedAt).toEqual(["/home/sam"]);
  expect(fileFiltersOffered).toEqual([[{ name: "All files", extensions: ["*"] }]]);
  expect(importsAsked).toEqual([
    { project_directory: "/projects/lobby", source: "/home/sam/Pictures/poster.png", author: SAM },
    { project_directory: "/projects/lobby", source: "/home/sam/notes.txt", author: SAM },
    { project_directory: "/projects/lobby", source: "/home/sam/Movies/intro.mp4", author: SAM },
  ]);
  expect(imported).toEqual(
    succeeded({
      imported: [
        { asset: "uuid-of-poster.png", path: "media/poster.png" },
        { asset: "uuid-of-intro.mp4", path: "media/intro.mp4" },
      ],
      refused: [{ file_name: "notes.txt", because: "import_asset failed: a stream is never imported" }],
    }),
  );
});

test("choosing nothing imports nothing", async () => {
  const { importTheFiles, importsAsked } = await importingFilesTheDialogAnswers(null);

  expect(await importTheFiles("/projects/lobby", null)).toEqual(succeeded(null));
  expect(importsAsked).toEqual([]);
});

test("a field taking images opens the dialog on the image files the runtime reads, every file still choosable", async () => {
  const { importTheFiles, fileFiltersOffered } = await importingFilesTheDialogAnswers(null);

  await importTheFiles("/projects/lobby", ["image"]);

  expect(fileFiltersOffered).toEqual([
    [
      { name: "Image files", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "hdr", "exr"] },
      { name: "All files", extensions: ["*"] },
    ],
  ]);
});
