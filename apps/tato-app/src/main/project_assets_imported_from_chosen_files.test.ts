import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import type { ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure } from "./local_api_client.js";
import { assetFolderRefusal, ProjectAssetsImportedFromChosenFiles } from "./project_assets_imported_from_chosen_files.js";
import { succeeded } from "./result.js";

const SAM: ProjectTransactionAuthor = { kind: "person", name: "sam" };

async function aProjectHoldingAPosterInMedia(): Promise<string> {
  const projectDirectory = await mkdtemp(path.join(os.tmpdir(), "tatolab-asset-import-"));
  await mkdir(path.join(projectDirectory, "media"));
  await writeFile(path.join(projectDirectory, "media", "poster.png"), "png");
  return projectDirectory;
}

function importingFilesTheDialogAnswers(filesTheDialogAnswers: readonly string[] | null) {
  const importsAsked: { projectDirectory: string; source: string; assetPath: string; author: ProjectTransactionAuthor | null }[] = [];
  const dialogsOpenedAt: string[] = [];
  const assetImport = new ProjectAssetsImportedFromChosenFiles({
    homeDirectory: "/home/sam",
    projectAssetFilesDialog: async (defaultFolder) => {
      dialogsOpenedAt.push(defaultFolder);
      return succeeded(filesTheDialogAnswers);
    },
    importAsset: async (projectDirectory, source, assetPath, author) => {
      importsAsked.push({ projectDirectory, source, assetPath, author });
      if (source.endsWith("notes.txt")) return localApiRequestFailure("import_asset failed: a stream is never imported");
      return succeeded({ asset: `uuid-of-${assetPath}`, path: assetPath });
    },
  });
  return { assetImport, importsAsked, dialogsOpenedAt };
}

test("each chosen file goes into the folder under its own name, numbered past a file already there, by the person, one refusal leaving the rest to import", async () => {
  const projectDirectory = await aProjectHoldingAPosterInMedia();
  const { assetImport, importsAsked, dialogsOpenedAt } = importingFilesTheDialogAnswers(["/home/sam/Pictures/poster.png", "/home/sam/notes.txt", "/home/sam/Movies/intro.mp4"]);

  const imported = await assetImport.importTheFilesThePersonChooses(projectDirectory, "media", SAM);

  expect(dialogsOpenedAt).toEqual(["/home/sam"]);
  expect(importsAsked).toEqual([
    { projectDirectory, source: "/home/sam/Pictures/poster.png", assetPath: "media/poster 2.png", author: SAM },
    { projectDirectory, source: "/home/sam/notes.txt", assetPath: "media/notes.txt", author: SAM },
    { projectDirectory, source: "/home/sam/Movies/intro.mp4", assetPath: "media/intro.mp4", author: SAM },
  ]);
  expect(imported).toEqual(
    succeeded({
      imported: [
        { asset: "uuid-of-media/poster 2.png", path: "media/poster 2.png" },
        { asset: "uuid-of-media/intro.mp4", path: "media/intro.mp4" },
      ],
      refused: [{ file_name: "notes.txt", because: "import_asset failed: a stream is never imported" }],
    }),
  );
});

test("a file imported at the project's top sits under its own name there", async () => {
  const projectDirectory = await aProjectHoldingAPosterInMedia();
  const { assetImport, importsAsked } = importingFilesTheDialogAnswers(["/home/sam/poster.png"]);

  await assetImport.importTheFilesThePersonChooses(projectDirectory, "", SAM);

  expect(importsAsked.map((importAsked) => importAsked.assetPath)).toEqual(["poster.png"]);
});

test("choosing nothing imports nothing", async () => {
  const { assetImport, importsAsked } = importingFilesTheDialogAnswers(null);

  expect(await assetImport.importTheFilesThePersonChooses("/projects/lobby", "media", SAM)).toEqual(succeeded(null));
  expect(importsAsked).toEqual([]);
});

test("a folder outside the project is refused before the dialog opens", async () => {
  const { assetImport, dialogsOpenedAt } = importingFilesTheDialogAnswers(["/home/sam/poster.png"]);

  expect(await assetImport.importTheFilesThePersonChooses("/projects/lobby", "../elsewhere", SAM)).toEqual({ ok: false, failure: "../elsewhere is not a folder inside the project." });
  expect(dialogsOpenedAt).toEqual([]);
  expect([assetFolderRefusal(""), assetFolderRefusal("media/stills"), assetFolderRefusal("/media"), assetFolderRefusal("media//stills"), assetFolderRefusal("media\\stills")]).toEqual([
    null,
    null,
    "/media is not a folder inside the project.",
    "media//stills is not a folder inside the project.",
    "media\\stills is not a folder inside the project.",
  ]);
});
