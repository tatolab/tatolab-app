import path from "node:path";
import { expect, test } from "vitest";
import type { ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { ProjectAssetsImportedFromChosenFiles } from "./project_assets_imported_from_chosen_files.js";
import { succeeded } from "./result.js";

const SAM: ProjectTransactionAuthor = { kind: "person", name: "sam" };

function importingFilesTheDialogAnswers(filesTheDialogAnswers: readonly string[] | null) {
  const importsAsked: { projectDirectory: string; source: string; assetPath: string | null; author: ProjectTransactionAuthor | null }[] = [];
  const dialogsOpenedAt: string[] = [];
  const assetImport = new ProjectAssetsImportedFromChosenFiles({
    homeDirectory: "/home/sam",
    projectAssetFilesDialog: async (defaultFolder) => {
      dialogsOpenedAt.push(defaultFolder);
      return succeeded(filesTheDialogAnswers);
    },
    projectChanges: {
      importAsset: async (projectDirectory, source, assetPath, author) => {
        importsAsked.push({ projectDirectory, source, assetPath, author });
        if (source.endsWith("notes.txt")) return localApiRequestFailure("import_asset failed: a stream is never imported");
        const fileName = path.basename(source);
        return succeeded({ asset: `uuid-of-${fileName}`, path: `media/${fileName}` });
      },
    },
  });
  return { assetImport, importsAsked, dialogsOpenedAt };
}

test("each chosen file is imported naming no path, so the runtime places it, by the person, one refusal leaving the rest to import", async () => {
  const { assetImport, importsAsked, dialogsOpenedAt } = importingFilesTheDialogAnswers(["/home/sam/Pictures/poster.png", "/home/sam/notes.txt", "/home/sam/Movies/intro.mp4"]);

  const imported = await assetImport.importTheFilesThePersonChooses("/projects/lobby", SAM);

  expect(dialogsOpenedAt).toEqual(["/home/sam"]);
  expect(importsAsked).toEqual([
    { projectDirectory: "/projects/lobby", source: "/home/sam/Pictures/poster.png", assetPath: null, author: SAM },
    { projectDirectory: "/projects/lobby", source: "/home/sam/notes.txt", assetPath: null, author: SAM },
    { projectDirectory: "/projects/lobby", source: "/home/sam/Movies/intro.mp4", assetPath: null, author: SAM },
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
  const { assetImport, importsAsked } = importingFilesTheDialogAnswers(null);

  expect(await assetImport.importTheFilesThePersonChooses("/projects/lobby", SAM)).toEqual(succeeded(null));
  expect(importsAsked).toEqual([]);
});
