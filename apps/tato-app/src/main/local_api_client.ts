// The app's client of the runtime's local API. Every control operation is one `POST /control` through
// the generated `@tatolab/runtime-client`, typed by the contract the runtime unit carries; `GET
// /health` says the runtime is up, `GET /api/graph` names the machine, and `GET /api/registry` lists
// the node types a stream can add, each one short HTTP/1.1 request over the local API's Unix socket.

import { isUtf8 } from "node:buffer";
import net from "node:net";
import type {
  JsonValue,
  ProjectDependency,
  WorkspaceDependencyUpdate,
  ListedStream,
  NodeCatalog,
  ProjectNodeTypeListing,
  ProjectAssetListing,
  ProjectCreationQueued,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectStreamActionQueued,
  ProjectTheRuntimeNames,
  ProjectTransaction,
  ProjectTransactionAuthor,
  GraphEditMode,
  ProjectGraphTransactionTheRuntimeAnswered,
  StreamGraphAction,
  RuntimeDescription,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
  StreamLocation,
} from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  holdEachNumberAsItsWrittenDigits,
  jsonTextKeepingTheWrittenNumbers,
  prettyJsonTextKeepingTheWrittenNumbers,
  everyOneRead,
  isAJsonObject,
  jsonObject,
  type JsonObjectOnTheWire,
  optionalObject,
  optionalText,
  optionalUnsignedInteger,
  parseJsonOnTheWire,
  requiredArray,
  requiredObject,
  requiredText,
  requiredUnsignedInteger,
  toolResultReadWith,
} from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import {
  callOneControlOperationOverAPost,
  durationAsTheTimeoutFailureSpellsIt,
  type ControlOperationAnswer,
  type ControlOperationMethodName,
  type ControlOperationParams,
  type ControlOperationResultReviver,
} from "./tatolab_runtime_control_operation_call.js";
import { nodeCatalogFromTheRegistryAnswer, nodeCatalogRequestTarget } from "./node_catalog.js";
import { projectNodeTypeListingFromTheToolResult } from "./project_node_type_listing.js";
import { projectAssetListingFromTheListAssetsToolResult } from "./project_asset_listing.js";
import { assetPreviewPictureFromTheReadAssetPreviewToolResult, type AssetPreviewPictureTheRuntimeRead } from "./asset_preview_picture_on_the_wire.js";
import {
  duplicateFromTheDuplicateProjectToolResult,
  projectFromTheImportProjectToolResult,
  assetAtItsPathFromTheToolResult,
  projectSettingsFromTheToolResult,
  type ProjectAssetAtItsPath,
  type ProjectSettingsAfterTheTransaction,
  type ProjectSettingsTool,
} from "./project_changes_on_the_wire.js";
import { projectSummaryFromTheListAssetsToolResult, projectTheRuntimeNamesFromTheListAssetsToolResult, type ProjectSummaryTheRuntimeServes } from "./project_the_runtime_names.js";
import {
  projectActionRefusalOnTheWire,
  projectTransactionFromTheUndoOrRedoToolResult,
  transactionsResourceUriFromTheListAssetsToolResult,
} from "./project_transactions_on_the_wire.js";
import { projectGraphTransactionFromTheTransactToolResult } from "./project_graph_transaction_on_the_wire.js";
import {
  projectFileBytesFromTheReadProjectFileToolResult,
  projectFilesFromTheListProjectFilesToolResult,
  projectFileWriteFromTheWriteProjectFileToolResult,
  nodeFileCreationFromTheCreateNodeFileToolResult,
  type NodeFileCreationRecorded,
  type ProjectFileTheRuntimeListed,
  type ProjectFileWriteRecorded,
} from "./project_files_on_the_wire.js";
import {
  projectViewsFromTheListProjectViewsToolResult,
  studioViewOutputFromTheWriteStudioViewOutputToolResult,
  type ProjectViewTheRuntimeListed,
  type StudioViewOutputWritten,
} from "./project_views_on_the_wire.js";
import { graphInputWrittenFromTheWriteGraphInputToolResult, type GraphInputWritten } from "./graph_input_written_on_the_wire.js";
import {
  dependencyUpdateFromTheUpdateDependencyToolResult,
  type ListedProjectDependency,
  projectDependencyFromTheAddDependencyToolResult,
  workspaceDependenciesFromTheListDependenciesToolResult,
} from "./project_dependencies_on_the_wire.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import {
  projectCreationQueuedFromTheCreateProjectToolResult,
  projectStreamActionQueuedFromTheToolResult,
  type ProjectStreamActionToolName,
  streamActionCancelAnswerFromTheCancelStreamActionToolResult,
  streamActionDescriptionFromTheDescribeStreamActionToolResult,
} from "./stream_action_description.js";

/** The most bytes one plain HTTP answer of the local API may carry before the client gives up on it. */
const LARGEST_LOCAL_API_RESPONSE_BYTES = 8 * 1024 * 1024;

/** How long `list_project_node_types` may go without a byte: the runtime bounds the project's interpreter reading its source at 60 seconds, and answers its refusal soon after. */
const PROJECT_NODE_TYPE_LISTING_RESPONSE_TIMEOUT_MS = 65_000;

/** How long a dependency tool may go without a byte: an add or an update locks the project's Python requirements with uv, which may resolve them over the network, and a check for newer versions reads every source. */
const PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS = 180_000;

/** How long a tool that copies a whole project may go without a byte: a duplicate copies its files and history, an import unpacks a `.zip`. */
const FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS = 120_000;

/** A stream's `location` on the wire: `project_directory`, its project's UUID as `project` and its stream asset's UUID as `stream_asset`. */
function streamLocationOnTheWire(location: JsonObjectOnTheWire): Result<StreamLocation, string> {
  const projectDirectory = requiredText(location, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(location, "project");
  if (!project.ok) return project;
  const streamAsset = requiredText(location, "stream_asset");
  if (!streamAsset.ok) return streamAsset;
  return succeeded({ project_directory: projectDirectory.value, project: project.value, stream_asset: streamAsset.value });
}

/** The stream-asset tools that change one stream asset as one transaction on the project's history. */
export type StreamAssetChangeToolName = "create_stream" | "set_stream_display_name" | "delete_stream";

/** What `create_stream`, `set_stream_display_name` and `delete_stream` answer: the stream asset's UUID as `asset.asset`, the one transaction that changed it, and its commit on the project's history. */
export interface StreamAssetChange {
  stream_asset: string;
  transaction: string;
  commit: string;
}

/** A stream-asset tool's result read field for field; unknown fields, the rest of the asset and a `create_stream`'s load `action` among them, are ignored. */
export function streamAssetChangeFromTheToolResult(toolName: StreamAssetChangeToolName, operationResult: unknown): Result<StreamAssetChange, string> {
  const toolResult = jsonObject(operationResult, `the ${toolName} result`);
  const streamAssetChange = toolResult.ok ? streamAssetChangeOnTheWire(toolResult.value) : toolResult;
  return streamAssetChange.ok ? streamAssetChange : failedWith(`the runtime's ${toolName} result could not be read: ${streamAssetChange.failure}`);
}

function streamAssetChangeOnTheWire(toolResult: JsonObjectOnTheWire): Result<StreamAssetChange, string> {
  const assetOnTheWire = requiredObject(toolResult, "asset");
  if (!assetOnTheWire.ok) return assetOnTheWire;
  const streamAsset = requiredText(assetOnTheWire.value, "asset");
  if (!streamAsset.ok) return streamAsset;
  const transaction = requiredText(toolResult, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(toolResult, "commit");
  if (!commit.ok) return commit;
  return succeeded({ stream_asset: streamAsset.value, transaction: transaction.value, commit: commit.value });
}

/** A `describe_runtime` tool result read field for field; unknown fields are ignored. */
export function runtimeDescriptionFromTheDescribeRuntimeToolResult(operationResult: unknown): Result<RuntimeDescription, string> {
  const toolResult = jsonObject(operationResult, "the describe_runtime result");
  const runtimeDescription = toolResult.ok ? runtimeDescriptionOnTheWire(toolResult.value) : toolResult;
  return runtimeDescription.ok ? runtimeDescription : failedWith(`the runtime's describe_runtime result could not be read: ${runtimeDescription.failure}`);
}

function runtimeDescriptionOnTheWire(toolResult: JsonObjectOnTheWire): Result<RuntimeDescription, string> {
  const version = requiredText(toolResult, "version");
  if (!version.ok) return version;
  const buildId = requiredText(toolResult, "build_id");
  if (!buildId.ok) return buildId;
  const upForMs = requiredUnsignedInteger(toolResult, "up_for_ms");
  if (!upForMs.ok) return upForMs;
  const runtimeLogDirectory = optionalText(toolResult, "runtime_log_directory");
  if (!runtimeLogDirectory.ok) return runtimeLogDirectory;
  return succeeded({ version: version.value, build_id: buildId.value, up_for_ms: upForMs.value, runtime_log_directory: runtimeLogDirectory.value });
}

/** One HTTP response as the client read it. */
export interface LocalApiHttpResponse {
  statusCode: number;
  body: Buffer;
}

/** One HTTP request header, as name and value. */
type HttpRequestHeader = readonly [headerName: string, headerValue: string];

/** Every stream a `list_streams` tool result lists. A stream's unknown state is kept as spelled, a `null` location is an earlier runtime's record, and unknown fields are ignored. */
export function listedStreamsFromTheListStreamsToolResult(operationResult: unknown): Result<ListedStream[], string> {
  const listedStreams = listedStreamsFromTheParsedToolResult(operationResult);
  return listedStreams.ok ? listedStreams : failedWith(`the runtime's list_streams result could not be read: ${listedStreams.failure}`);
}

function listedStreamsFromTheParsedToolResult(operationResult: unknown): Result<ListedStream[], string> {
  const toolResult = jsonObject(operationResult, "the list_streams result");
  if (!toolResult.ok) return toolResult;
  const streams = toolResult.value["streams"];
  if (streams === undefined) return failedWith("missing field `streams`");
  if (!Array.isArray(streams)) return failedWith("`streams` is not an array");
  return everyOneRead(streams, listedStreamOnTheWire);
}

function listedStreamOnTheWire(listedStreamOnTheWire: unknown): Result<ListedStream, string> {
  const listedStream = jsonObject(listedStreamOnTheWire, "a stream");
  if (!listedStream.ok) return listedStream;
  const stream = requiredText(listedStream.value, "stream");
  if (!stream.ok) return stream;
  const displayName = requiredText(listedStream.value, "display_name");
  if (!displayName.ok) return displayName;
  const locationOnTheWire = optionalObject(listedStream.value, "location");
  if (!locationOnTheWire.ok) return locationOnTheWire;
  const location = locationOnTheWire.value === null ? succeeded(null) : streamLocationOnTheWire(locationOnTheWire.value);
  if (!location.ok) return location;
  const state = requiredText(listedStream.value, "state");
  if (!state.ok) return state;
  const nodeCount = optionalUnsignedInteger(listedStream.value, "node_count");
  if (!nodeCount.ok) return nodeCount;
  const failedBecause = optionalText(listedStream.value, "failed_because");
  if (!failedBecause.ok) return failedBecause;
  const captureDevicesWhoseAccessWasNeverAskedFor = captureDevicesWhoseAccessWasNeverAskedForOnTheWire(listedStream.value);
  if (!captureDevicesWhoseAccessWasNeverAskedFor.ok) return captureDevicesWhoseAccessWasNeverAskedFor;
  const action = optionalText(listedStream.value, "action");
  if (!action.ok) return action;
  const step = optionalText(listedStream.value, "step");
  if (!step.ok) return step;
  return succeeded({
    stream: stream.value,
    display_name: displayName.value,
    location: location.value,
    state: state.value,
    node_count: nodeCount.value,
    failed_because: failedBecause.value,
    capture_devices_whose_access_was_never_asked_for: captureDevicesWhoseAccessWasNeverAskedFor.value,
    action: action.value,
    step: step.value,
  });
}

/** The capture devices a listed stream waits on an access nobody has asked for, each kept as spelled; none when the field is absent. */
function captureDevicesWhoseAccessWasNeverAskedForOnTheWire(listedStream: JsonObjectOnTheWire): Result<string[], string> {
  const key = "capture_devices_whose_access_was_never_asked_for";
  const captureDevices = arrayOrEmpty(listedStream, key);
  if (!captureDevices.ok) return captureDevices;
  return everyOneRead(captureDevices.value, (captureDevice) => (typeof captureDevice === "string" ? succeeded(captureDevice) : failedWith(`\`${key}\` holds a value that is not a string`)));
}

/** The action id a tool result that queued a stream action names, read from the result of `toolName`. */
export function queuedStreamActionFromTheToolResult(toolName: ProjectActionToolName, operationResult: unknown): Result<string, string> {
  const toolResult = jsonObject(operationResult, `the ${toolName} result`);
  const action = toolResult.ok ? requiredText(toolResult.value, "action") : toolResult;
  return action.ok ? action : failedWith(`the runtime's ${toolName} result could not be read: ${action.failure}`);
}

/** A runtime tool that pauses or resumes a whole project's playback at once, queueing no action. */
type ProjectPlaybackPauseOrResumeToolName = "pause_playback" | "resume_playback";

/** The id of each stream a `pause_playback` or `resume_playback` result names under `streams`, read from the result of `toolName`. */
export function streamsThePauseOrResumeReachedFromTheToolResult(toolName: ProjectPlaybackPauseOrResumeToolName, operationResult: unknown): Result<string[], string> {
  return toolResultReadWith(toolName, operationResult, (toolResult) => {
    const streams = requiredArray(toolResult, "streams");
    if (!streams.ok) return streams;
    return everyOneRead(streams.value, (stream) => (typeof stream === "string" ? succeeded(stream) : failedWith("`streams` holds a value that is not a string")));
  });
}

/** A runtime tool that queues an action on a whole project. */
type ProjectActionToolName = "stop_playback" | "close_project" | "remove_project" | "delete_project";

/** A client of the local API served at one socket path. */
export class LocalApiClient {
  /** A client of the local API at `localApiSocketPath`, giving up on a request unanswered after `requestTimeoutMs`. */
  constructor(
    private readonly localApiSocketPath: string,
    private readonly requestTimeoutMs: number,
  ) {}

  /** Whether the runtime answers `GET /health` with `ok`. */
  async checkHealth(): Promise<Result<void, LocalApiRequestFailure>> {
    const response = await this.sendOneHttpRequestAndReadItsResponse("GET", "/health", [], null);
    if (!response.ok) return response;
    const body = response.value.body.toString("utf8").trim();
    if (response.value.statusCode === 200 && body === "ok") return succeeded(undefined);
    return localApiRequestFailure(`the runtime at ${this.localApiSocketPath} answered /health with ${response.value.statusCode}: ${body}`);
  }

  /** How the running runtime describes itself, from its `describe_runtime` tool. */
  async describeRuntime(): Promise<Result<RuntimeDescription, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("describe_runtime", {});
    if (!operationResult.ok) return operationResult;
    const runtimeDescription = runtimeDescriptionFromTheDescribeRuntimeToolResult(operationResult.value);
    return runtimeDescription.ok ? runtimeDescription : localApiRequestFailure(runtimeDescription.failure);
  }

  /** Every stream the runtime holds, from its `list_streams` tool. */
  async listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_streams", {});
    if (!operationResult.ok) return operationResult;
    const listedStreams = listedStreamsFromTheListStreamsToolResult(operationResult.value);
    return listedStreams.ok ? listedStreams : localApiRequestFailure(listedStreams.failure);
  }

  /** This machine's name, as `GET /api/graph` states it beside every loaded stream's graph. */
  async machineName(): Promise<Result<string, LocalApiRequestFailure>> {
    const graphBody = await this.getBodyOfAnOkAnswer("/api/graph");
    if (!graphBody.ok) return graphBody;
    const graph = parseJsonOnTheWire(graphBody.value.toString("utf8"));
    const machine = graph.ok ? (isAJsonObject(graph.value) ? requiredText(graph.value, "machine") : failedWith("the graph is not an object")) : graph;
    return machine.ok ? machine : localApiRequestFailure(`the runtime's /api/graph names no machine: ${machine.failure}`);
  }

  /** Up to `count` of the log records of the project in `projectDirectory` after the cursor `after` (`null` for the oldest held), narrowed as `narrowing` asks, from the runtime's `logs` tool. */
  async readProjectLogRecords(
    projectDirectory: string,
    narrowing: ProjectLogNarrowing,
    after: string | null,
    count: number,
  ): Promise<Result<ProjectLogRecordsPage, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(
      "logs",
      {
        project_directory: projectDirectory,
        ...(narrowing.stream === null ? {} : { stream: narrowing.stream }),
        ...(narrowing.action === null ? {} : { action: narrowing.action }),
        ...(after === null ? {} : { after }),
        count,
      },
      this.requestTimeoutMs,
      holdEachNumberAsItsWrittenDigits,
    );
    if (!operationResult.ok) return operationResult;
    const page = projectLogRecordsPageFromTheLogsToolResult(jsonTextKeepingTheWrittenNumbers(operationResult.value));
    return page.ok ? page : localApiRequestFailure(page.failure);
  }

  /** Queue the stop of the playback of the project in `projectDirectory`, which keeps each stream's graph loaded, answering the id of the action it queued; refused in the runtime's own words, as when none of them plays. */
  stopPlayback(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("stop_playback", { project_directory: projectDirectory });
  }

  /** Pause the playback of the project in `projectDirectory` at once, answering the id of each stream it paused; refused in the runtime's own words, as when none of them plays. */
  pausePlayback(projectDirectory: string): Promise<Result<string[], LocalApiRequestFailure>> {
    return this.pauseOrResumeThePlayback("pause_playback", projectDirectory);
  }

  /** Resume the paused playback of the project in `projectDirectory` at once, answering the id of each stream it resumed; refused in the runtime's own words, as for a project that is not paused. */
  resumePlayback(projectDirectory: string): Promise<Result<string[], LocalApiRequestFailure>> {
    return this.pauseOrResumeThePlayback("resume_playback", projectDirectory);
  }

  private async pauseOrResumeThePlayback(toolName: ProjectPlaybackPauseOrResumeToolName, projectDirectory: string): Promise<Result<string[], LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const streams = streamsThePauseOrResumeReachedFromTheToolResult(toolName, operationResult.value);
    return streams.ok ? streams : localApiRequestFailure(streams.failure);
  }

  /** Queue the close of the open project in `projectDirectory`, which ends its playback and unloads every stream of it, answering the id of the action it queued; refused in the runtime's own words, as for a project that is not open. */
  closeProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("close_project", { project_directory: projectDirectory });
  }

  /** Queue the removal of every stream the runtime holds from the project in `projectDirectory`, answering the id of the action it queued; refused in the runtime's own words. */
  removeProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("remove_project", { project_directory: projectDirectory });
  }

  /** Queue the deletion of the project in `projectDirectory`: its streams unloaded and forgotten, then its folder moved to the Trash; answers the id of the action it queued, refused in the runtime's own words. */
  deleteProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("delete_project", { project_directory: projectDirectory });
  }

  /** Name the project in `projectDirectory` `name` through the runtime's `rename_project`, one transaction on its history; answers its name now, refused in the runtime's own words, as for a blank name. */
  async renameProject(projectDirectory: string, name: string): Promise<Result<string, LocalApiRequestFailure>> {
    const settings = await this.changeProjectSettings("rename_project", { project_directory: projectDirectory, name });
    return settings.ok ? succeeded(settings.value.name) : settings;
  }

  /** Describe the project in `projectDirectory` as `description` through `set_project_description`, one transaction on its history; `null` or a blank one clears it, refused in the runtime's own words. */
  setProjectDescription(projectDirectory: string, description: string | null): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>> {
    return this.changeProjectSettings("set_project_description", { project_directory: projectDirectory, description });
  }

  /** Show the project in `projectDirectory` by the media asset `cover`, a UUID it holds, through `set_project_cover`, one transaction on its history; `null` clears it, refused in the runtime's own words. */
  setProjectCover(projectDirectory: string, cover: string | null): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>> {
    return this.changeProjectSettings("set_project_cover", { project_directory: projectDirectory, cover });
  }

  /** Copy the file at `source`, an absolute path on this machine, into the project in `projectDirectory` as an asset through `import_asset`, the kind its extension implies, at `assetPath` or, for `null`, in its kind's folder under its own name numbered past a name already taken; recorded under `author` or, for `null`, the runtime's own; refused in the runtime's own words. */
  async importAsset(projectDirectory: string, source: string, assetPath: string | null, author: ProjectTransactionAuthor | null): Promise<Result<ProjectAssetAtItsPath, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(
      "import_asset",
      { project_directory: projectDirectory, source, ...(assetPath === null ? {} : { asset_path: assetPath }), ...(author === null ? {} : { author: authorOnTheWire(author) }) },
      FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS,
    );
    if (!operationResult.ok) return operationResult;
    const imported = assetAtItsPathFromTheToolResult("import_asset", operationResult.value);
    return imported.ok ? imported : localApiRequestFailure(imported.failure);
  }

  /** Put the asset `asset` of the project in `projectDirectory` at `toPath`, renaming it, moving it to another folder or both, through `relocate_asset`, one transaction recorded under `author`; answers it at its new path, refused in the runtime's own words. */
  async relocateAsset(projectDirectory: string, asset: string, toPath: string, author: ProjectTransactionAuthor): Promise<Result<ProjectAssetAtItsPath, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("relocate_asset", { project_directory: projectDirectory, asset, to_path: toPath, author: authorOnTheWire(author) });
    if (!operationResult.ok) return operationResult;
    const relocated = assetAtItsPathFromTheToolResult("relocate_asset", operationResult.value);
    return relocated.ok ? relocated : localApiRequestFailure(relocated.failure);
  }

  /** Stop tracking the asset `asset` of the project in `projectDirectory` through `delete_asset`, its file and sidecar leaving the project, one transaction recorded under `author`; answers it as it was, refused in the runtime's own words, as while a stream's graph document references it. */
  async deleteAsset(projectDirectory: string, asset: string, author: ProjectTransactionAuthor): Promise<Result<ProjectAssetAtItsPath, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("delete_asset", { project_directory: projectDirectory, asset, author: authorOnTheWire(author) });
    if (!operationResult.ok) return operationResult;
    const deleted = assetAtItsPathFromTheToolResult("delete_asset", operationResult.value);
    return deleted.ok ? deleted : localApiRequestFailure(deleted.failure);
  }

  /** Copy the project in `projectDirectory` with its history into `into`, a folder that does not exist yet, as a project of its own; refused in the runtime's own words. */
  async duplicateProject(projectDirectory: string, into: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("duplicate_project", { project_directory: projectDirectory, into }, FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS);
    if (!operationResult.ok) return operationResult;
    const duplicate = duplicateFromTheDuplicateProjectToolResult(operationResult.value);
    return duplicate.ok ? duplicate : localApiRequestFailure(duplicate.failure);
  }

  /** Make a project in `projectDirectory`, a folder that does not exist yet, from `source`, an absolute `.zip` of one, through the runtime's `import_project`; runs nothing, refused in the runtime's own words. */
  async importProject(source: string, projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("import_project", { source, project_directory: projectDirectory }, FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS);
    if (!operationResult.ok) return operationResult;
    const imported = projectFromTheImportProjectToolResult(operationResult.value);
    return imported.ok ? imported : localApiRequestFailure(imported.failure);
  }

  /** Call `toolName`, one of the operations that change how people see a project, answering its settings after the transaction; refused in the runtime's own words. */
  private async changeProjectSettings<SettingsOperation extends ProjectSettingsTool>(
    toolName: SettingsOperation,
    toolArguments: ControlOperationParams<SettingsOperation>,
  ): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, toolArguments);
    if (!operationResult.ok) return operationResult;
    const settings = projectSettingsFromTheToolResult(toolName, operationResult.value);
    return settings.ok ? settings : localApiRequestFailure(settings.failure);
  }

  /** Call the tool `toolName` that queues an action, answering the id of the action the runtime queued; refused in the runtime's own words. */
  private async queueRuntimeAction(
    toolName: ProjectActionToolName,
    toolArguments: ControlOperationParams<ProjectActionToolName>,
  ): Promise<Result<string, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, toolArguments);
    if (!operationResult.ok) return operationResult;
    const action = queuedStreamActionFromTheToolResult(toolName, operationResult.value);
    return action.ok ? action : localApiRequestFailure(action.failure);
  }

  /** Make a stream in the project in `projectDirectory`, its empty graph document at `streamDocumentPath`, shown under `displayName`, through the runtime's `create_stream`, one transaction by `author`; refused in the runtime's own words. */
  createStream(projectDirectory: string, streamDocumentPath: string, displayName: string, author: ProjectTransactionAuthor): Promise<Result<StreamAssetChange, LocalApiRequestFailure>> {
    return this.changeOneStreamAsset("create_stream", { project_directory: projectDirectory, path: streamDocumentPath, display_name: displayName, author: authorOnTheWire(author) });
  }

  /** Show the stream asset `streamAsset` of the project in `projectDirectory` under `displayName` through the runtime's `set_stream_display_name`, one transaction by `author`; refused in the runtime's own words. */
  setStreamDisplayName(projectDirectory: string, streamAsset: string, displayName: string, author: ProjectTransactionAuthor): Promise<Result<StreamAssetChange, LocalApiRequestFailure>> {
    return this.changeOneStreamAsset("set_stream_display_name", { project_directory: projectDirectory, stream_asset: streamAsset, display_name: displayName, author: authorOnTheWire(author) });
  }

  /** Delete the stream asset `streamAsset` from the project in `projectDirectory`, its stream unloaded and forgotten, through the runtime's `delete_stream`, one transaction by `author`; refused in the runtime's own words. */
  deleteStream(projectDirectory: string, streamAsset: string, author: ProjectTransactionAuthor): Promise<Result<StreamAssetChange, LocalApiRequestFailure>> {
    return this.changeOneStreamAsset("delete_stream", { project_directory: projectDirectory, stream_asset: streamAsset, author: authorOnTheWire(author) });
  }

  private async changeOneStreamAsset<StreamAssetOperation extends StreamAssetChangeToolName>(
    toolName: StreamAssetOperation,
    toolArguments: ControlOperationParams<StreamAssetOperation>,
  ): Promise<Result<StreamAssetChange, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, toolArguments);
    if (!operationResult.ok) return operationResult;
    const streamAssetChange = streamAssetChangeFromTheToolResult(toolName, operationResult.value);
    return streamAssetChange.ok ? streamAssetChange : localApiRequestFailure(streamAssetChange.failure);
  }

  /** Queue the creation of a new project in `projectDirectory`, or with `null` in a folder the runtime draws under `~/streams`, and its run; answered at once, refused in the runtime's own words. */
  async createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("create_project", projectDirectory === null ? {} : { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const queued = projectCreationQueuedFromTheCreateProjectToolResult(operationResult.value);
    return queued.ok ? queued : localApiRequestFailure(queued.failure);
  }

  /** Queue the open of the closed or never-opened project in `projectDirectory`, which loads every stream asset in it with its playback stopped; answered at once, refused in the runtime's own words, as for an open project, which `reloadProject` re-reads. */
  openProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.queueAProjectStreamAction("open_project", projectDirectory);
  }

  /** Queue the start of the playback of the open project in `projectDirectory` from the graphs it holds; answered at once, refused in the runtime's own words, as for a project that is not open or already plays. */
  startPlayback(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.queueAProjectStreamAction("start_playback", projectDirectory);
  }

  /** Queue the reload from disk of the open project in `projectDirectory`, which keeps its playback and retries its failed streams; answered at once, refused in the runtime's own words, as for a project that is not open, which `openProject` opens. */
  reloadProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.queueAProjectStreamAction("reload_project", projectDirectory);
  }

  private async queueAProjectStreamAction(
    toolName: ProjectStreamActionToolName,
    projectDirectory: string,
  ): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const queued = projectStreamActionQueuedFromTheToolResult(toolName, operationResult.value);
    return queued.ok ? queued : localApiRequestFailure(queued.failure);
  }

  /** Where the stream action `action` is: its state and step, and the streams it took in; refused in the runtime's own words, as for an action it no longer holds. */
  async describeStreamAction(action: string): Promise<Result<StreamActionFollowed, LocalApiRequestFailure>> {
    const operationAnswer = await this.callControlOperationKeepingItsRefusal("describe_stream_action", { action });
    if (!operationAnswer.ok) return operationAnswer;
    if (operationAnswer.value.kind === "refused_by_the_operation") return succeeded({ kind: "not_held", words: operationAnswer.value.words });
    const description = streamActionDescriptionFromTheDescribeStreamActionToolResult(operationAnswer.value.result);
    return description.ok ? succeeded({ kind: "described", description: description.value }) : localApiRequestFailure(description.failure);
  }

  /** End the stream action `action` early through the runtime's `cancel_stream_action`: dropped while queued, stopped at its step while running; refused in the runtime's own words, as for a stop past cancelling. */
  async cancelStreamAction(action: string): Promise<Result<StreamActionCancelAnswer, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("cancel_stream_action", { action });
    if (!operationResult.ok) return operationResult;
    const answer = streamActionCancelAnswerFromTheCancelStreamActionToolResult(operationResult.value);
    return answer.ok ? answer : localApiRequestFailure(answer.failure);
  }

  /** The graph of the loaded stream `stream` from the runtime's `graph` operation, its numbers kept as the runtime wrote them. */
  async describeStreamGraph(stream: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("graph", { stream }, this.requestTimeoutMs, holdEachNumberAsItsWrittenDigits);
    if (!operationResult.ok) return operationResult;
    const summary = streamGraphSummaryFromTheGraphToolResult(stream, prettyJsonTextKeepingTheWrittenNumbers(operationResult.value));
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** Every node type the loaded stream `stream` can add, from `GET /api/registry?stream=`; refused in the runtime's own words. */
  async describeNodeCatalog(stream: string): Promise<Result<NodeCatalog, LocalApiRequestFailure>> {
    const registryBody = await this.getBodyOfAnOkAnswer(nodeCatalogRequestTarget(stream));
    if (!registryBody.ok) return registryBody;
    const nodeCatalog = nodeCatalogFromTheRegistryAnswer(stream, registryBody.value.toString("utf8"));
    return nodeCatalog.ok ? nodeCatalog : localApiRequestFailure(nodeCatalog.failure);
  }

  /** What the project in `projectDirectory`, each import and each installed distribution declare, from the runtime's `list_project_node_types`, read from source without running it; refused in the runtime's own words. */
  async listProjectNodeTypes(projectDirectory: string): Promise<Result<ProjectNodeTypeListing, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_project_node_types", { project_directory: projectDirectory }, PROJECT_NODE_TYPE_LISTING_RESPONSE_TIMEOUT_MS);
    if (!operationResult.ok) return operationResult;
    const listing = projectNodeTypeListingFromTheToolResult(operationResult.value);
    return listing.ok ? listing : localApiRequestFailure(listing.failure);
  }

  /** Every asset of the project in `projectDirectory`, its graph documents among them, from the runtime's `list_assets`; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  async listProjectAssets(projectDirectory: string): Promise<Result<ProjectAssetListing, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_assets", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const listing = projectAssetListingFromTheListAssetsToolResult(operationResult.value);
    return listing.ok ? listing : localApiRequestFailure(listing.failure);
  }

  /** The change feed's resource of the project in `projectDirectory`, as the runtime's `list_assets` names it under `transactions_resource_uri`; refused in the runtime's own words. */
  async nameTheChangeFeedOfTheProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_assets", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const uri = transactionsResourceUriFromTheListAssetsToolResult(operationResult.value);
    return uri.ok ? uri : localApiRequestFailure(uri.failure);
  }

  /** The preview picture of the asset `asset` of the project in `projectDirectory`, an image's own or a video's poster frame, through `read_asset_preview`; refused in the runtime's own words, as for an asset with none or whose bytes it is still reading. */
  async readAssetPreview(projectDirectory: string, asset: string): Promise<Result<AssetPreviewPictureTheRuntimeRead, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("read_asset_preview", { project_directory: projectDirectory, asset });
    if (!operationResult.ok) return operationResult;
    const picture = assetPreviewPictureFromTheReadAssetPreviewToolResult(asset, operationResult.value);
    return picture.ok ? picture : localApiRequestFailure(picture.failure);
  }

  /** The project in `projectDirectory` as the runtime's `list_assets` names it; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  async nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_assets", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const project = projectTheRuntimeNamesFromTheListAssetsToolResult(operationResult.value);
    return project.ok ? project : localApiRequestFailure(project.failure);
  }

  /** The project in `projectDirectory` as its card shows it, from `list_assets`: its name, description and last edit; refused in the runtime's own words. */
  async summarizeTheProject(projectDirectory: string): Promise<Result<ProjectSummaryTheRuntimeServes, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_assets", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const summary = projectSummaryFromTheListAssetsToolResult(operationResult.value);
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** Copy the project in `source`, an absolute folder or `.zip`, into `imports/` of the project in `projectDirectory` through the runtime's `add_dependency`; refused in the runtime's own words. */
  async addDependency(projectDirectory: string, source: string): Promise<Result<ProjectDependency, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("add_dependency", { project_directory: projectDirectory, source }, PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS);
    if (!operationResult.ok) return operationResult;
    const dependency = projectDependencyFromTheAddDependencyToolResult(operationResult.value);
    return dependency.ok ? dependency : localApiRequestFailure(dependency.failure);
  }

  /** Copy the import `project` of the project in `projectDirectory` again from its source through the runtime's `update_dependency`, overwriting files edited since its copy only with `overwriteEditedFiles`; refused in the runtime's own words. */
  async updateDependency(projectDirectory: string, project: string, overwriteEditedFiles: boolean): Promise<Result<WorkspaceDependencyUpdate, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(
      "update_dependency",
      { project_directory: projectDirectory, project, overwrite_edited_files: overwriteEditedFiles },
      PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS,
    );
    if (!operationResult.ok) return operationResult;
    const update = dependencyUpdateFromTheUpdateDependencyToolResult(operationResult.value);
    return update.ok ? update : localApiRequestFailure(update.failure);
  }

  /** Each import of the project in `projectDirectory` from the runtime's `list_dependencies`, each source read for a newer version with `checkForNewer`; refused in the runtime's own words. */
  async listDependencies(projectDirectory: string, checkForNewer: boolean): Promise<Result<ListedProjectDependency[], LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_dependencies", { project_directory: projectDirectory, check_for_newer: checkForNewer }, PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS);
    if (!operationResult.ok) return operationResult;
    const dependencies = workspaceDependenciesFromTheListDependenciesToolResult(operationResult.value);
    return dependencies.ok ? dependencies : localApiRequestFailure(dependencies.failure);
  }

  /** The files of the project in `projectDirectory`, or of its folder `under` alone, from the runtime's `list_project_files`; refused in the runtime's own words. */
  async listProjectFiles(projectDirectory: string, under: string | null): Promise<Result<ProjectFileTheRuntimeListed[], LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_project_files", under === null ? { project_directory: projectDirectory } : { project_directory: projectDirectory, under });
    if (!operationResult.ok) return operationResult;
    const listed = projectFilesFromTheListProjectFilesToolResult(operationResult.value);
    return listed.ok ? listed : localApiRequestFailure(listed.failure);
  }

  /** The bytes of the file `filePath`, `/`-separated in the project in `projectDirectory`, from the runtime's `read_project_file`; refused in the runtime's own words. */
  async readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("read_project_file", { project_directory: projectDirectory, path: filePath });
    if (!operationResult.ok) return operationResult;
    const fileBytes = projectFileBytesFromTheReadProjectFileToolResult(operationResult.value);
    return fileBytes.ok ? fileBytes : localApiRequestFailure(fileBytes.failure);
  }

  /** Write `text` whole to `filePath` in the project in `projectDirectory` as one transaction by `author`, keyed by `idempotencyKey`, through the runtime's `write_project_file`; refused in the runtime's own words. */
  async writeProjectFile(
    projectDirectory: string,
    filePath: string,
    text: string,
    author: ProjectTransactionAuthor,
    idempotencyKey: string,
  ): Promise<Result<ProjectFileWriteRecorded, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("write_project_file", {
      project_directory: projectDirectory,
      path: filePath,
      content: text,
      author: authorOnTheWire(author),
      idempotency_key: idempotencyKey,
    });
    if (!operationResult.ok) return operationResult;
    const written = projectFileWriteFromTheWriteProjectFileToolResult(operationResult.value);
    return written.ok ? written : localApiRequestFailure(written.failure);
  }

  /** A new Python node file at `filePath` in the project in `projectDirectory`, from the runtime's node template, as one transaction by `author` keyed by `idempotencyKey`, through the runtime's `create_node_file`; refused in the runtime's own words. */
  async createNodeFile(
    projectDirectory: string,
    filePath: string,
    author: ProjectTransactionAuthor,
    idempotencyKey: string,
  ): Promise<Result<NodeFileCreationRecorded, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("create_node_file", {
      project_directory: projectDirectory,
      path: filePath,
      author: { kind: author.kind, name: author.name },
      idempotency_key: idempotencyKey,
    });
    if (!operationResult.ok) return operationResult;
    const created = nodeFileCreationFromTheCreateNodeFileToolResult(operationResult.value);
    return created.ok ? created : localApiRequestFailure(created.failure);
  }

  /** Each view the project in `projectDirectory` and its imports bring, from the runtime's `list_project_views`; refused in the runtime's own words. */
  async listProjectViews(projectDirectory: string): Promise<Result<ProjectViewTheRuntimeListed[], LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_project_views", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const listed = projectViewsFromTheListProjectViewsToolResult(operationResult.value);
    return listed.ok ? listed : localApiRequestFailure(listed.failure);
  }

  /** Publish `value` on the output `port` of the view node `node` in `stream`, through the runtime's `write_studio_view_output`; live data, recorded nowhere; refused in the runtime's own words. */
  async writeStudioViewOutput(stream: string, node: string, port: string, value: JsonValue): Promise<Result<StudioViewOutputWritten, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("write_studio_view_output", { stream, node, port, value });
    if (!operationResult.ok) return operationResult;
    const written = studioViewOutputFromTheWriteStudioViewOutputToolResult(operationResult.value);
    return written.ok ? written : localApiRequestFailure(written.failure);
  }

  /** Hand `value` to the Input `input` of the running stream `stream`, through the runtime's `write_graph_input`; live data, recorded nowhere, the last write winning; refused in the runtime's own words. */
  async writeGraphInput(stream: string, input: string, value: JsonValue): Promise<Result<GraphInputWritten, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("write_graph_input", { stream, input, value });
    if (!operationResult.ok) return operationResult;
    const written = graphInputWrittenFromTheWriteGraphInputToolResult(operationResult.value);
    return written.ok ? written : localApiRequestFailure(written.failure);
  }

  /** Undo `author`'s latest transaction in the project in `projectDirectory` not undone yet, through the runtime's `undo`, answering the undo it applied; refused in the runtime's own words. */
  undoInTheProject(projectDirectory: string, author: ProjectTransactionAuthor): Promise<Result<ProjectTransaction, LocalApiRequestFailure>> {
    return this.undoOrRedoInTheProject("undo", projectDirectory, author);
  }

  /** Redo what `author`'s latest undo in the project in `projectDirectory` reversed, through the runtime's `redo`, answering the redo it applied; refused in the runtime's own words. */
  redoInTheProject(projectDirectory: string, author: ProjectTransactionAuthor): Promise<Result<ProjectTransaction, LocalApiRequestFailure>> {
    return this.undoOrRedoInTheProject("redo", projectDirectory, author);
  }

  private async undoOrRedoInTheProject(toolName: "undo" | "redo", projectDirectory: string, author: ProjectTransactionAuthor): Promise<Result<ProjectTransaction, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation(toolName, { project_directory: projectDirectory, author: authorOnTheWire(author) });
    if (!operationResult.ok) return operationResult;
    const transaction = projectTransactionFromTheUndoOrRedoToolResult(toolName, operationResult.value);
    return transaction.ok ? transaction : localApiRequestFailure(transaction.failure);
  }

  /** Apply `operations` on the graphs of the streams they name as one transaction through the runtime's `transact`, by `author`, under `idempotencyKey` when one is given; a refusal the runtime structures is answered as `refused`, every other failure as a failure. */
  async transactOnTheStreamGraphs(
    operations: readonly StreamGraphAction[],
    mode: GraphEditMode,
    idempotencyKey: string | null,
    author: ProjectTransactionAuthor,
  ): Promise<Result<ProjectGraphTransactionTheRuntimeAnswered, LocalApiRequestFailure>> {
    const operationAnswer = await this.callControlOperationKeepingItsRefusal("transact", {
      operations: [...operations],
      mode,
      author: authorOnTheWire(author),
      ...(idempotencyKey === null ? {} : { idempotency_key: idempotencyKey }),
    });
    if (!operationAnswer.ok) return operationAnswer;
    if (operationAnswer.value.kind === "refused_by_the_operation") {
      const refusal = projectActionRefusalOnTheWire(operationAnswer.value.refusal);
      return refusal.ok ? succeeded({ kind: "refused", refusal: refusal.value }) : theRuntimesRefusal(operationAnswer.value.words);
    }
    const transaction = projectGraphTransactionFromTheTransactToolResult(operationAnswer.value.result);
    return transaction.ok ? succeeded({ kind: "applied", transaction: transaction.value }) : localApiRequestFailure(transaction.failure);
  }

  /** `GET requestTarget`, answering the body of a `200`; any other answer is refused in the runtime's own words when its body carries them. */
  private async getBodyOfAnOkAnswer(requestTarget: string): Promise<Result<Buffer, LocalApiRequestFailure>> {
    const response = await this.sendOneHttpRequestAndReadItsResponse("GET", requestTarget, [], null);
    if (!response.ok) return response;
    if (response.value.statusCode === 200) return succeeded(response.value.body);
    const bodyText = response.value.body.toString("utf8");
    const errorResponse = parseJsonOnTheWire(bodyText);
    const runtimesOwnWords = errorResponse.ok && isAJsonObject(errorResponse.value) ? requiredText(errorResponse.value, "error") : null;
    return localApiRequestFailure(
      runtimesOwnWords?.ok ? runtimesOwnWords.value : `the runtime answered ${requestTarget} with ${response.value.statusCode}: ${bodyText.trim()}`,
    );
  }

  /** Call `method` with `params` in one `POST /control`, giving up after `responseTimeoutMs`, answering its result read with `resultReviver` when one is given; the operation's own refusal is the runtime's, in its words. */
  private async callControlOperation<Method extends ControlOperationMethodName>(
    method: Method,
    params: ControlOperationParams<Method>,
    responseTimeoutMs: number = this.requestTimeoutMs,
    resultReviver: ControlOperationResultReviver | null = null,
  ): Promise<Result<unknown, LocalApiRequestFailure>> {
    const answer = await this.callControlOperationKeepingItsRefusal(method, params, responseTimeoutMs, resultReviver);
    if (!answer.ok) return answer;
    return answer.value.kind === "answered" ? succeeded(answer.value.result) : theRuntimesRefusal(answer.value.words);
  }

  /** As `callControlOperation`, but the operation's own refusal is answered apart from every other failure, with the structured refusal when the runtime gave one. */
  private callControlOperationKeepingItsRefusal<Method extends ControlOperationMethodName>(
    method: Method,
    params: ControlOperationParams<Method>,
    responseTimeoutMs: number = this.requestTimeoutMs,
    resultReviver: ControlOperationResultReviver | null = null,
  ): Promise<Result<ControlOperationAnswer, LocalApiRequestFailure>> {
    return callOneControlOperationOverAPost(this.localApiSocketPath, method, params, responseTimeoutMs, resultReviver);
  }

  private sendOneHttpRequestAndReadItsResponse(
    method: string,
    requestTarget: string,
    extraHeaders: readonly HttpRequestHeader[],
    requestBody: Buffer | null,
    responseTimeoutMs: number = this.requestTimeoutMs,
  ): Promise<Result<LocalApiHttpResponse, LocalApiRequestFailure>> {
    const socketText = this.localApiSocketPath;
    return new Promise((settle) => {
      const responseChunks: Buffer[] = [];
      let responseByteCount = 0;
      let connected = false;
      let requestSent = false;
      let settled = false;
      const settleOnce = (outcome: Result<LocalApiHttpResponse, LocalApiRequestFailure>) => {
        if (settled) return;
        settled = true;
        connection.destroy();
        settle(outcome);
      };
      const connection = net.createConnection(this.localApiSocketPath);
      connection.setTimeout(responseTimeoutMs);
      connection.on("connect", () => {
        connected = true;
        connection.write(httpRequestBytes(method, requestTarget, extraHeaders, requestBody), () => {
          requestSent = true;
        });
      });
      connection.on("data", (responseChunk: Buffer) => {
        responseChunks.push(responseChunk);
        responseByteCount += responseChunk.length;
        if (responseByteCount > LARGEST_LOCAL_API_RESPONSE_BYTES) {
          settleOnce(
            localApiRequestFailure(`${method} ${requestTarget} to ${socketText} answered more than ${LARGEST_LOCAL_API_RESPONSE_BYTES} bytes`),
          );
        }
      });
      connection.on("timeout", () => {
        settleOnce(
          localApiRequestFailure(`${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutFailureSpellsIt(responseTimeoutMs)}`),
        );
      });
      connection.on("error", (connectionFailure) => {
        const failureText = describeCaughtFailure(connectionFailure);
        const failureDescription = !connected
          ? `no runtime answers at ${socketText}: ${failureText}`
          : requestSent
            ? `${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutFailureSpellsIt(responseTimeoutMs)}: ${failureText}`
            : `the request ${method} ${requestTarget} to ${socketText} could not be sent: ${failureText}`;
        settleOnce(localApiRequestFailure(failureDescription));
      });
      connection.on("end", () => {
        const response = parseHttpResponse(Buffer.concat(responseChunks));
        settleOnce(
          response.ok ? response : localApiRequestFailure(`${method} ${requestTarget} to ${socketText} answered malformed HTTP: ${response.failure}`),
        );
      });
    });
  }
}

/** One HTTP/1.1 request on a connection the server closes after answering; it carries a `Content-Length` exactly when it carries a body. */
export function httpRequestBytes(method: string, requestTarget: string, extraHeaders: readonly HttpRequestHeader[], requestBody: Buffer | null): Buffer {
  let requestHead = `${method} ${requestTarget} HTTP/1.1\r\nHost: localhost\r\n`;
  for (const [headerName, headerValue] of extraHeaders) requestHead += `${headerName}: ${headerValue}\r\n`;
  if (requestBody !== null) requestHead += `Content-Length: ${requestBody.length}\r\n`;
  requestHead += "Connection: close\r\n\r\n";
  return Buffer.concat([Buffer.from(requestHead, "utf8"), requestBody ?? Buffer.alloc(0)]);
}

/** A complete HTTP/1.1 response read to end of stream: its status and its body, de-chunked when it was sent chunked. */
export function parseHttpResponse(responseBytes: Buffer): Result<LocalApiHttpResponse, string> {
  const headEnd = responseBytes.indexOf("\r\n\r\n");
  if (headEnd === -1) return failedWith("the response head never ended");
  const headBytes = responseBytes.subarray(0, headEnd);
  if (!isUtf8(headBytes)) return failedWith("the response head is not UTF-8");
  const body = responseBytes.subarray(headEnd + 4);
  const [statusLine, ...headerLines] = headBytes.toString("utf8").split("\r\n");
  if (statusLine === undefined) return failedWith("the response has no status line");
  const statusCodeText = statusLine.split(" ")[1];
  const statusCode = statusCodeText !== undefined && /^\d{1,5}$/.test(statusCodeText) ? Number(statusCodeText) : null;
  if (statusCode === null || statusCode > 65535) return failedWith(`the status line ${JSON.stringify(statusLine)} names no status`);
  let contentLength: number | null = null;
  let chunked = false;
  for (const headerLine of headerLines) {
    const colon = headerLine.indexOf(":");
    if (colon === -1) continue;
    const headerName = headerLine.slice(0, colon).toLowerCase();
    const headerValue = headerLine.slice(colon + 1).trim();
    if (headerName === "content-length") {
      contentLength = /^\d+$/.test(headerValue) ? Number(headerValue) : null;
    } else if (headerName === "transfer-encoding" && headerValue.toLowerCase().includes("chunked")) {
      chunked = true;
    }
  }
  if (chunked) {
    const dechunked = dechunkedBody(body);
    return dechunked.ok ? succeeded({ statusCode, body: dechunked.value }) : dechunked;
  }
  if (contentLength === null) return succeeded({ statusCode, body });
  if (body.length < contentLength) return failedWith(`the body ended after ${body.length} of its ${contentLength} bytes`);
  return succeeded({ statusCode, body: body.subarray(0, contentLength) });
}

function dechunkedBody(chunkedBody: Buffer): Result<Buffer, string> {
  const bodyChunks: Buffer[] = [];
  let remaining = chunkedBody;
  for (;;) {
    const sizeLineEnd = remaining.indexOf("\r\n");
    if (sizeLineEnd === -1) return failedWith("a chunk size line never ended");
    const sizeLineBytes = remaining.subarray(0, sizeLineEnd);
    if (!isUtf8(sizeLineBytes)) return failedWith("a chunk size line is not UTF-8");
    const sizeText = (sizeLineBytes.toString("utf8").split(";")[0] ?? "").trim();
    if (!/^[0-9a-fA-F]+$/.test(sizeText)) return failedWith(`the chunk size ${JSON.stringify(sizeText)} is not hexadecimal`);
    const chunkSize = parseInt(sizeText, 16);
    remaining = remaining.subarray(sizeLineEnd + 2);
    if (chunkSize === 0) return succeeded(Buffer.concat(bodyChunks));
    if (remaining.length < chunkSize) return failedWith("the body ended inside a chunk");
    bodyChunks.push(remaining.subarray(0, chunkSize));
    if (remaining.length < chunkSize + 2) return failedWith("the body ended after a chunk");
    remaining = remaining.subarray(chunkSize + 2);
  }
}

/** `author` as the runtime's tools take it: its kind and name, nothing else. */
function authorOnTheWire(author: ProjectTransactionAuthor): { kind: ProjectTransactionAuthor["kind"]; name: string } {
  return { kind: author.kind, name: author.name };
}
