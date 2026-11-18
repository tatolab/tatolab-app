// The services the main process's Effect code runs on, and the one layer `startTatolabApp` builds
// its runtime from. A collaborator not converted yet reaches Effect code as a small service over a
// member of the shared state, holding only what a converted handler reads. Effect's logs go to the
// app's log, never to the console.

import { Cause, Context, Effect, Layer, Logger, References, type LogLevel } from "effect";
import type { ChosenProjectFolder, DependencySourceKind, ListedStream, PackageCatalogEntry, PackageCatalogReading, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { streamsOfTheProjectIn, theStreamsListTheProjectOpen } from "../shared/project_playback.js";
import { downloadTheCatalogEntrysZip } from "./marketplace_module_download.js";
import { readThePackageCatalog } from "./package_catalog.js";
import type { Result } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import type { TatolabAppLog, TatolabAppLogFields, TatolabAppLogLevel } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { studioWindowTheCommandCameFrom, type TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { LOCAL_API_REQUEST_TIMEOUT_MS, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { CommandRefused } from "./window_command.js";

/** The studio windows, each with its project. */
export class StudioWindows extends Context.Service<
  StudioWindows,
  {
    /** The folder of the project the window a command came from acts on, its own page or a view popped out of it; refused in the Projects window. */
    readonly projectFolderOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
    /** Whether a studio window holds the project in `projectFolder` open. */
    readonly aStudioWindowHoldsTheProjectIn: (projectFolder: string) => boolean;
    /** `folder`, resolved, when it is the folder of the project the window a command came from holds open or of one of its imports; `null` otherwise, and in the Projects window. */
    readonly folderOfTheWindowsOpenProject: (commandFromWindow: TatolabCommandFromWindow, folder: string) => string | null;
  }
>()("tatolab-app/StudioWindows") {}

/** The project views the studio windows last listed as ones that open: the only view folders served. */
export class ProjectViewsListed extends Context.Service<
  ProjectViewsListed,
  {
    /** Whether the last listing of the project in `openProjectFolder` holds `viewFolderInTheProject` as a view that opens. */
    readonly isListedAsOpening: (openProjectFolder: string, viewFolderInTheProject: string) => boolean;
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
  }
>()("tatolab-app/ListedStreams") {}

/** The Module manager windows, each importing into the project of the studio window that opened it. */
export class ModuleManagerWindows extends Context.Service<
  ModuleManagerWindows,
  {
    /** The folder of the project the Module manager window a command came from imports into; refused in any other window. */
    readonly workspaceFolderOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
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
    /** The path of `entry`'s `.zip`, downloaded into the app's downloads folder and checked against the catalog. */
    readonly downloadTheZipOf: (entry: PackageCatalogEntry) => Effect.Effect<string, CommandRefused>;
  }
>()("tatolab-app/PackageCatalog") {}

/** What opens projects in their studio windows. */
export class StudioProjectOpening extends Context.Service<
  StudioProjectOpening,
  {
    /** A project of its own named `name`, made from the project archive `archive` by the runtime's `import_project`, then opened in its studio window. */
    readonly makeAProjectOfItsOwnFromTheArchive: (archive: string, name: string) => Effect.Effect<ChosenProjectFolder, CommandRefused>;
  }
>()("tatolab-app/StudioProjectOpening") {}

/** The status rounds that read the runtime and publish what it holds to the tray and the windows. */
export class StatusRounds extends Context.Service<
  StatusRounds,
  {
    /** Ask for a round now, so the listing shows what a command changed. */
    readonly requestARound: Effect.Effect<void>;
  }
>()("tatolab-app/StatusRounds") {}

/** The person signed in to this computer, the author Studio's graph edits are recorded under. */
export class PersonEditingInStudio extends Context.Service<PersonEditingInStudio, { readonly author: ProjectTransactionAuthor }>()("tatolab-app/PersonEditingInStudio") {}

/** This copy of the Studio's version, which names the contents of its own node UI module. */
export class StudioAppVersion extends Context.Service<StudioAppVersion, { readonly version: string }>()("tatolab-app/StudioAppVersion") {}

/** Every service the main process's Effect code runs on. */
export type StudioServices =
  | RuntimeControl
  | StudioWindows
  | ModuleManagerWindows
  | PackageCatalog
  | StudioProjectOpening
  | ProjectViewsListed
  | ListedStreams
  | StatusRounds
  | PersonEditingInStudio
  | StudioAppVersion;

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

/** Every service the main process's Effect code runs on, over `sharedState`, the local API at `localApiSocketPath` and this copy's `appVersion`. */
export function studioRuntimeLayer(sharedState: TatolabAppSharedState, localApiSocketPath: string, appVersion: string): Layer.Layer<StudioServices> {
  const streamsLastListed = () => sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [];
  const streamsLastListedFrom = (projectFolder: string) => streamsOfTheProjectIn(streamsLastListed(), projectFolder);
  return Layer.mergeAll(
    runtimeControlLayer(localApiSocketPath, LOCAL_API_REQUEST_TIMEOUT_MS),
    Layer.succeed(StudioWindows, {
      projectFolderOfTheWindow: (commandFromWindow) =>
        fromResult(studioWindowTheCommandCameFrom(sharedState, commandFromWindow), (words) => new CommandRefused({ words })).pipe(
          Effect.map((studioWindow) => studioWindow.projectTransactionsFeed.projectFolder),
        ),
      aStudioWindowHoldsTheProjectIn: (projectFolder) => sharedState.appWindows.aStudioWindowHoldsTheProjectIn(projectFolder),
      folderOfTheWindowsOpenProject: (commandFromWindow, folder) => {
        const openProjectFolder = sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId)?.openProjectFiles.projectFolderOfTheOpenProject(folder);
        return openProjectFolder?.ok === true ? openProjectFolder.value : null;
      },
    }),
    Layer.succeed(ModuleManagerWindows, {
      workspaceFolderOfTheWindow: (commandFromWindow) => {
        const studioWindow = sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId);
        return studioWindow === null ? Effect.fail(new CommandRefused({ words: "Only a Module manager window imports into a project." })) : Effect.succeed(studioWindow.openProject.projectFolder);
      },
      chooseDependencySource: (sourceKind, defaultFolder) => commandAnswerOfPlainCode(() => sharedState.dependencySourceDialog(sourceKind, defaultFolder)),
    }),
    Layer.succeed(PackageCatalog, {
      readTheCatalog: Effect.promise(() => readThePackageCatalog(sharedState.fetchTextOverHttps, sharedState.machineModulesInstallOn)),
      downloadTheZipOf: (entry) => commandAnswerOfPlainCode(() => downloadTheCatalogEntrysZip(entry, sharedState.fetchBytesOverHttps, sharedState.moduleDownloadsFolder)),
    }),
    Layer.succeed(StudioProjectOpening, {
      makeAProjectOfItsOwnFromTheArchive: (archive, name) => commandAnswerOfPlainCode(() => sharedState.projectOpening.makeAProjectOfItsOwnFromTheArchive(archive, name)),
    }),
    Layer.succeed(ProjectViewsListed, {
      isListedAsOpening: (openProjectFolder, viewFolderInTheProject) => sharedState.projectViewsListed.isListedAsOpening(openProjectFolder, viewFolderInTheProject),
    }),
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: (projectFolder) => new Set(streamsLastListedFrom(projectFolder).flatMap((listedStream) => listedStream.location?.stream_asset ?? [])),
      aStreamIsListedFrom: (projectFolder) => streamsLastListedFrom(projectFolder).length > 0,
      theProjectIsListedOpen: (projectFolder) => theStreamsListTheProjectOpen(streamsLastListedFrom(projectFolder)),
      listedStream: (stream) => streamsLastListed().find((listedStream) => listedStream.stream === stream) ?? null,
    }),
    Layer.succeed(StatusRounds, { requestARound: Effect.sync(() => sharedState.statusPublisher.requestRefresh()) }),
    Layer.succeed(PersonEditingInStudio, { author: sharedState.thePersonEditingInStudio }),
    Layer.succeed(StudioAppVersion, { version: appVersion }),
    tatolabAppLogAsEffectsLogger(sharedState.tatolabAppLog),
  );
}
