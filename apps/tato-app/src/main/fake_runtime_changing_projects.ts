// The Projects window's project opening over a fake runtime that changes projects on disk, scripted dialogs, recent projects in memory, studio windows
// that each read their project and a clock the test runs, for the tests of opening, removing and deleting projects.

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Clock, Duration, Effect, Layer, ManagedRuntime } from "effect";
import { expect } from "vitest";
import type { OpenProjectReading, ProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import {
  chooseNewProjectLocation,
  chooseProjectArchiveToImport,
  chooseProjectCoverImage,
  chooseProjectFolder,
  createNewProject,
  deleteRecentProject,
  duplicateRecentProject,
  importProjectArchive,
  makeAProjectOfItsOwnFromTheArchive,
  OPEN_PROJECT_REREAD_QUIET_MS,
  openRecentProject,
  OpenProjectOfAStudioWindow,
  readNewProjectDefaults,
  readRecentProjectCover,
  readRecentProjects,
  removeRecentProject,
  renameRecentProject,
  setRecentProjectCover,
  setRecentProjectDescription,
  type ProjectFolderDialogPurpose,
  type ProjectReadingsOfTheRuntime,
  type RecentProjectFolderOpened,
} from "./open_project.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { ProjectDialogs, RecentProjects, StatusRounds, StudioWindows, ThisMachinesFolders } from "./studio_runtime.js";
import { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";


const foldersMade: string[] = [];
const localApisStarted: FakeLocalApiServer[] = [];
const runtimesMade: Array<ManagedRuntime.ManagedRuntime<never, never>> = [];

/** Every fake local API started and folder made since the last call closed and removed; a test file runs it after each test. */
export async function closeAndRemoveWhatTheTestMade(): Promise<void> {
  for (const runtimeMade of runtimesMade.splice(0)) await runtimeMade.dispose();
  for (const localApi of localApisStarted.splice(0)) await localApi.close();
  for (const folder of foldersMade.splice(0)) await rm(folder, { recursive: true, force: true });
}

/** `localApi` closed by `closeAndRemoveWhatTheTestMade`. */
export function closeAfterTheTest(localApi: FakeLocalApiServer): void {
  localApisStarted.push(localApi);
}

export async function aFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-open-project-")));
  foldersMade.push(folder);
  return folder;
}

/** Writes the `tatolab-project.json` the fake runtime names a project by, with the description and last edit, in seconds, its `list_assets` serves. */
export async function writeAProject(folder: string, name: string, cardFacts: { description?: string; edited_at_seconds?: number } = {}): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "tatolab-project.json"), JSON.stringify({ project: `uuid-of-${name}`, name, ...cardFacts }));
}

/** A fake `tatolab-project.json`: the project's settings, and the path of each media asset it holds, by its UUID. */
interface FakeProjectFile {
  project: string;
  name: string;
  description?: string;
  edited_at_seconds?: number;
  cover?: string;
  asset_paths?: Record<string, string>;
}

export async function readAProjectFile(folder: string): Promise<FakeProjectFile | null> {
  try {
    const projectFile: unknown = JSON.parse(await readFile(path.join(folder, "tatolab-project.json"), "utf8"));
    if (typeof projectFile !== "object" || projectFile === null || !("project" in projectFile) || !("name" in projectFile)) return null;
    const description = "description" in projectFile && typeof projectFile.description === "string" ? projectFile.description : undefined;
    const editedAtSeconds = "edited_at_seconds" in projectFile && typeof projectFile.edited_at_seconds === "number" ? projectFile.edited_at_seconds : undefined;
    const cover = "cover" in projectFile && typeof projectFile.cover === "string" ? projectFile.cover : undefined;
    const assetPaths: Record<string, string> = {};
    if ("asset_paths" in projectFile && typeof projectFile.asset_paths === "object" && projectFile.asset_paths !== null) {
      for (const [asset, assetPath] of Object.entries(projectFile.asset_paths)) if (typeof assetPath === "string") assetPaths[asset] = assetPath;
    }
    return { project: String(projectFile.project), name: String(projectFile.name), description, edited_at_seconds: editedAtSeconds, cover, asset_paths: assetPaths };
  } catch {
    return null;
  }
}

export async function writeAProjectFile(folder: string, projectFile: FakeProjectFile): Promise<void> {
  await writeFile(path.join(folder, "tatolab-project.json"), JSON.stringify(projectFile));
}

/** The words of a `.zip` the fake runtime's `import_project` refuses, as the real one does a zip holding no project. */
export const THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT = "import_project failed: the zip holds no tatolab-project.json";

/** One answer the fake runtime's `describe_stream_action` gives a deletion: the deletion in a state, or the action no longer held, in the runtime's words. */
export type FakeDeletionState = { readonly state: string; readonly failedBecause: string | null } | { readonly notHeld: string };

/** The deletion as `describe_stream_action` describes it in `state`. */
export function aDeletionIn(state: string, failedBecause: string | null = null): FakeDeletionState {
  return { state, failedBecause };
}

/** A stream the fake runtime's `list_streams` lists: the project it is of, by its folder, and its state. */
export interface FakeListedStream {
  readonly projectDirectory: string;
  readonly state: string;
}

/** A UUID drawn from `seed`, the same each time, as the runtime's UUIDs are written. */
function aUuidOf(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** `listed` as the runtime's `list_streams` lists each, named after its project's folder. */
function listedStreamsOnTheWire(listed: readonly FakeListedStream[]) {
  return listed.map(({ projectDirectory, state }, index) => ({
    stream: `${path.basename(projectDirectory)}-main-${index}`,
    display_name: path.basename(projectDirectory),
    location: { project_directory: projectDirectory, project: aUuidOf(`project ${projectDirectory}`), stream_asset: aUuidOf(`main stream ${index}`) },
    state,
    node_count: state === "closed" ? null : 1,
    failed_because: state === "failed" ? "uv sync failed" : null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  }));
}

export function refusalOfAFolderHoldingNoProject(folder: string): string {
  return `list_assets failed: ${folder} holds no project: it has no tatolab-project.json`;
}

/** A text param of a control operation the fake runtime answers; empty when the call sent none. */
function textParam(params: Readonly<Record<string, unknown>>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

/** A media asset of a fake project as the runtime's answers carry it. */
function mediaAssetOnTheWire(asset: string, assetPath: string) {
  return { asset, kind: "media", path: assetPath, content_sha256: createHash("sha256").update(assetPath).digest("hex"), content_byte_len: 4, import_settings: {} };
}

/** The settings of a fake project as `rename_project`, `set_project_description` and `set_project_cover` answer them, one transaction after. */
function projectSettingsOnTheWire(projectFile: FakeProjectFile) {
  return {
    project: projectFile.project,
    project_name: projectFile.name,
    project_description: projectFile.description ?? null,
    project_cover: projectFile.cover ?? null,
    transaction: "962411a9-8412-4a8e-8355-a306e9f792da",
    commit: "3944af651383c79ae7e8abb2330c6fb85dfa9c6f",
  };
}

/**
 * A runtime behind a fake local API that changes projects on disk as its project operations do: `create_project` writes a project named `fresh`, `rename_project`
 * rewrites the name, `duplicate_project` copies the folder under a new UUID and `<name> copy`, `import_project` unpacks a fake `.zip` (a JSON file naming the
 * project), `delete_project` and `remove_project` each queue an action that walks the states `deletionStates` gives, the folder gone once a deletion reaches
 * `done` and a removal's streams forgotten once it does, `open_project` and `reload_project` record the project, the open refused in `openRefusal` when given.
 * It lists the streams `listedStreams` gives, none when it gives none, so every project it is asked about is closed.
 */
async function aFakeRuntimeChangingProjects(options: { deletionStates: readonly FakeDeletionState[]; listedStreams?: readonly FakeListedStream[]; openRefusal?: string; creationRefusal?: string }) {
  const deletionsQueued: string[] = [];
  const removalsQueued: string[] = [];
  const projectsReloaded: string[] = [];
  let listedStreams = options.listedStreams ?? [];
  let removalQueuedLast: { kind: "delete" | "remove"; projectDirectory: string } | null = null;
  const assetsImported: Array<{ projectDirectory: string; source: string; assetPath: string }> = [];
  const projectsOpened: string[] = [];
  const projectDirectoriesCreated: string[] = [];
  let describedDeletions = 0;
  const deletionStatesLeft = [...options.deletionStates];
  const refused = (words: string) => controlOperationFailedResponse(words);
  const answered = (result: unknown) => controlOperationResultResponse(result);
  const localApi = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    const projectDirectory = textParam(params, "project_directory");
    switch (method) {
      case "list_streams":
        return answered({ streams: listedStreamsOnTheWire(listedStreams) });
      case "reload_project":
        projectsReloaded.push(projectDirectory);
        return answered({ action: `reload-${projectsReloaded.length}`, project_directory: projectDirectory });
      case "remove_project":
        if (!listedStreams.some((listed) => listed.projectDirectory === projectDirectory)) return refused(`remove_project failed: this runtime holds no stream of the project in ${projectDirectory}`);
        removalsQueued.push(projectDirectory);
        removalQueuedLast = { kind: "remove", projectDirectory };
        return answered({ action: `removal-${removalsQueued.length}`, project_directory: projectDirectory });
      case "open_project":
        if (options.openRefusal !== undefined) return refused(options.openRefusal);
        projectsOpened.push(projectDirectory);
        return answered({ action: `open-${projectsOpened.length}`, project_directory: projectDirectory });
      case "create_project":
        if (options.creationRefusal !== undefined) return refused(options.creationRefusal);
        projectDirectoriesCreated.push(projectDirectory);
        await writeAProject(projectDirectory, "fresh");
        return answered({ action: "action-1", stream: "fresh-main-0a1b2c", project_directory: projectDirectory });
      case "list_assets": {
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        return answered({
          project_directory: projectDirectory,
          project: projectFile.project,
          project_name: projectFile.name,
          project_description: projectFile.description ?? null,
          project_cover: projectFile.cover ?? null,
          project_last_edited_at: projectFile.edited_at_seconds ?? null,
          assets: Object.entries(projectFile.asset_paths ?? {}).map(([asset, assetPath]) => mediaAssetOnTheWire(asset, assetPath)),
          transactions_resource_uri: `streamlib://project/${projectFile.project}/transactions`,
        });
      }
      case "set_project_description": {
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        const description = params["description"];
        const described = { ...projectFile, description: typeof description === "string" ? description : undefined };
        await writeAProjectFile(projectDirectory, described);
        return answered(projectSettingsOnTheWire(described));
      }
      case "set_project_cover": {
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        const cover = params["cover"];
        if (typeof cover === "string" && projectFile.asset_paths?.[cover] === undefined) return refused(`set_project_cover failed: the project holds no asset ${cover}`);
        const covered = { ...projectFile, cover: typeof cover === "string" ? cover : undefined };
        await writeAProjectFile(projectDirectory, covered);
        return answered(projectSettingsOnTheWire(covered));
      }
      case "rename_project": {
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        const renamed = { ...projectFile, name: textParam(params, "name") };
        await writeAProjectFile(projectDirectory, renamed);
        return answered(projectSettingsOnTheWire(renamed));
      }
      case "import_asset": {
        const source = textParam(params, "source");
        const assetPath = textParam(params, "asset_path") || `media/${path.basename(source)}`;
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        if (Object.values(projectFile.asset_paths ?? {}).includes(assetPath)) return refused(`import_asset failed: the project already holds ${assetPath}`);
        await mkdir(path.dirname(path.join(projectDirectory, assetPath)), { recursive: true });
        await cp(source, path.join(projectDirectory, assetPath));
        const asset = `uuid-of-asset-${assetPath}`;
        assetsImported.push({ projectDirectory, source, assetPath });
        await writeAProjectFile(projectDirectory, { ...projectFile, asset_paths: { ...projectFile.asset_paths, [asset]: assetPath } });
        return answered({ asset: mediaAssetOnTheWire(asset, assetPath), transaction: "cd368349-3674-4f92-bab2-beb5c88f016e", commit: "e769184546f290d9ed91d980de2769655a52df9d" });
      }
      case "read_project_file": {
        const filePath = textParam(params, "path");
        try {
          const fileBytes = await readFile(path.join(projectDirectory, filePath));
          return answered({ path: filePath, byte_len: fileBytes.byteLength, content_base64: fileBytes.toString("base64"), content_sha256: createHash("sha256").update(fileBytes).digest("hex") });
        } catch {
          return refused(`read_project_file failed: ${projectDirectory} holds no ${filePath}`);
        }
      }
      case "duplicate_project": {
        const into = textParam(params, "into");
        const projectFile = await readAProjectFile(projectDirectory);
        if (projectFile === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        await cp(projectDirectory, into, { recursive: true, errorOnExist: true, force: false });
        const duplicate = { ...projectFile, project: `uuid-of-a-copy-of-${projectFile.name}`, name: `${projectFile.name} copy` };
        await writeAProjectFile(into, duplicate);
        return answered({ project_directory: into, project: duplicate.project, project_name: duplicate.name, commit: "40e1abfe0ba2c20dccda36018687868770cf258d" });
      }
      case "delete_project":
        if ((await readAProjectFile(projectDirectory)) === null) return refused(refusalOfAFolderHoldingNoProject(projectDirectory));
        deletionsQueued.push(projectDirectory);
        removalQueuedLast = { kind: "delete", projectDirectory };
        return answered({ action: `deletion-${deletionsQueued.length}`, project_directory: projectDirectory });
      case "describe_stream_action": {
        describedDeletions += 1;
        const action = textParam(params, "action");
        const followed = deletionStatesLeft.length > 1 ? deletionStatesLeft.shift() : deletionStatesLeft[0];
        if (removalQueuedLast === null || followed === undefined) return refused(`no state scripted for ${action}`);
        if ("notHeld" in followed) return refused(followed.notHeld);
        const { kind, projectDirectory: removedFolder } = removalQueuedLast;
        if (followed.state === "done") {
          listedStreams = listedStreams.filter((listed) => listed.projectDirectory !== removedFolder);
          if (kind === "delete") await rm(removedFolder, { recursive: true, force: true });
        }
        return answered({ action, project_directory: removedFolder, kind, state: followed.state, step: null, streams: [], failed_because: followed.failedBecause });
      }
      case "import_project": {
        const archive: unknown = JSON.parse(await readFile(textParam(params, "source"), "utf8"));
        if (typeof archive !== "object" || archive === null || !("name" in archive)) return refused(THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT);
        await writeAProject(projectDirectory, String(archive.name));
        return answered({ project_directory: projectDirectory, project: `uuid-of-${String(archive.name)}`, name: String(archive.name), commit: "6e9bf712f50159cf8b93aa40a7e366eab060e352" });
      }
      default:
        return refused(`the fake runtime answers no ${method}`);
    }
  });
  localApisStarted.push(localApi);
  return { localApi, deletionsQueued, removalsQueued, projectsReloaded, assetsImported, projectsOpened, projectDirectoriesCreated, describedDeletions: () => describedDeletions };
}

/** A runtime that names a project from its folder's `tatolab-project.json`, as `list_assets` does, and lists the imports in `importFolders()`, or answers none. */
export function aFakeRuntime(importFolders: () => readonly string[] | null): ProjectReadingsOfTheRuntime {
  return {
    nameTheProject: async (projectFolder) => {
      try {
        const projectFile: unknown = JSON.parse(await readFile(path.join(projectFolder, "tatolab-project.json"), "utf8"));
        if (typeof projectFile !== "object" || projectFile === null || !("project" in projectFile) || !("name" in projectFile)) return failedWith("not a project file");
        return succeeded({ folder: projectFolder, project: String(projectFile.project), name: String(projectFile.name) });
      } catch {
        return failedWith(refusalOfAFolderHoldingNoProject(projectFolder));
      }
    },
    listTheDependencies: async () => {
      const folders = importFolders();
      if (folders === null) return failedWith("no runtime answers at /tmp/local-api.sock");
      return succeeded(
        folders.map((folder) => ({
          dependency: { project: `uuid-of-${folder}`, folder, source: `/shows/${folder}`, version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82" },
          edited_files: [],
          newer_version_exists: null,
          check_refused_because: null,
        })),
      );
    },
  };
}

/**
 * A clock the test sets: a wall clock it moves by hand, and a monotonic clock that only a sleep moves, by the whole sleep at once, each sleep recorded, so
 * following a deletion for its longest wait takes no time.
 */
function aClockTheTestRuns() {
  let wallClockNowMs = 1_790_000_000_000;
  let monotonicClockMs = 0;
  const sleepsMs: number[] = [];
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => wallClockNowMs,
    currentTimeMillis: Effect.sync(() => wallClockNowMs),
    currentTimeNanosUnsafe: () => BigInt(wallClockNowMs) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(wallClockNowMs) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(monotonicClockMs) * 1_000_000n,
    monotonicTimeNanos: Effect.sync(() => BigInt(monotonicClockMs) * 1_000_000n),
    sleep: (duration) =>
      Effect.sync(() => {
        const sleptMs = Duration.toMillis(duration);
        sleepsMs.push(sleptMs);
        monotonicClockMs += sleptMs;
      }),
  };
  return {
    clock,
    sleepsMs,
    setTheWallClock: (nowMs: number) => {
      wallClockNowMs = nowMs;
    },
  };
}

/** The clock Effect runs on outside a test's clock, which the calls to the runtime keep, so their time limits pass in real time. */
const LIVE_CLOCK = Effect.runSync(Effect.clockWith(Effect.succeed));

/** `RuntimeControl` over the fake local API at `localApiSocketPath`, its calls timed by the live clock whatever clock the caller runs on. */
function runtimeControlOnTheLiveClock(localApiSocketPath: string): Layer.Layer<RuntimeControl> {
  return Layer.effect(
    RuntimeControl,
    Effect.gen(function* () {
      const runtimeControl = yield* RuntimeControl;
      return {
        call: (method, params) => runtimeControl.call(method, params).pipe(Effect.provideService(Clock.Clock, LIVE_CLOCK)),
        discover: runtimeControl.discover.pipe(Effect.provideService(Clock.Clock, LIVE_CLOCK)),
        get: (requestTarget) => runtimeControl.get(requestTarget).pipe(Effect.provideService(Clock.Clock, LIVE_CLOCK)),
        connect: runtimeControl.connect.pipe(Effect.provideService(Clock.Clock, LIVE_CLOCK)),
      };
    }),
  ).pipe(Layer.provide(runtimeControlLayer(localApiSocketPath, 2_000)));
}

/** The services the Projects window's project opening runs on. */
type ProjectOpeningServices = RuntimeControl | ThisMachinesFolders | ProjectDialogs | RecentProjects | StudioWindows | StatusRounds;

/**
 * The Projects window's project opening over scripted dialogs, a Documents folder of its own, recent projects in memory, a clock the test runs, a fake runtime
 * that changes projects on disk, studio windows that each read their project, watches the test fires by hand, and timers it runs by hand.
 */
export async function anOpenProject(options: {
  dialogAnswers: string | null;
  archiveDialogAnswers?: string | null;
  coverImageDialogAnswers?: string | null;
  recentFolders?: RecentProjectFolderOpened[];
  creationRefusal?: string;
  deletionStates?: readonly FakeDeletionState[];
  listedStreams?: readonly FakeListedStream[];
  startRefusal?: string;
}) {
  const sentReadings: OpenProjectReading[] = [];
  const dialogsAsked: Array<{ purpose: ProjectFolderDialogPurpose; defaultFolder: string }> = [];
  const documentsDirectory = path.join(await aFolder(), "Documents");
  const watchedFolders = new Map<string, () => void>();
  let importFoldersTheRuntimeLists: string[] = [];
  const fakeRuntime = aFakeRuntime(() => importFoldersTheRuntimeLists);
  const pendingTimers: Array<() => void> = [];
  let recentFolders = options.recentFolders ?? [];
  let projectOpenedLast: OpenProjectOfAStudioWindow | null = null;
  const studioWindowsClosed: string[] = [];
  const archiveDialogsAsked: string[] = [];
  const coverImageDialogsAsked: string[] = [];
  const { clock, sleepsMs, setTheWallClock } = aClockTheTestRuns();
  const runtime = await aFakeRuntimeChangingProjects({
    deletionStates: options.deletionStates ?? [],
    ...(options.listedStreams === undefined ? {} : { listedStreams: options.listedStreams }),
    ...(options.startRefusal === undefined ? {} : { openRefusal: options.startRefusal }),
    ...(options.creationRefusal === undefined ? {} : { creationRefusal: options.creationRefusal }),
  });
  const homeDirectory = await aFolder();
  const projectOpeningServices: Layer.Layer<ProjectOpeningServices> = Layer.mergeAll(
    runtimeControlOnTheLiveClock(runtime.localApi.localApiSocketPath),
    Layer.succeed(ThisMachinesFolders, { homeDirectory, documentsDirectory }),
    Layer.mock(ProjectDialogs, {
      chooseAProjectFolder: (purpose, defaultFolder) =>
        Effect.sync(() => {
          dialogsAsked.push({ purpose, defaultFolder });
          return options.dialogAnswers;
        }),
      chooseAProjectArchive: (defaultFolder) =>
        Effect.sync(() => {
          archiveDialogsAsked.push(defaultFolder);
          return options.archiveDialogAnswers ?? null;
        }),
      chooseAProjectCoverImage: (defaultFolder) =>
        Effect.sync(() => {
          coverImageDialogsAsked.push(defaultFolder);
          return options.coverImageDialogAnswers ?? null;
        }),
      chooseAssetFilesToImport: () => Effect.succeed(null),
    }),
    Layer.succeed(RecentProjects, {
      readRecentFolders: Effect.sync(() => recentFolders),
      rememberOpened: (folder, openedAtWallClockMs) =>
        Effect.sync(() => {
          recentFolders = [{ folder, opened_at_wall_clock_ms: openedAtWallClockMs }, ...recentFolders.filter((recentFolder) => recentFolder.folder !== folder)];
        }),
      forget: (folder) =>
        Effect.sync(() => {
          recentFolders = recentFolders.filter((recentFolder) => recentFolder.folder !== folder);
        }),
    }),
    Layer.mock(StudioWindows, {
      aStudioWindowHoldsTheProjectIn: (folder) => projectOpenedLast?.projectFolder === folder,
      folderOfTheWindowsOpenProject: () => null,
      openedFolderOfTheStudioWindow: () => projectOpenedLast?.projectFolder ?? null,
      windowFollowingTheRuntimeOf: () => null,
      closeTheStudioWindowOf: (folder) =>
        Effect.sync(() => {
          studioWindowsClosed.push(folder);
          if (projectOpenedLast?.projectFolder !== folder) return;
          projectOpenedLast.stopWatching();
          projectOpenedLast = null;
        }),
      openTheProjectInItsStudioWindow: (folder) =>
        Effect.promise(async () => {
          if (projectOpenedLast?.projectFolder === folder) return "brought_its_studio_window_forward" as const;
          projectOpenedLast?.stopWatching();
          projectOpenedLast = new OpenProjectOfAStudioWindow(folder, {
            watchFolderEntries: (watchedFolder, onChange) => {
              watchedFolders.set(watchedFolder, onChange);
              return () => watchedFolders.delete(watchedFolder);
            },
            runAfter: (delayMs, work) => {
              expect(delayMs).toBe(OPEN_PROJECT_REREAD_QUIET_MS);
              pendingTimers.push(work);
              return () => pendingTimers.splice(pendingTimers.indexOf(work), 1);
            },
            sendTheWindowTheOpenProject: (reading) => sentReadings.push(reading),
            projectReadingsOfTheRuntime: fakeRuntime,
          });
          await projectOpenedLast.readAndWatch();
          return "opened_its_studio_window" as const;
        }),
    }),
    Layer.mock(StatusRounds, { requestARound: Effect.void }),
  );
  const projectOpeningRuntime = ManagedRuntime.make(projectOpeningServices);
  runtimesMade.push(projectOpeningRuntime);
  /** `opening` run on the services above and the test's clock: its answer, or its refusal's words. */
  const run = <Answer>(opening: Effect.Effect<Answer, { readonly words: string }, ProjectOpeningServices>): Promise<Result<Answer, string>> =>
    projectOpeningRuntime.runPromise(
      opening.pipe(
        Effect.match({ onSuccess: (answer) => succeeded(answer), onFailure: ({ words }) => failedWith(words) }),
        Effect.provideService(Clock.Clock, clock),
      ),
    );
  /** The answer `opening` always gives, since it is never refused. */
  const answerOf = async <Answer>(opening: Effect.Effect<Answer, never, ProjectOpeningServices>): Promise<Answer> => {
    const answered = await run(opening);
    if (!answered.ok) throw new Error(answered.failure);
    return answered.value;
  };
  // Opening from the studio window of the project opened last, as the person would after opening one.
  const openProject = {
    chooseProjectFolder: (chosenFor: ProjectFolderChosenFor) => run(chooseProjectFolder(chosenFor, projectOpenedLast?.projectFolder ?? null)),
    readNewProjectDefaults: () => answerOf(readNewProjectDefaults),
    chooseNewProjectLocation: (startingAt: string) => run(chooseNewProjectLocation(startingAt)),
    createNewProject: (name: string, location: string) => run(createNewProject(name, location)),
    openRecentProject: (folder: string) => run(openRecentProject(folder)),
    readRecentProjects: () => answerOf(readRecentProjects),
    renameRecentProject: (folder: string, name: string) => run(renameRecentProject(folder, name)),
    duplicateRecentProject: (folder: string) => run(duplicateRecentProject(folder)),
    removeRecentProject: (folder: string) => run(removeRecentProject(folder)),
    deleteRecentProject: (folder: string) => run(deleteRecentProject(folder)),
    chooseProjectArchiveToImport: () => run(chooseProjectArchiveToImport),
    importProjectArchive: (archive: string, name: string, location: string) => run(importProjectArchive(archive, name, location)),
    makeAProjectOfItsOwnFromTheArchive: (archive: string, name: string) => run(makeAProjectOfItsOwnFromTheArchive(archive, name)),
    readRecentProjectCover: (folder: string) => run(readRecentProjectCover(folder)),
    setRecentProjectDescription: (folder: string, description: string) => run(setRecentProjectDescription(folder, description)),
    chooseProjectCoverImage: () => run(chooseProjectCoverImage),
    setRecentProjectCover: (folder: string, image: string | null) => run(setRecentProjectCover(folder, image)),
    readOpenProject: (): OpenProjectReading => projectOpenedLast?.readOpenProject() ?? { kind: "none_open" },
  };
  return {
    openProject,
    documentsDirectory,
    sentReadings,
    dialogsAsked,
    projectDirectoriesCreated: runtime.projectDirectoriesCreated,
    watchedFolders,
    setTheImportsTheRuntimeLists: (folders: string[]) => {
      importFoldersTheRuntimeLists = folders;
    },
    pendingTimers,
    homeDirectory,
    archiveDialogsAsked,
    coverImageDialogsAsked,
    assetsImported: runtime.assetsImported,
    deletionsQueued: runtime.deletionsQueued,
    removalsQueued: runtime.removalsQueued,
    projectsReloaded: runtime.projectsReloaded,
    describedDeletions: runtime.describedDeletions,
    studioWindowsClosed,
    projectsStarted: runtime.projectsOpened,
    waitsMs: sleepsMs,
    recentFolders: () => recentFolders.map((recentFolder) => recentFolder.folder),
    rememberedFolder: () => recentFolders[0]?.folder ?? null,
    setTheWallClock,
  };
}
