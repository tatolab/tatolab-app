// The services the main process's Effect code runs on, and the one layer `startTatolabApp` builds
// its runtime from. A collaborator not converted yet reaches Effect code as a small service over a
// member of the shared state, holding only what a converted handler reads. Effect's logs go to the
// app's log, never to the console.

import { randomUUID } from "node:crypto";
import { Cause, Context, Effect, Fiber, FiberSet, HashSet, Layer, Logger, Ref, References, type LogLevel } from "effect";
import type {
  DependencySourceKind,
  ListedStream,
  OpenProjectReading,
  PackageCatalogEntry,
  PackageCatalogReading,
  ProjectTransactionAuthor,
  StreamProjectFolderChosenFor,
  StudioWarningKind,
  TatolabStatus,
} from "../shared/tatolab_backend_contract.js";
import { projectPlaybackAsListed, streamsOfTheProjectIn, theStreamsListTheProjectOpen, type ProjectPlaybackAsListed } from "../shared/project_playback.js";
import { MarketplaceDownloadStopped, MarketplaceImports, marketplaceImportsTelling } from "./marketplace_imports_followed.js";
import { downloadTheCatalogEntrysZip, type MarketplaceDownloadFollowing } from "./marketplace_module_download.js";
import type { ProjectFolderDialogPurpose, RecentProjectFolderOpened, StudioWindowOfTheProjectShown } from "./open_project.js";
import type { ProjectAssetFileFilter } from "./project_asset_file_filters.js";
import type { ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import type { ExtensionFolderChecksSources, ExtensionFolderPassed } from "./extension_check_gate.js";
import type { ExtensionFoldersListed } from "./extension_files_served_with_types_removed.js";
import { readThePackageCatalog } from "./package_catalog.js";
import { controlPushesFollowedForTheWindows } from "./control_pushes_followed_for_the_windows.js";
import { PROJECT_LOG_RECORDS_WRITTEN, tellTheWindowTheProjectLogRecordsWritten, type ProjectLogRecordsFollowedForTheWindows, type WindowFollowingProjectLogs } from "./project_log_records_followed_for_the_windows.js";
import { streamActionsFollowedForTheStatus, type StreamActionsFollowedForTheStatus, type StreamActionsNoticed } from "./stream_action_changes_followed_for_the_status.js";
import { STREAM_GRAPH_CHANGES, tellTheWindowTheStreamGraphChanged, type StreamGraphChangesFollowedForTheWindows, type WindowFollowingStreamGraphs } from "./stream_graph_changes_followed_for_the_windows.js";
import { failedWith, type Result } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import type { TatolabAppLog, TatolabAppLogFields, TatolabAppLogLevel } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { StudioWindowOfAProject } from "./tatolab_app_windows.js";
import { studioWindowTheCommandCameFrom, type TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { runtimeViewerConnectionOpenedIn, type RuntimeViewerConnection } from "./runtime_viewer_control_connection.js";
import { LOCAL_API_REQUEST_TIMEOUT_MS, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { CommandRefused } from "./window_command.js";

/** The studio windows, each with its project. */
export class StudioWindows extends Context.Service<
  StudioWindows,
  {
    /** The folder of the project the window a command came from acts on, its own page or a view popped out of it; refused in the Projects window. */
    readonly projectFolderOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
    /** The project the window a command came from holds open as the window last read it, its own page or a view popped out of it; refused in the Projects window. */
    readonly openProjectReadingOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<OpenProjectReading, CommandRefused>;
    /** Whether a studio window holds the project in `projectFolder` open. */
    readonly aStudioWindowHoldsTheProjectIn: (projectFolder: string) => boolean;
    /** `folder`, resolved, when it is the folder of the project the window a command came from holds open or of one of its imports; `null` otherwise, and in the Projects window. */
    readonly folderOfTheWindowsOpenProject: (commandFromWindow: TatolabCommandFromWindow, folder: string) => string | null;
    /** The folder the studio window a command came from was opened at, its own page alone; `null` from any other window. */
    readonly openedFolderOfTheStudioWindow: (commandFromWindow: TatolabCommandFromWindow) => string | null;
    /** Open the project in `folder` in its own studio window, or bring that window forward when it is open; answers once the window shows the project. */
    readonly openTheProjectInItsStudioWindow: (folder: string) => Effect.Effect<StudioWindowOfTheProjectShown>;
    /** Close the studio window of the project in `folder` and the windows it opened, without asking; nothing when none is open. */
    readonly closeTheStudioWindowOf: (folder: string) => Effect.Effect<void>;
    /** Step the Projects window aside for the project's own window when the command came from it; a studio window is left as it is. */
    readonly stepTheProjectsWindowAsideFor: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<void>;
    /** The window a command came from when it follows the runtime's pushes, a studio window or a view popped out of one; `null` from any other. */
    readonly windowFollowingTheRuntimeOf: (commandFromWindow: TatolabCommandFromWindow) => WindowFollowingTheRuntime | null;
  }
>()("tatolab-app/StudioWindows") {}

/** The person's home folder, where dialogs open, and the platform's Documents folder, where new projects go under `Tato Studio/`. */
export class ThisMachinesFolders extends Context.Service<
  ThisMachinesFolders,
  {
    /** The person's home folder, where the project dialogs open. */
    readonly homeDirectory: string;
    /** The platform's Documents folder, where new projects go under `Tato Studio/`. */
    readonly documentsDirectory: string;
  }
>()("tatolab-app/ThisMachinesFolders") {}

/** The desktop's dialogs that ask the person for a project's folder, its `.zip`, its cover image or files to import into it; each answers `null` when they cancel. */
export class ProjectDialogs extends Context.Service<
  ProjectDialogs,
  {
    /** A folder, for a project to open or a new project's location as `purpose` says, the dialog opened at `defaultFolder`. */
    readonly chooseAProjectFolder: (purpose: ProjectFolderDialogPurpose, defaultFolder: string) => Effect.Effect<string | null, CommandRefused>;
    /** A project `.zip` to import, the dialog opened at `defaultFolder`. */
    readonly chooseAProjectArchive: (defaultFolder: string) => Effect.Effect<string | null, CommandRefused>;
    /** An image to show a project by, the dialog opened at `defaultFolder`. */
    readonly chooseAProjectCoverImage: (defaultFolder: string) => Effect.Effect<string | null, CommandRefused>;
    /** The files to import as assets, the dialog opened at `defaultFolder` offering `fileFilters`, the first chosen. */
    readonly chooseAssetFilesToImport: (defaultFolder: string, fileFilters: readonly ProjectAssetFileFilter[]) => Effect.Effect<readonly string[] | null, CommandRefused>;
    /** A folder from the Projects window's add menu, an existing project to open or a new project's folder as `chosenFor` says, the dialog opened at `defaultFolder`. */
    readonly chooseAStreamProjectFolder: (chosenFor: StreamProjectFolderChosenFor, defaultFolder: string) => Effect.Effect<string | null, CommandRefused>;
  }
>()("tatolab-app/ProjectDialogs") {}

/** The projects opened before, remembered between launches, recent first. */
export class RecentProjects extends Context.Service<
  RecentProjects,
  {
    /** The folders remembered, recent first; none when none are. */
    readonly readRecentFolders: Effect.Effect<RecentProjectFolderOpened[]>;
    /** Put `folder` first, opened at `openedAtWallClockMs`; refused in words when it could not be written, though it stays remembered until the app quits. */
    readonly rememberOpened: (folder: string, openedAtWallClockMs: number) => Effect.Effect<void, CommandRefused>;
    /** Forget `folder`; nothing changes when it is not remembered, and refused in words when it could not be written. */
    readonly forget: (folder: string) => Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/RecentProjects") {}

/** The project views the studio windows last listed as ones that open, each through the extension check gate: the only view folders, and the only bytes, served. */
export class ProjectViewsListed extends Context.Service<
  ProjectViewsListed,
  {
    /** The view folder `viewFolderInTheProject` at `folderVersion` as the last listing of the project in `openProjectFolder` passed it; `null` when it holds none. */
    readonly passedExtensionFolder: (openProjectFolder: string, folderVersion: string, viewFolderInTheProject: string) => ExtensionFolderPassed | null;
    /** The mark of a listing about to be asked for, which `rememberTheListing` takes back with its answer. */
    readonly startAListing: Effect.Effect<number>;
    /** Keep `passedFolders`, by folder, as the `listed` listing of the project in `openProjectFolder` started as `listingStarted`, unless one started later is already kept. */
    readonly rememberTheListing: (openProjectFolder: string, listed: ExtensionFoldersListed, listingStarted: number, passedFolders: ReadonlyMap<string, ExtensionFolderPassed>) => Effect.Effect<void>;
    /** What the extension check gate keeps and names. */
    readonly extensionFolderChecks: ExtensionFolderChecksSources;
  }
>()("tatolab-app/ProjectViewsListed") {}

/** The streams the runtime last listed. */
export class ListedStreams extends Context.Service<
  ListedStreams,
  {
    /** The stream assets of the project in `projectFolder` as the runtime last listed its streams. */
    readonly streamAssetsOfTheProject: (projectFolder: string) => ReadonlySet<string>;
    /** Whether the runtime last listed a stream from the project in `projectFolder`. */
    readonly aStreamIsListedFrom: (projectFolder: string) => boolean;
    /** Whether the runtime last listed the project in `projectFolder` open: any of its streams in a state other than `closed`. */
    readonly theProjectIsListedOpen: (projectFolder: string) => boolean;
    /** The stream with the id `stream` as the runtime last listed it; `null` when it did not list it. */
    readonly listedStream: (stream: string) => ListedStream | null;
    /** The playback of the project in `projectFolder` as the runtime last listed its streams. */
    readonly playbackOfTheProject: (projectFolder: string) => ProjectPlaybackAsListed;
  }
>()("tatolab-app/ListedStreams") {}

/** The Module manager windows, each importing into the project of the studio window that opened it. */
export class ModuleManagerWindows extends Context.Service<
  ModuleManagerWindows,
  {
    /** The folder of the project the Module manager window a command came from imports into; refused in any other window. */
    readonly workspaceFolderOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
    /** The folder of the project the window a command came from belongs to: its studio window, a view popped out of it, or its Module manager window; refused in any other window. */
    readonly projectFolderOfAWindowOfTheProject: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
    /** The desktop's open dialog for a project's folder or `.zip`, opened at `defaultFolder`; `null` when the person cancels. */
    readonly chooseDependencySource: (sourceKind: DependencySourceKind, defaultFolder: string) => Effect.Effect<string | null, CommandRefused>;
  }
>()("tatolab-app/ModuleManagerWindows") {}

/** The package catalog the Module manager lists and the Marketplace downloads it names. */
export class PackageCatalog extends Context.Service<
  PackageCatalog,
  {
    /** The catalog read afresh: its entries for this machine, or why it did not read. */
    readonly readTheCatalog: Effect.Effect<PackageCatalogReading>;
    /** The path of `entry`'s `.zip`, downloaded into the app's downloads folder and checked against the catalog, `following` told each stage and able to stop it while it downloads. */
    readonly downloadTheZipOf: (entry: PackageCatalogEntry, following: MarketplaceDownloadFollowing | null) => Effect.Effect<string, CommandRefused | MarketplaceDownloadStopped>;
  }
>()("tatolab-app/PackageCatalog") {}

/** What asks the system for the camera and microphone the project views declare, ahead of a view asking for one. */
export class SystemMediaAccessAhead extends Context.Service<
  SystemMediaAccessAhead,
  {
    /** Ask the system for each device a view among `listedViews` declares that this run has not asked for yet, notifying the person of a refusal. */
    readonly askForTheDevicesTheViewsDeclare: (listedViews: readonly ProjectViewTheRuntimeListed[]) => Effect.Effect<void>;
  }
>()("tatolab-app/SystemMediaAccessAhead") {}

/** The status rounds that read the runtime and publish what it holds to the tray and the windows. */
export class StatusRounds extends Context.Service<
  StatusRounds,
  {
    /** Ask for a round now, so the listing shows what a command changed. */
    readonly requestARound: Effect.Effect<void>;
    /** The status as of the last round, waiting up to `waitLimitMs` for the first; `null` when none came by then. */
    readonly lastStatusWaitingUpTo: (waitLimitMs: number) => Effect.Effect<TatolabStatus | null>;
  }
>()("tatolab-app/StatusRounds") {}

/** `change`, then a status round whether it changed the runtime or was refused, so the listing shows what it did. */
export function thenAStatusRound<Answer, Failure, Services>(change: Effect.Effect<Answer, Failure, Services>): Effect.Effect<Answer, Failure, Services | StatusRounds> {
  return change.pipe(Effect.ensuring(StatusRounds.use((statusRounds) => statusRounds.requestARound)));
}

/** What the window changes and Studio remembers between launches: its settings, and the warning dialogs already shown; what could not be remembered is refused in words. */
export class StudioSettings extends Context.Service<
  StudioSettings,
  {
    /** Notify when a stream fails, or stop. */
    readonly setStreamFailureNotifications: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
    /** Turn Developer mode on or off. */
    readonly setDeveloperMode: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
    /** Remember that the dialog of the warning `kind` was shown, so no window shows it again. */
    readonly rememberTheWarningDialogWasShown: (kind: StudioWarningKind) => Effect.Effect<void, CommandRefused>;
    /** Have the desktop open the app at login, or stop; refused in the desktop's words. */
    readonly setOpenTatolabAtLogin: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/StudioSettings") {}

/** What the app carries for this machine: the runtime it runs as its child, and the `tatolab` command it links in the home folder. */
export class CarriedTools extends Context.Service<
  CarriedTools,
  {
    /** Stop the app's runtime and start it again; refused for a runtime the app did not start. */
    readonly restartTheRuntime: Effect.Effect<void, CommandRefused>;
    /** Link `~/.local/bin/tatolab` to the command the app carries; refused in words when something else holds the name or the build offers none. */
    readonly linkTheCommandLineTool: Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/CarriedTools") {}

/** The desktop's file manager. */
export class FileManager extends Context.Service<
  FileManager,
  {
    /** Show `folder` in the file manager; refused with `refusalWhenMissing` when it is no folder on this machine, and in the desktop's words. */
    readonly showAnExistingFolder: (folder: string, refusalWhenMissing: string) => Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/FileManager") {}

/** The desktop's terminal. */
export class Terminal extends Context.Service<
  Terminal,
  {
    /** Open a terminal whose shell starts in `folder`; refused with `refusalWhenMissing` when it is no folder on this machine, and in the platform's words. */
    readonly openInAnExistingFolder: (folder: string, refusalWhenMissing: string) => Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/Terminal") {}

/** The folders the app handed the window from its own dialog, the only ones a command may have the runtime create or open a project in, so a page never picks a path of its own. */
export class FoldersChosenInTheWindow extends Context.Service<
  FoldersChosenInTheWindow,
  {
    /** Remember `folder`, absolute, as handed to the window. */
    readonly remember: (folder: string) => Effect.Effect<void>;
    /** Whether the app handed `folder`, absolute, to the window. */
    readonly holds: (folder: string) => Effect.Effect<boolean>;
  }
>()("tatolab-app/FoldersChosenInTheWindow") {}

/** The folders handed to the window, none at first, kept for as long as the runtime the layer builds. */
export const foldersChosenInTheWindowLayer: Layer.Layer<FoldersChosenInTheWindow> = Layer.effect(
  FoldersChosenInTheWindow,
  Ref.make(HashSet.empty<string>()).pipe(
    Effect.map((foldersHandedToTheWindow) => ({
      remember: (folder: string) => Ref.update(foldersHandedToTheWindow, HashSet.add(folder)),
      holds: (folder: string) => Ref.get(foldersHandedToTheWindow).pipe(Effect.map(HashSet.has(folder))),
    })),
  ),
);

/** The person signed in to this computer, the author Studio's graph edits are recorded under. */
export class PersonEditingInStudio extends Context.Service<PersonEditingInStudio, { readonly author: ProjectTransactionAuthor }>()("tatolab-app/PersonEditingInStudio") {}

/** The idempotency key of each change Studio asks of the runtime once, so a retried call is recorded once. */
export class IdempotencyKeys extends Context.Service<IdempotencyKeys, { readonly mint: Effect.Effect<string> }>()("tatolab-app/IdempotencyKeys") {}

/** This copy of the Studio's version, which names the contents of its own node UI module. */
export class StudioAppVersion extends Context.Service<StudioAppVersion, { readonly version: string }>()("tatolab-app/StudioAppVersion") {}

/** The stream graphs the app's windows follow, over a connection to the runtime held open while one is followed. */
export class StreamGraphsFollowed extends Context.Service<StreamGraphsFollowed, StreamGraphChangesFollowedForTheWindows>()("tatolab-app/StreamGraphsFollowed") {}

/** The project logs the app's windows follow, over a connection to the runtime held open while one is followed. */
export class ProjectLogsFollowed extends Context.Service<ProjectLogsFollowed, ProjectLogRecordsFollowedForTheWindows>()("tatolab-app/ProjectLogsFollowed") {}

/** A window that follows the runtime's pushes: told each change of a stream graph and each project log record it follows. */
export type WindowFollowingTheRuntime = WindowFollowingStreamGraphs & WindowFollowingProjectLogs;

/** The folder of the project `studioWindow` shows, refused in `words` where no window was found. */
function projectFolderOrRefusal(studioWindow: StudioWindowOfAProject | null, words: string): Effect.Effect<string, CommandRefused> {
  return studioWindow === null ? Effect.fail(new CommandRefused({ words })) : Effect.succeed(studioWindow.openProject.projectFolder);
}

/** The stream graphs and project logs the windows follow, over the runtime's connections while the layer's scope is open. */
export function runtimePushesFollowedLayerOver(runtimeControl: Layer.Layer<RuntimeControl>, tatolabAppLog: TatolabAppLog): Layer.Layer<StreamGraphsFollowed | ProjectLogsFollowed> {
  return Layer.mergeAll(
    Layer.effect(StreamGraphsFollowed, controlPushesFollowedForTheWindows(STREAM_GRAPH_CHANGES, tellTheWindowTheStreamGraphChanged)),
    Layer.effect(ProjectLogsFollowed, controlPushesFollowedForTheWindows(PROJECT_LOG_RECORDS_WRITTEN, tellTheWindowTheProjectLogRecordsWritten)),
    // The following runs in fibers of its own, which log through the logger provided to them here.
  ).pipe(Layer.provide(Layer.merge(runtimeControl, tatolabAppLogAsEffectsLogger(tatolabAppLog))));
}

/** The runtime's stream actions, followed for the status once the app has opened. */
export class StreamActionsFollowed extends Context.Service<StreamActionsFollowed, StreamActionsFollowedForTheStatus>()("tatolab-app/StreamActionsFollowed") {}

/** The stream actions followed over `runtimeControl` into `noticed`, the status read again with `readTheStatusAgain`, while the layer's scope is open. */
export function streamActionsFollowedLayerOver(
  runtimeControl: Layer.Layer<RuntimeControl>,
  tatolabAppLog: TatolabAppLog,
  noticed: StreamActionsNoticed,
  readTheStatusAgain: () => void,
): Layer.Layer<StreamActionsFollowed> {
  return Layer.effect(StreamActionsFollowed, streamActionsFollowedForTheStatus(noticed, readTheStatusAgain)).pipe(
    // The following runs in a fiber of its own, which logs through the logger provided to it here.
    Layer.provide(Layer.merge(runtimeControl, tatolabAppLogAsEffectsLogger(tatolabAppLog))),
  );
}

/** What runs each studio window's following of its project's change feed: in the studio runtime's scope, over `RuntimeControl`. */
export class ProjectFeedsFollowed extends Context.Service<
  ProjectFeedsFollowed,
  {
    /** `following` run in the studio runtime's scope until it or the studio runtime is interrupted. */
    readonly follow: (following: Effect.Effect<never, never, RuntimeControl>) => Effect.Effect<never>;
  }
>()("tatolab-app/ProjectFeedsFollowed") {}

/** Each studio window's project change feed followed over `runtimeControl` while the layer's scope is open. */
export function projectFeedsFollowedLayerOver(runtimeControl: Layer.Layer<RuntimeControl>): Layer.Layer<ProjectFeedsFollowed> {
  return Layer.effect(
    ProjectFeedsFollowed,
    Effect.gen(function* () {
      const followings = yield* FiberSet.make<never, never>();
      const overTheRuntime = yield* Effect.context<RuntimeControl>();
      return {
        follow: (following) =>
          FiberSet.run(followings, following.pipe(Effect.provide(overTheRuntime))).pipe(
            Effect.flatMap((followingFiber) => Fiber.join(followingFiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(followingFiber)))),
          ),
      };
    }),
  ).pipe(Layer.provide(runtimeControl));
}

/** The connections port viewers are opened over, each open until it is closed, the runtime closes it, or the studio runtime is disposed. */
export class RuntimeConnectionsForPortViewers extends Context.Service<
  RuntimeConnectionsForPortViewers,
  {
    /** A connection port viewers are opened over, opened now. */
    readonly open: Effect.Effect<RuntimeViewerConnection, RuntimeControlFailure>;
  }
>()("tatolab-app/RuntimeConnectionsForPortViewers") {}

/** Port viewers' connections opened over `runtimeControl` in the layer's scope, a call on one that breaks logged to `tatolabAppLog`. */
export function runtimeConnectionsForPortViewersLayerOver(runtimeControl: Layer.Layer<RuntimeControl>, tatolabAppLog: TatolabAppLog): Layer.Layer<RuntimeConnectionsForPortViewers> {
  return Layer.effect(
    RuntimeConnectionsForPortViewers,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;
      const overTheRuntime = yield* Effect.context<RuntimeControl>();
      return { open: runtimeViewerConnectionOpenedIn(layerScope).pipe(Effect.provide(overTheRuntime)) };
    }),
    // Each connection's calls run on the services provided here, its logger among them.
  ).pipe(Layer.provide(Layer.merge(runtimeControl, tatolabAppLogAsEffectsLogger(tatolabAppLog))));
}

/** How long a port viewers' connection waits for the runtime to open or close a viewer. */
const PORT_VIEWER_CONNECTION_REQUEST_TIMEOUT_MS = 5_000;

/** How long a project change feed's connection waits for the runtime to read the feed, which opens the project, or to subscribe it. */
const PROJECT_FEEDS_CONNECTION_REQUEST_TIMEOUT_MS = 10_000;

/** How long the stream actions' connection waits for the runtime to answer a subscribe or a describe. */
const STREAM_ACTIONS_CONNECTION_REQUEST_TIMEOUT_MS = 10_000;

/** How long a connection the windows follow the runtime's pushes over waits for the runtime to answer a subscribe. */
const CONTROL_PUSHES_CONNECTION_REQUEST_TIMEOUT_MS = 5_000;

/** Every service the main process's Effect code runs on. */
export type StudioServices =
  | RuntimeControl
  | StudioWindows
  | ModuleManagerWindows
  | MarketplaceImports
  | PackageCatalog
  | ThisMachinesFolders
  | ProjectDialogs
  | RecentProjects
  | ProjectViewsListed
  | ListedStreams
  | SystemMediaAccessAhead
  | StatusRounds
  | StudioSettings
  | CarriedTools
  | FileManager
  | Terminal
  | FoldersChosenInTheWindow
  | PersonEditingInStudio
  | IdempotencyKeys
  | StudioAppVersion
  | StreamGraphsFollowed
  | StreamActionsFollowed
  | ProjectFeedsFollowed
  | ProjectLogsFollowed
  | RuntimeConnectionsForPortViewers;

/** The app's log level each of Effect's log levels writes at; `None` writes nothing. */
function tatolabAppLogLevelOf(logLevel: LogLevel.LogLevel): TatolabAppLogLevel | null {
  switch (logLevel) {
    case "Fatal":
    case "Error":
      return "error";
    case "Warn":
      return "warn";
    case "Info":
      return "info";
    case "Debug":
    case "Trace":
    case "All":
      return "debug";
    case "None":
      return null;
  }
}

/** `value`, annotated on a log, as a field of the app's log: kept when it is one a field holds, its JSON otherwise. */
function tatolabAppLogFieldOf(value: unknown): string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : (JSON.stringify(value) ?? String(value));
}

/** Effect's logger, replaced by one writing each log to `tatolabAppLog`: its first part as the message, its annotations as fields, any further parts as `details`, and a cause as `cause`. */
export function tatolabAppLogAsEffectsLogger(tatolabAppLog: TatolabAppLog): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message, logLevel, cause, fiber }) => {
      const [firstPart, ...furtherParts]: readonly unknown[] = Array.isArray(message) ? message : [message];
      const fields: TatolabAppLogFields = {
        ...Object.fromEntries(Object.entries(fiber.getRef(References.CurrentLogAnnotations)).map(([name, value]) => [name, tatolabAppLogFieldOf(value)])),
        ...(furtherParts.length > 0 ? { details: furtherParts.map((part) => String(part)).join(" ") } : {}),
        ...(cause.reasons.length > 0 ? { cause: Cause.pretty(cause) } : {}),
      };
      const level = tatolabAppLogLevelOf(logLevel);
      if (level !== null) tatolabAppLog[level](String(firstPart), fields);
    }),
  ]);
}

/** The answer of plain code `answering`, its failure Studio's refusal in its words. */
function commandAnswerOfPlainCode<Answer>(answering: () => Promise<Result<Answer, string>>): Effect.Effect<Answer, CommandRefused> {
  return Effect.promise(answering).pipe(Effect.flatMap((answered) => fromResult(answered, (words) => new CommandRefused({ words }))));
}

/** A service method opening a folder with `openTheFolder` while `isAnExistingFolder` says it is a folder on this machine; refused with `refusalWhenMissing` once it is not, and in the opener's words. */
function existingFolderOpenedBy(
  isAnExistingFolder: (folder: string) => Promise<boolean>,
  openTheFolder: (existingFolder: string) => Promise<Result<void, string>>,
): (folder: string, refusalWhenMissing: string) => Effect.Effect<void, CommandRefused> {
  return (folder, refusalWhenMissing) => commandAnswerOfPlainCode(async () => ((await isAnExistingFolder(folder)) ? openTheFolder(folder) : failedWith(refusalWhenMissing)));
}

/** Every service the main process's Effect code runs on, over `sharedState`, the local API at `localApiSocketPath` and this copy's `appVersion`. */
export function studioRuntimeLayer(sharedState: TatolabAppSharedState, localApiSocketPath: string, appVersion: string): Layer.Layer<StudioServices> {
  const folderOpeners = sharedState.streamProjectFolderOpeners;
  const streamsLastListed = () => sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [];
  const streamsLastListedFrom = (projectFolder: string) => streamsOfTheProjectIn(streamsLastListed(), projectFolder);
  const studioWindowOf = (commandFromWindow: TatolabCommandFromWindow) =>
    fromResult(studioWindowTheCommandCameFrom(sharedState, commandFromWindow), (words) => new CommandRefused({ words }));
  return Layer.mergeAll(
    runtimeControlLayer(localApiSocketPath, LOCAL_API_REQUEST_TIMEOUT_MS),
    runtimePushesFollowedLayerOver(runtimeControlLayer(localApiSocketPath, CONTROL_PUSHES_CONNECTION_REQUEST_TIMEOUT_MS), sharedState.tatolabAppLog),
    projectFeedsFollowedLayerOver(runtimeControlLayer(localApiSocketPath, PROJECT_FEEDS_CONNECTION_REQUEST_TIMEOUT_MS)),
    runtimeConnectionsForPortViewersLayerOver(runtimeControlLayer(localApiSocketPath, PORT_VIEWER_CONNECTION_REQUEST_TIMEOUT_MS), sharedState.tatolabAppLog),
    streamActionsFollowedLayerOver(runtimeControlLayer(localApiSocketPath, STREAM_ACTIONS_CONNECTION_REQUEST_TIMEOUT_MS), sharedState.tatolabAppLog, sharedState.streamActionsNoticed, () =>
      sharedState.statusPublisher.requestRefresh(),
    ),
    Layer.succeed(StudioWindows, {
      projectFolderOfTheWindow: (commandFromWindow) => studioWindowOf(commandFromWindow).pipe(Effect.map((studioWindow) => studioWindow.projectTransactionsFeed.projectFolder)),
      openProjectReadingOfTheWindow: (commandFromWindow) => studioWindowOf(commandFromWindow).pipe(Effect.map((studioWindow) => studioWindow.openProject.readOpenProject())),
      aStudioWindowHoldsTheProjectIn: (projectFolder) => sharedState.appWindows.aStudioWindowHoldsTheProjectIn(projectFolder),
      openedFolderOfTheStudioWindow: (commandFromWindow) => sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId)?.openProject.projectFolder ?? null,
      openTheProjectInItsStudioWindow: (folder) => Effect.promise(() => sharedState.appWindows.openTheProjectInItsStudioWindow(folder)),
      closeTheStudioWindowOf: (folder) => Effect.sync(() => sharedState.appWindows.studioWindowOfTheProjectIn(folder)?.tatolabMainWindow.close()),
      stepTheProjectsWindowAsideFor: (commandFromWindow) =>
        Effect.sync(() => {
          if (sharedState.appWindows.isTheProjectsWindow(commandFromWindow.windowContentsId)) sharedState.appWindows.projectsWindow.hide();
        }),
      windowFollowingTheRuntimeOf: (commandFromWindow) => sharedState.appWindows.windowShowingPortViewersWithContents(commandFromWindow.windowContentsId),
      folderOfTheWindowsOpenProject: (commandFromWindow, folder) => {
        const openProjectFolder = sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId)?.openProject.projectFolderOfTheOpenProject(folder);
        return openProjectFolder?.ok === true ? openProjectFolder.value : null;
      },
    }),
    Layer.succeed(
      MarketplaceImports,
      marketplaceImportsTelling((windowContentsId, progressed) => sharedState.appWindows.windowWithContents(windowContentsId)?.tellTheWindowTheMarketplaceImportProgressed(progressed), sharedState.readMonotonicClockMs),
    ),
    Layer.succeed(ModuleManagerWindows, {
      workspaceFolderOfTheWindow: (commandFromWindow) => {
        const studioWindow = sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId);
        return projectFolderOrRefusal(studioWindow, "Only a Module manager window imports into a project.");
      },
      projectFolderOfAWindowOfTheProject: (commandFromWindow) => {
        const studioWindow =
          sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId) ?? sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId);
        return projectFolderOrRefusal(studioWindow, "Only a project's studio window, a view popped out of it, or its Module manager window imports into the project.");
      },
      chooseDependencySource: (sourceKind, defaultFolder) => commandAnswerOfPlainCode(() => sharedState.dependencySourceDialog(sourceKind, defaultFolder)),
    }),
    Layer.succeed(PackageCatalog, {
      readTheCatalog: Effect.promise(() => readThePackageCatalog(sharedState.fetchTextOverHttps, sharedState.machineModulesInstallOn)),
      downloadTheZipOf: (entry, following) =>
        Effect.promise(() => downloadTheCatalogEntrysZip(entry, sharedState.fetchBytesOverHttps, sharedState.moduleDownloadsFolder, following)).pipe(
          Effect.flatMap((downloaded) =>
            fromResult(downloaded, (failure) =>
              failure.kind === "stopped" ? new MarketplaceDownloadStopped({ words: `The download of ${entry.title} was cancelled; nothing was imported.` }) : new CommandRefused({ words: failure.because }),
            ),
          ),
        ),
    }),
    Layer.succeed(ThisMachinesFolders, { homeDirectory: sharedState.homeDirectory, documentsDirectory: sharedState.documentsDirectory }),
    Layer.succeed(ProjectDialogs, {
      chooseAProjectFolder: (purpose, defaultFolder) => commandAnswerOfPlainCode(() => sharedState.projectFolderDialog(purpose, defaultFolder)),
      chooseAProjectArchive: (defaultFolder) => commandAnswerOfPlainCode(() => sharedState.projectArchiveDialog(defaultFolder)),
      chooseAProjectCoverImage: (defaultFolder) => commandAnswerOfPlainCode(() => sharedState.projectCoverImageDialog(defaultFolder)),
      chooseAssetFilesToImport: (defaultFolder, fileFilters) => commandAnswerOfPlainCode(() => sharedState.projectAssetFilesDialog(defaultFolder, fileFilters)),
      chooseAStreamProjectFolder: (chosenFor, defaultFolder) => commandAnswerOfPlainCode(() => sharedState.streamProjectFolderDialog(chosenFor, defaultFolder)),
    }),
    Layer.succeed(RecentProjects, {
      readRecentFolders: Effect.promise(() => sharedState.recentProjectFolders.readRecentFolders()),
      rememberOpened: (folder, openedAtWallClockMs) => commandAnswerOfPlainCode(() => sharedState.recentProjectFolders.rememberOpened(folder, openedAtWallClockMs)),
      forget: (folder) => commandAnswerOfPlainCode(() => sharedState.recentProjectFolders.forget(folder)),
    }),
    Layer.succeed(ProjectViewsListed, {
      passedExtensionFolder: (openProjectFolder, folderVersion, viewFolderInTheProject) => sharedState.projectViewsListed.passedExtensionFolder(openProjectFolder, folderVersion, viewFolderInTheProject),
      startAListing: Effect.sync(() => sharedState.projectViewsListed.startAListing()),
      rememberTheListing: (openProjectFolder, listed, listingStarted, passedFolders) =>
        Effect.sync(() => sharedState.projectViewsListed.rememberTheListing(openProjectFolder, listed, listingStarted, passedFolders)),
      extensionFolderChecks: sharedState.extensionFolderChecks,
    }),
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: (projectFolder) => new Set(streamsLastListedFrom(projectFolder).flatMap((listedStream) => listedStream.location?.stream_asset ?? [])),
      aStreamIsListedFrom: (projectFolder) => streamsLastListedFrom(projectFolder).length > 0,
      theProjectIsListedOpen: (projectFolder) => theStreamsListTheProjectOpen(streamsLastListedFrom(projectFolder)),
      listedStream: (stream) => streamsLastListed().find((listedStream) => listedStream.stream === stream) ?? null,
      playbackOfTheProject: (projectFolder) => projectPlaybackAsListed(streamsLastListed(), projectFolder),
    }),
    Layer.succeed(SystemMediaAccessAhead, {
      askForTheDevicesTheViewsDeclare: (listedViews) => Effect.promise(() => sharedState.systemMediaAccessAskedAheadForViews.askForTheDevicesTheViewsDeclare(listedViews)),
    }),
    Layer.succeed(StatusRounds, {
      requestARound: Effect.sync(() => sharedState.statusPublisher.requestRefresh()),
      lastStatusWaitingUpTo: (waitLimitMs) => Effect.promise(() => sharedState.statusPublisher.lastPublishedStatusWaitingUpTo(waitLimitMs)),
    }),
    Layer.succeed(StudioSettings, {
      setStreamFailureNotifications: (enabled) => commandAnswerOfPlainCode(() => sharedState.streamFailureNotifications.setNotifyWhenAStreamFails(enabled)),
      setDeveloperMode: (enabled) => commandAnswerOfPlainCode(() => sharedState.developerModeSwitch.setAndRemember(enabled)),
      rememberTheWarningDialogWasShown: (kind) => commandAnswerOfPlainCode(() => sharedState.studioWarnings.rememberTheDialogWasShown(kind)),
      setOpenTatolabAtLogin: (enabled) => commandAnswerOfPlainCode(() => sharedState.controller.setOpenTatolabAtLogin(enabled)),
    }),
    Layer.succeed(CarriedTools, {
      restartTheRuntime: commandAnswerOfPlainCode(() => sharedState.controller.restartTheRuntimeOnRequest()),
      linkTheCommandLineTool: commandAnswerOfPlainCode(() => sharedState.controller.linkTheCommandLineTool()),
    }),
    Layer.succeed(FileManager, { showAnExistingFolder: existingFolderOpenedBy(folderOpeners.isAnExistingFolder, (folder) => folderOpeners.openAFolderInTheFileManager(folder)) }),
    Layer.succeed(Terminal, { openInAnExistingFolder: existingFolderOpenedBy(folderOpeners.isAnExistingFolder, (folder) => folderOpeners.terminalOpenedInAFolder.openTerminalIn(folder)) }),
    foldersChosenInTheWindowLayer,
    Layer.succeed(PersonEditingInStudio, { author: sharedState.thePersonEditingInStudio }),
    Layer.succeed(IdempotencyKeys, { mint: Effect.sync(() => randomUUID()) }),
    Layer.succeed(StudioAppVersion, { version: appVersion }),
    tatolabAppLogAsEffectsLogger(sharedState.tatolabAppLog),
  );
}
