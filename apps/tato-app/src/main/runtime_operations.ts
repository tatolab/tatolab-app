// Each runtime operation the main process asks for, as an Effect on `RuntimeControl`: the control
// operation or plain request it makes, and the reader that walks its answer into the shape Studio
// keeps. Every one fails with a `RuntimeControlFailure`, an answer its reader cannot read as not the
// contract's type.

import { Effect } from "effect";
import type {
  NodeCatalog,
  ProjectDependency,
  ProjectTheRuntimeNames,
  WorkspaceDependencyUpdate,
  ProjectAssetListing,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectNodeTypeListing,
  ProjectStreamActionQueued,
  ProjectTransaction,
  ProjectTransactionAuthor,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
} from "../shared/tatolab_backend_contract.js";
import { assetPreviewPictureFromTheReadAssetPreviewToolResult, type AssetPreviewPictureTheRuntimeRead } from "./asset_preview_picture_on_the_wire.js";
import { jsonTextKeepingTheWrittenNumbers, prettyJsonTextKeepingTheWrittenNumbers } from "./json_on_the_wire.js";
import { bodyOfAnOkAnswer } from "./local_api_plain_http.js";
import { fromResult } from "./result_as_effect.js";
import { nodeCatalogFromTheRegistryAnswer, nodeCatalogRequestTarget } from "./node_catalog.js";
import { projectAssetListingFromTheListAssetsToolResult } from "./project_asset_listing.js";
import { assetAtItsPathFromTheToolResult, type ProjectAssetAtItsPath } from "./project_changes_on_the_wire.js";
import {
  dependencyUpdateFromTheUpdateDependencyToolResult,
  projectDependencyFromTheAddDependencyToolResult,
  projectDependencyFromTheRemoveDependencyToolResult,
  workspaceDependenciesFromTheListDependenciesToolResult,
  type ListedProjectDependency,
} from "./project_dependencies_on_the_wire.js";
import { projectFilesFromTheListProjectFilesToolResult, type ProjectFileTheRuntimeListed } from "./project_files_on_the_wire.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import { projectNodeTypeListingFromTheToolResult } from "./project_node_type_listing.js";
import { projectTheRuntimeNamesFromTheListAssetsToolResult } from "./project_the_runtime_names.js";
import { projectTransactionFromTheUndoOrRedoToolResult } from "./project_transactions_on_the_wire.js";
import { projectViewsFromTheListProjectViewsToolResult, type ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import { ContractMismatch, type RuntimeControlFailure } from "./runtime_control_failures.js";
import {
  projectStreamActionQueuedFromTheToolResult,
  streamActionCancelAnswerFromTheCancelStreamActionToolResult,
  streamActionDescriptionFromTheDescribeStreamActionToolResult,
} from "./stream_action_description.js";
import { queuedStreamActionFromTheToolResult, streamAssetChangeFromTheToolResult, streamsThePauseOrResumeReachedFromTheToolResult, type StreamAssetChange } from "./stream_changes_on_the_wire.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { authorOnTheWire, controlOperationReadWith, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

/** How many log records one page the window reads holds. */
const PROJECT_LOG_RECORDS_PER_PAGE = 500;

/** One page of the log records of the project in `projectDirectory` after the cursor `after` (`null` for the oldest held) and before the cursor `until` (`null` for none), narrowed as `narrowing` asks, from the runtime's `logs`. */
export function readProjectLogRecords(
  projectDirectory: string,
  narrowing: ProjectLogNarrowing,
  after: string | null,
  until: string | null,
): Effect.Effect<ProjectLogRecordsPage, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "logs",
    {
      project_directory: projectDirectory,
      ...(narrowing.stream === null ? {} : { stream: narrowing.stream }),
      ...(narrowing.action === null ? {} : { action: narrowing.action }),
      ...(after === null ? {} : { after }),
      ...(until === null ? {} : { until }),
      count: PROJECT_LOG_RECORDS_PER_PAGE,
    },
    (answered) => projectLogRecordsPageFromTheLogsToolResult(jsonTextKeepingTheWrittenNumbers(answered)),
  );
}

/** The graph of the loaded stream `stream`, from the runtime's `graph`, its numbers kept as the runtime wrote them. */
export function describeStreamGraph(stream: string): Effect.Effect<StreamGraphSummary, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("graph", { stream }, (answered) => streamGraphSummaryFromTheGraphToolResult(stream, prettyJsonTextKeepingTheWrittenNumbers(answered)));
}

/** Every node type the loaded stream `stream` can add, from `GET /api/registry?stream=`; refused in the runtime's own words. */
export function describeNodeCatalog(stream: string): Effect.Effect<NodeCatalog, RuntimeControlFailure, RuntimeControl> {
  const requestTarget = nodeCatalogRequestTarget(stream);
  return RuntimeControl.use((runtimeControl) => runtimeControl.get(requestTarget)).pipe(
    Effect.flatMap((response) => bodyOfAnOkAnswer(requestTarget, response)),
    Effect.flatMap((registryAnswer) =>
      fromResult(
        nodeCatalogFromTheRegistryAnswer(stream, registryAnswer),
        (why) => new ContractMismatch({ operation: `GET ${requestTarget}`, contractType: "the node registry", direction: "answer", words: why }),
      ),
    ),
  );
}

/** What the project in `projectDirectory`, each import and each installed distribution declare, from the runtime's `list_project_node_types`, read from source without running it. */
export function listProjectNodeTypes(projectDirectory: string): Effect.Effect<ProjectNodeTypeListing, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("list_project_node_types", { project_directory: projectDirectory }, projectNodeTypeListingFromTheToolResult);
}

/** Every asset of the project in `projectDirectory`, its graph documents among them, from the runtime's `list_assets`. */
export function listProjectAssets(projectDirectory: string): Effect.Effect<ProjectAssetListing, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("list_assets", { project_directory: projectDirectory }, projectAssetListingFromTheListAssetsToolResult);
}

/** The stream action `action` ended early through the runtime's `cancel_stream_action`: dropped while queued, stopped at its step while running. */
export function cancelStreamAction(action: string): Effect.Effect<StreamActionCancelAnswer, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("cancel_stream_action", { action }, streamActionCancelAnswerFromTheCancelStreamActionToolResult);
}

/** The removal of every stream the runtime holds of the project in `projectDirectory` queued through its `remove_project`: the id of the action it queued. */
export function removeProject(projectDirectory: string): Effect.Effect<string, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("remove_project", { project_directory: projectDirectory }, (answered) => queuedStreamActionFromTheToolResult("remove_project", answered));
}

/** The open of the closed or never-opened project in `projectDirectory` queued through the runtime's `open_project`, which loads each of its stream assets with its playback stopped. */
export function openProject(projectDirectory: string): Effect.Effect<ProjectStreamActionQueued, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("open_project", { project_directory: projectDirectory }, (answered) => projectStreamActionQueuedFromTheToolResult("open_project", answered));
}

/** The start of the playback of the open project in `projectDirectory` from the graphs it holds, queued through the runtime's `start_playback`. */
export function startPlayback(projectDirectory: string): Effect.Effect<ProjectStreamActionQueued, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("start_playback", { project_directory: projectDirectory }, (answered) => projectStreamActionQueuedFromTheToolResult("start_playback", answered));
}

/** The reload from disk of the open project in `projectDirectory` queued through the runtime's `reload_project`, which keeps its playback and retries its failed streams. */
export function reloadProject(projectDirectory: string): Effect.Effect<ProjectStreamActionQueued, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("reload_project", { project_directory: projectDirectory }, (answered) => projectStreamActionQueuedFromTheToolResult("reload_project", answered));
}

/** Where the stream action `action` is, from the runtime's `describe_stream_action`, or the runtime's words that it no longer holds it. */
export function describeStreamAction(action: string): Effect.Effect<StreamActionFollowed, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("describe_stream_action", { action }, streamActionDescriptionFromTheDescribeStreamActionToolResult).pipe(
    Effect.map((description): StreamActionFollowed => ({ kind: "described", description })),
    Effect.catchTag("RuntimeRefused", (refused) => (refused.byTheOperation ? Effect.succeed<StreamActionFollowed>({ kind: "not_held", words: refused.words }) : Effect.fail(refused))),
  );
}

/** The files of the project in `projectDirectory`, or of its folder `under` alone, from the runtime's `list_project_files`. */
export function listProjectFiles(projectDirectory: string, under: string | null): Effect.Effect<ProjectFileTheRuntimeListed[], RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "list_project_files",
    under === null ? { project_directory: projectDirectory } : { project_directory: projectDirectory, under },
    projectFilesFromTheListProjectFilesToolResult,
  );
}

/** A stream made in the project in `projectDirectory`, its empty graph document at `streamDocumentPath`, shown under `displayName`, through the runtime's `create_stream`, one transaction by `author`. */
export function createStream(projectDirectory: string, streamDocumentPath: string, displayName: string, author: ProjectTransactionAuthor): Effect.Effect<StreamAssetChange, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "create_stream",
    { project_directory: projectDirectory, path: streamDocumentPath, display_name: displayName, author: authorOnTheWire(author) },
    (answered) => streamAssetChangeFromTheToolResult("create_stream", answered),
  );
}

/** The stream asset `streamAsset` of the project in `projectDirectory` shown under `displayName` through the runtime's `set_stream_display_name`, one transaction by `author`. */
export function setStreamDisplayName(projectDirectory: string, streamAsset: string, displayName: string, author: ProjectTransactionAuthor): Effect.Effect<StreamAssetChange, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "set_stream_display_name",
    { project_directory: projectDirectory, stream_asset: streamAsset, display_name: displayName, author: authorOnTheWire(author) },
    (answered) => streamAssetChangeFromTheToolResult("set_stream_display_name", answered),
  );
}

/** The stream asset `streamAsset` deleted from the project in `projectDirectory`, its stream unloaded and forgotten, through the runtime's `delete_stream`, one transaction by `author`. */
export function deleteStream(projectDirectory: string, streamAsset: string, author: ProjectTransactionAuthor): Effect.Effect<StreamAssetChange, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "delete_stream",
    { project_directory: projectDirectory, stream_asset: streamAsset, author: authorOnTheWire(author) },
    (answered) => streamAssetChangeFromTheToolResult("delete_stream", answered),
  );
}

/** The project in `projectDirectory` as the runtime's `list_assets` names it; refused in the runtime's words, as for a folder holding no `tatolab-project.json`. */
export function nameTheProject(projectDirectory: string): Effect.Effect<ProjectTheRuntimeNames, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("list_assets", { project_directory: projectDirectory }, projectTheRuntimeNamesFromTheListAssetsToolResult);
}

/** Each view the project in `projectDirectory` and its imports bring, from the runtime's `list_project_views`. */
export function listProjectViews(projectDirectory: string): Effect.Effect<ProjectViewTheRuntimeListed[], RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("list_project_views", { project_directory: projectDirectory }, projectViewsFromTheListProjectViewsToolResult);
}

/** Each import of the project in `projectDirectory` from the runtime's `list_dependencies`, each source read for a newer version with `checkForNewer`. */
export function listDependencies(projectDirectory: string, checkForNewer: boolean): Effect.Effect<ListedProjectDependency[], RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("list_dependencies", { project_directory: projectDirectory, check_for_newer: checkForNewer }, workspaceDependenciesFromTheListDependenciesToolResult);
}

/** The project in `source`, an absolute folder or `.zip`, copied into `imports/` of the project in `projectDirectory` by the runtime's `add_dependency`. */
export function addDependency(projectDirectory: string, source: string): Effect.Effect<ProjectDependency, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("add_dependency", { project_directory: projectDirectory, source }, projectDependencyFromTheAddDependencyToolResult);
}

/** The import `project` of the project in `projectDirectory` copied again from its source by the runtime's `update_dependency`, overwriting files edited since its copy only with `overwriteEditedFiles`. */
export function updateDependency(projectDirectory: string, project: string, overwriteEditedFiles: boolean): Effect.Effect<WorkspaceDependencyUpdate, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(
    "update_dependency",
    { project_directory: projectDirectory, project, overwrite_edited_files: overwriteEditedFiles },
    dependencyUpdateFromTheUpdateDependencyToolResult,
  );
}

/** The import `project` taken out of the project in `projectDirectory` by the runtime's `remove_dependency`, answering the import it removed. */
export function removeDependency(projectDirectory: string, project: string): Effect.Effect<ProjectDependency, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("remove_dependency", { project_directory: projectDirectory, project }, projectDependencyFromTheRemoveDependencyToolResult);
}

/** The stop of the playback of the project in `projectDirectory` queued through the runtime's `stop_playback`, which keeps each stream's graph loaded: the id of the action it queued. */
export function stopPlayback(projectDirectory: string): Effect.Effect<string, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("stop_playback", { project_directory: projectDirectory }, (answered) => queuedStreamActionFromTheToolResult("stop_playback", answered));
}

/** The playback of the project in `projectDirectory` paused at once through the runtime's `pause_playback`: the id of each stream it paused. */
export function pausePlayback(projectDirectory: string): Effect.Effect<string[], RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("pause_playback", { project_directory: projectDirectory }, (answered) => streamsThePauseOrResumeReachedFromTheToolResult("pause_playback", answered));
}

/** The paused playback of the project in `projectDirectory` resumed at once through the runtime's `resume_playback`: the id of each stream it resumed. */
export function resumePlayback(projectDirectory: string): Effect.Effect<string[], RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("resume_playback", { project_directory: projectDirectory }, (answered) => streamsThePauseOrResumeReachedFromTheToolResult("resume_playback", answered));
}

/** `author`'s latest transaction in the project in `projectDirectory` not undone yet, undone through the runtime's `undo`, or what `author`'s latest undo reversed, redone through its `redo`: the transaction it applied. */
export function undoOrRedo(undoOrRedoTool: "undo" | "redo", projectDirectory: string, author: ProjectTransactionAuthor): Effect.Effect<ProjectTransaction, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith(undoOrRedoTool, { project_directory: projectDirectory, author: authorOnTheWire(author) }, (answered) =>
    projectTransactionFromTheUndoOrRedoToolResult(undoOrRedoTool, answered),
  );
}

/** The asset `asset` of the project in `projectDirectory` put at `toPath`, renamed, moved to another folder or both, through the runtime's `relocate_asset`, one transaction recorded under `author`: the asset at its new path. */
export function relocateAsset(projectDirectory: string, asset: string, toPath: string, author: ProjectTransactionAuthor): Effect.Effect<ProjectAssetAtItsPath, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("relocate_asset", { project_directory: projectDirectory, asset, to_path: toPath, author: authorOnTheWire(author) }, (answered) =>
    assetAtItsPathFromTheToolResult("relocate_asset", answered),
  );
}

/** The asset `asset` of the project in `projectDirectory` no longer tracked through the runtime's `delete_asset`, its file and sidecar leaving the project, one transaction recorded under `author`: the asset as it was. */
export function deleteAsset(projectDirectory: string, asset: string, author: ProjectTransactionAuthor): Effect.Effect<ProjectAssetAtItsPath, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("delete_asset", { project_directory: projectDirectory, asset, author: authorOnTheWire(author) }, (answered) => assetAtItsPathFromTheToolResult("delete_asset", answered));
}

/** The preview picture of the asset `asset` of the project in `projectDirectory`, an image's own or a video's poster frame, from the runtime's `read_asset_preview`. */
export function readAssetPreview(projectDirectory: string, asset: string): Effect.Effect<AssetPreviewPictureTheRuntimeRead, RuntimeControlFailure, RuntimeControl> {
  return controlOperationReadWith("read_asset_preview", { project_directory: projectDirectory, asset }, (answered) => assetPreviewPictureFromTheReadAssetPreviewToolResult(asset, answered));
}
