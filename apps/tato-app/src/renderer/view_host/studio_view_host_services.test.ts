import { expect, test } from "vitest";
import type { OpenProjectReading, ProjectAssetsImported } from "../../shared/tatolab_backend_contract";
import { changeAnAssetOfTheOpenProjectForAView, importAssetsIntoTheOpenProjectForAView } from "./studio_view_host_services";

const GALLERY_WALL_OPEN: OpenProjectReading = {
  kind: "read",
  open_project: { project: { folder: "/projects/gallery-wall", project: "a-uuid", name: "Gallery Wall" }, imports: [], imports_not_listed_because: null },
};

function anAssetImportAnswering(answer: () => Promise<ProjectAssetsImported | null>) {
  let importsAsked = 0;
  const projectsListedAgain: string[] = [];
  const assetImportSources = {
    readTheOpenProject: () => GALLERY_WALL_OPEN,
    backend: {
      importAssetsIntoTheOpenProject: () => {
        importsAsked += 1;
        return answer();
      },
    },
    listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder),
  };
  return { assetImportSources, importsAskedSoFar: () => importsAsked, projectsListedAgain };
}

test("a view imports into the window's open project, whose assets are listed again at once", async () => {
  const assetsImported: ProjectAssetsImported = { imported: [{ asset: "b-uuid", path: "media/intro.mp4" }], refused: [] };
  const { assetImportSources, importsAskedSoFar, projectsListedAgain } = anAssetImportAnswering(async () => assetsImported);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", assetImportSources)).toEqual({ kind: "imported", assets_imported: assetsImported });
  expect(importsAskedSoFar()).toBe(1);
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
});

test("choosing nothing is answered as nothing chosen, and a rejection in its own words", async () => {
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", anAssetImportAnswering(async () => null).assetImportSources)).toEqual({ kind: "nothing_chosen" });
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", anAssetImportAnswering(() => Promise.reject("No runtime answers.")).assetImportSources)).toEqual({
    kind: "not_imported",
    because: "No runtime answers.",
  });
});

test("a folder that is not the window's open project is refused in Studio's words, with nothing asked of the backend", async () => {
  const { assetImportSources, importsAskedSoFar } = anAssetImportAnswering(async () => null);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/elsewhere", assetImportSources)).toEqual({
    kind: "not_imported",
    because: "Tato Studio imports assets into this window's project only, not /projects/elsewhere.",
  });
  expect(importsAskedSoFar()).toBe(0);
});

test("a view's rename, move or delete of an asset changes the window's open project, listed again at once, a rejection in its own words, and any other folder refused with nothing asked", async () => {
  const projectsListedAgain: string[] = [];
  let changesAsked = 0;
  const assetChangeSources = { readTheOpenProject: () => GALLERY_WALL_OPEN, listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder) };
  const changeAnswering = (answer: () => Promise<void>) => () => {
    changesAsked += 1;
    return answer();
  };

  expect(await changeAnAssetOfTheOpenProjectForAView("/projects/gallery-wall", assetChangeSources, changeAnswering(async () => undefined))).toEqual({ kind: "changed" });
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
  expect(await changeAnAssetOfTheOpenProjectForAView("/projects/gallery-wall", assetChangeSources, changeAnswering(() => Promise.reject("delete_asset failed: the project holds no asset b-uuid")))).toEqual({
    kind: "not_changed",
    because: "delete_asset failed: the project holds no asset b-uuid",
  });
  expect(await changeAnAssetOfTheOpenProjectForAView("/projects/elsewhere", assetChangeSources, changeAnswering(async () => undefined))).toEqual({
    kind: "not_changed",
    because: "Tato Studio changes the assets of this window's project only, not /projects/elsewhere.",
  });
  expect(changesAsked).toBe(2);
});
