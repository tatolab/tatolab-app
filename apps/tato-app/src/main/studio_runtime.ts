// The services the main process's Effect code runs on, and the one layer `startTatolabApp` builds
// its runtime from. A collaborator not converted yet reaches Effect code as a small service over a
// member of the shared state, holding only what a converted handler reads. Effect's logs go to the
// app's log, never to the console.

import { Cause, Context, Effect, Layer, Logger, type LogLevel } from "effect";
import type { ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { streamsOfTheProjectIn } from "../shared/project_playback.js";
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
  }
>()("tatolab-app/ListedStreams") {}

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
export type StudioServices = RuntimeControl | StudioWindows | ProjectViewsListed | ListedStreams | StatusRounds | PersonEditingInStudio | StudioAppVersion;

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

/** Effect's logger, replaced by one writing each log to `tatolabAppLog`: its first part as the message, any further parts as `details`, and a cause as `cause`. */
export function tatolabAppLogAsEffectsLogger(tatolabAppLog: TatolabAppLog): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message, logLevel, cause }) => {
      const [firstPart, ...furtherParts]: readonly unknown[] = Array.isArray(message) ? message : [message];
      const fields: TatolabAppLogFields = {
        ...(furtherParts.length > 0 ? { details: furtherParts.map((part) => String(part)).join(" ") } : {}),
        ...(cause.reasons.length > 0 ? { cause: Cause.pretty(cause) } : {}),
      };
      const level = tatolabAppLogLevelOf(logLevel);
      if (level !== null) tatolabAppLog[level](String(firstPart), fields);
    }),
  ]);
}

/** Every service the main process's Effect code runs on, over `sharedState`, the local API at `localApiSocketPath` and this copy's `appVersion`. */
export function studioRuntimeLayer(sharedState: TatolabAppSharedState, localApiSocketPath: string, appVersion: string): Layer.Layer<StudioServices> {
  const streamsLastListedFrom = (projectFolder: string) => streamsOfTheProjectIn(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectFolder);
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
    Layer.succeed(ProjectViewsListed, {
      isListedAsOpening: (openProjectFolder, viewFolderInTheProject) => sharedState.projectViewsListed.isListedAsOpening(openProjectFolder, viewFolderInTheProject),
    }),
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: (projectFolder) => new Set(streamsLastListedFrom(projectFolder).flatMap((listedStream) => listedStream.location?.stream_asset ?? [])),
      aStreamIsListedFrom: (projectFolder) => streamsLastListedFrom(projectFolder).length > 0,
    }),
    Layer.succeed(StatusRounds, { requestARound: Effect.sync(() => sharedState.statusPublisher.requestRefresh()) }),
    Layer.succeed(PersonEditingInStudio, { author: sharedState.thePersonEditingInStudio }),
    Layer.succeed(StudioAppVersion, { version: appVersion }),
    tatolabAppLogAsEffectsLogger(sharedState.tatolabAppLog),
  );
}
