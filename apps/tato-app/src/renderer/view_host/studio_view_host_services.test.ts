import { expect, test } from "vitest";
import type { ListedStream, OpenProjectReading, ProjectAssetsImported } from "../../shared/tatolab_backend_contract";
import type { ListedStreamsReading } from "./studio_view_contract";
import { changeTheOpenProjectForAView, importAssetsIntoTheOpenProjectForAView, readAnAssetPreviewOfTheOpenProjectForAView, recoverTheOpenProjectsStreamsForAView } from "./studio_view_host_services";

const GALLERY_WALL_OPEN: OpenProjectReading = {
  kind: "read",
  open_project: { project: { folder: "/projects/gallery-wall", project: "a-uuid", name: "Gallery Wall" }, imports: [], imports_not_listed_because: null },
};

function anAssetImportAnswering(answer: () => Promise<ProjectAssetsImported | null>) {
  let importsAsked = 0;
  const mediaAsked: (readonly string[] | null)[] = [];
  const projectsListedAgain: string[] = [];
  const assetImportSources = {
    readTheOpenProject: () => GALLERY_WALL_OPEN,
    backend: {
      importAssetsIntoTheOpenProject: (media: readonly string[] | null) => {
        importsAsked += 1;
        mediaAsked.push(media);
        return answer();
      },
    },
    listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder),
  };
  return { assetImportSources, importsAskedSoFar: () => importsAsked, projectsListedAgain, mediaAsked };
}

test("a view imports into the window's open project, whose assets are listed again at once", async () => {
  const assetsImported: ProjectAssetsImported = { imported: [{ asset: "b-uuid", path: "media/intro.mp4" }], refused: [] };
  const { assetImportSources, importsAskedSoFar, projectsListedAgain, mediaAsked } = anAssetImportAnswering(async () => assetsImported);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", ["video"], assetImportSources)).toEqual({ kind: "imported", assets_imported: assetsImported });
  expect(importsAskedSoFar()).toBe(1);
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
  expect(mediaAsked).toEqual([["video"]]);
});

test("choosing nothing is answered as nothing chosen, and a rejection in its own words", async () => {
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", null, anAssetImportAnswering(async () => null).assetImportSources)).toEqual({ kind: "nothing_chosen" });
  expect(await importAssetsIntoTheOpenProjectForAView("/projects/gallery-wall", null, anAssetImportAnswering(() => Promise.reject("No runtime answers.")).assetImportSources)).toEqual({
    kind: "not_imported",
    because: "No runtime answers.",
  });
});

test("a folder that is not the window's open project is refused in Studio's words, with nothing asked of the backend", async () => {
  const { assetImportSources, importsAskedSoFar } = anAssetImportAnswering(async () => null);

  expect(await importAssetsIntoTheOpenProjectForAView("/projects/elsewhere", null, assetImportSources)).toEqual({
    kind: "not_imported",
    because: "Tato Studio imports assets into this window's project only, not /projects/elsewhere.",
  });
  expect(importsAskedSoFar()).toBe(0);
});

test("a view's rename, move or delete of an asset changes the window's open project, listed again at once, a rejection in its own words, and any other folder refused with nothing asked", async () => {
  const projectsListedAgain: string[] = [];
  let changesAsked = 0;
  const assetChangeSources = { readTheOpenProject: () => GALLERY_WALL_OPEN, whatChanges: "assets" as const, listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder) };
  const changeAnswering = (answer: () => Promise<void>) => () => {
    changesAsked += 1;
    return answer();
  };

  expect(await changeTheOpenProjectForAView("/projects/gallery-wall", assetChangeSources, changeAnswering(async () => undefined))).toEqual({ kind: "changed" });
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
  expect(await changeTheOpenProjectForAView("/projects/gallery-wall", assetChangeSources, changeAnswering(() => Promise.reject("delete_asset failed: the project holds no asset b-uuid")))).toEqual({
    kind: "not_changed",
    because: "delete_asset failed: the project holds no asset b-uuid",
  });
  expect(await changeTheOpenProjectForAView("/projects/elsewhere", assetChangeSources, changeAnswering(async () => undefined))).toEqual({
    kind: "not_changed",
    because: "Tato Studio changes the assets of this window's project only, not /projects/elsewhere.",
  });
  expect(changesAsked).toBe(2);
});

test("a view's change to a node type's group on the window's open project lists that project's node types again at once", async () => {
  const projectsListedAgain: string[] = [];
  const nodeTypeGroupChangeSources = { readTheOpenProject: () => GALLERY_WALL_OPEN, whatChanges: "node type groups" as const, listTheProjectAgainNow: (projectFolder: string) => projectsListedAgain.push(projectFolder) };
  expect(await changeTheOpenProjectForAView("/projects/gallery-wall", nodeTypeGroupChangeSources, async () => undefined)).toEqual({ kind: "changed" });
  expect(projectsListedAgain).toEqual(["/projects/gallery-wall"]);
});

test("a view's change to a node type's group refuses any other folder in words that name the node type groups, nothing asked", async () => {
  let changesAsked = 0;
  const nodeTypeGroupChangeSources = { readTheOpenProject: () => GALLERY_WALL_OPEN, whatChanges: "node type groups" as const, listTheProjectAgainNow: () => undefined };
  expect(
    await changeTheOpenProjectForAView("/projects/elsewhere", nodeTypeGroupChangeSources, async () => {
      changesAsked += 1;
    }),
  ).toEqual({ kind: "not_changed", because: "Tato Studio changes the node type groups of this window's project only, not /projects/elsewhere." });
  expect(changesAsked).toBe(0);
});

test("a view reads an asset's preview picture of the window's open project, a rejection in its own words, and any other folder refused with nothing asked", async () => {
  const picture = {
    picture_url: "data:image/png;base64,iVBORw0KGgo=",
    pixel_width: 512,
    pixel_height: 320,
  };
  let readsAsked = 0;
  const readAnswering = (answer: () => Promise<typeof picture>) => () => {
    readsAsked += 1;
    return answer();
  };

  expect(
    await readAnAssetPreviewOfTheOpenProjectForAView(
      "/projects/gallery-wall",
      () => GALLERY_WALL_OPEN,
      readAnswering(async () => picture),
    ),
  ).toEqual({ kind: "read", picture });
  expect(
    await readAnAssetPreviewOfTheOpenProjectForAView(
      "/projects/gallery-wall",
      () => GALLERY_WALL_OPEN,
      readAnswering(() => Promise.reject("read_asset_preview failed: no file is at asset b-uuid's path")),
    ),
  ).toEqual({
    kind: "not_read",
    because: "read_asset_preview failed: no file is at asset b-uuid's path",
  });
  expect(
    await readAnAssetPreviewOfTheOpenProjectForAView(
      "/projects/elsewhere",
      () => GALLERY_WALL_OPEN,
      readAnswering(async () => picture),
    ),
  ).toEqual({
    kind: "not_read",
    because: "Tato Studio reads the assets of this window's project only, not /projects/elsewhere.",
  });
  expect(readsAsked).toBe(2);
});

/** Gallery Wall's main stream, playing or held stopped. */
function galleryWallMain(playback: "playing" | "stopped"): ListedStream {
  return {
    stream: "gallery-wall-main-1a2b3c",
    display_name: "main",
    location: { project_directory: "/projects/gallery-wall", project: "a-uuid", stream_asset: "s-uuid" },
    state: playback === "playing" ? "running" : "failed",
    node_count: 2,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    condition: { load: "loaded", playback, health: playback === "playing" ? "healthy" : "failed", diagnostics: [] },
    action: null,
    step: null,
  };
}

/** A backend recording each project action asked of it, in order, each answered by `answerOf`. */
function aProjectRecoveryRecording(answerOf: (action: string) => Promise<void> = async () => undefined, playback: "playing" | "stopped" = "playing") {
  const asked: string[] = [];
  const record = (action: string) => {
    asked.push(action);
    return answerOf(action);
  };
  const sources = {
    readTheOpenProject: () => GALLERY_WALL_OPEN,
    readTheListedStreams: (): ListedStreamsReading => ({ kind: "listed", streams: [galleryWallMain(playback)] }),
    backend: { stopOpenProject: () => record("stop"), runOpenProject: () => record("run"), reloadProject: (projectFolder: string) => record(`reload ${projectFolder}`).then(() => ({ action: "action-1", project_directory: projectFolder })) },
  };
  return { sources, asked };
}

test("a view restarts the open project's playback by stopping it while it plays and then running it, and reloads it by its folder", async () => {
  const restarting = aProjectRecoveryRecording();
  expect(await recoverTheOpenProjectsStreamsForAView("/projects/gallery-wall", "restart_the_playback", restarting.sources)).toEqual({ kind: "asked" });
  expect(restarting.asked).toEqual(["stop", "run"]);
  const startRefused = aProjectRecoveryRecording(async () => undefined, "stopped");
  expect(await recoverTheOpenProjectsStreamsForAView("/projects/gallery-wall", "restart_the_playback", startRefused.sources)).toEqual({ kind: "asked" });
  expect(startRefused.asked).toEqual(["run"]);
  const reloading = aProjectRecoveryRecording();
  expect(await recoverTheOpenProjectsStreamsForAView("/projects/gallery-wall", "reload_the_project", reloading.sources)).toEqual({ kind: "asked" });
  expect(reloading.asked).toEqual(["reload /projects/gallery-wall"]);
});

test("a stop the runtime refuses runs nothing after it and answers in the runtime's words, and another project's folder asks nothing", async () => {
  const refusedStop = aProjectRecoveryRecording((action) => (action === "stop" ? Promise.reject(new Error("no runtime answers")) : Promise.resolve()));
  expect(await recoverTheOpenProjectsStreamsForAView("/projects/gallery-wall", "restart_the_playback", refusedStop.sources)).toEqual({ kind: "not_asked", because: "no runtime answers" });
  expect(refusedStop.asked).toEqual(["stop"]);
  const elsewhere = aProjectRecoveryRecording();
  expect(await recoverTheOpenProjectsStreamsForAView("/projects/another", "reload_the_project", elsewhere.sources)).toEqual({ kind: "not_asked", because: "Tato Studio recovers the streams of this window's project only, not /projects/another." });
  expect(elsewhere.asked).toEqual([]);
});
