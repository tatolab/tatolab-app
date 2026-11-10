import { expect, test } from "vitest";
import type { OpenProjectReading, ProjectAssetsImported } from "../../shared/tatolab_backend_contract";
import { importAssetsIntoTheOpenProjectForAView } from "./studio_view_host_services";

const GALLERY_WALL_OPEN: OpenProjectReading = {
  kind: "read",
  open_project: { project: { folder: "/projects/gallery-wall", project: "a-uuid", name: "Gallery Wall" }, imports: [], imports_not_listed_because: null },
};

function anAssetImportAnswering(answer: () => Promise<ProjectAssetsImported | null>) {
  const foldersAsked: string[] = [];
  const projectsListedAgain: string[] = [];
  const assetImportSources = {
    readTheOpenProject: () => GALLERY_WALL_OPEN,
    backend: {
      importAssetsIntoTheOpenProject: (intoFolder: string) => {
        foldersAsked.push(intoFolder);
        return answer();
      },
    },
    listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder),
  };
  return { assetImportSources, foldersAsked, projectsListedAgain };
}

test("a view imports into the window's open project, whose assets are listed again at once", async () => {
  const assetsImported: ProjectAssetsImported = { imported: [{ asset: "b-uuid", path: "media/intro.mp4" }], refused: [] };
  const { assetImportSources, foldersAsked, projectsListedAgain } = anAssetImportAnswering(async () => assetsImported);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", "media", assetImportSources)).toEqual({ kind: "imported", assets_imported: assetsImported });
  expect(foldersAsked).toEqual(["media"]);
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
});

test("choosing nothing is answered as nothing chosen, and a rejection in its own words", async () => {
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", "", anAssetImportAnswering(async () => null).assetImportSources)).toEqual({ kind: "nothing_chosen" });
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", "", anAssetImportAnswering(() => Promise.reject("No runtime answers.")).assetImportSources)).toEqual({
    kind: "not_imported",
    because: "No runtime answers.",
  });
});

test("a folder that is not the window's open project is refused in Studio's words, with nothing asked of the backend", async () => {
  const { assetImportSources, foldersAsked } = anAssetImportAnswering(async () => null);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/elsewhere", "media", assetImportSources)).toEqual({
    kind: "not_imported",
    because: "Tato Studio imports assets into this window's project only, not /projects/elsewhere.",
  });
  expect(foldersAsked).toEqual([]);
});
