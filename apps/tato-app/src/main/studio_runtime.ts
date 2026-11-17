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
import { LOCAL_API_REQUEST_TIMEOUT_MS, RuntimeControl, runtimeControlLayer } from "./tatolab_runtime_control_operation_call.js";
import { CommandRefused } from "./window_command.js";

/** The studio windows, each with its project. */
export class StudioWindows extends Context.Service<
  StudioWindows,
  {
    /** The folder of the project the window a command came from acts on, its own page or a view popped out of it; refused in the Projects window. */
    readonly projectFolderOfTheWindow: (commandFromWindow: TatolabCommandFromWindow) => Effect.Effect<string, CommandRefused>;
  }
>()("tatolab-app/StudioWindows") {}

/** The streams the runtime last listed. */
export class ListedStreams extends Context.Service<
  ListedStreams,
  {
    /** The stream assets of the project in `projectFolder` as the runtime last listed its streams. */
    readonly streamAssetsOfTheProject: (projectFolder: string) => ReadonlySet<string>;
  }
>()("tatolab-app/ListedStreams") {}

/** The person signed in to this computer, the author Studio's graph edits are recorded under. */
export class PersonEditingInStudio extends Context.Service<PersonEditingInStudio, { readonly author: ProjectTransactionAuthor }>()("tatolab-app/PersonEditingInStudio") {}

/** Every service the main process's Effect code runs on. */
export type StudioServices = RuntimeControl | StudioWindows | ListedStreams | PersonEditingInStudio;

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

/** Every service the main process's Effect code runs on, over `sharedState` and the local API at `localApiSocketPath`. */
export function studioRuntimeLayer(sharedState: TatolabAppSharedState, localApiSocketPath: string): Layer.Layer<StudioServices> {
  return Layer.mergeAll(
    runtimeControlLayer(localApiSocketPath, LOCAL_API_REQUEST_TIMEOUT_MS),
    Layer.succeed(StudioWindows, {
      projectFolderOfTheWindow: (commandFromWindow) =>
        fromResult(studioWindowTheCommandCameFrom(sharedState, commandFromWindow), (words) => new CommandRefused({ words })).pipe(
          Effect.map((studioWindow) => studioWindow.projectTransactionsFeed.projectFolder),
        ),
    }),
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: (projectFolder) =>
        new Set(streamsOfTheProjectIn(sharedState.statusPublisher.lastPublishedStatusNow()?.streams ?? [], projectFolder).flatMap((listedStream) => listedStream.location?.stream_asset ?? [])),
    }),
    Layer.succeed(PersonEditingInStudio, { author: sharedState.thePersonEditingInStudio }),
    tatolabAppLogAsEffectsLogger(sharedState.tatolabAppLog),
  );
}
