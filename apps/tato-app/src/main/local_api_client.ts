// The app's client of the runtime's local API: one short HTTP/1.1 request per call over the
// local API's Unix socket. `GET /health` says the runtime is up, `describe_runtime` names its
// version, uptime and log folder, the MCP tools `list_streams`, `logs` and `graph` over
// `POST /mcp` list its streams, read a project's log records and draw one stream's graph,
// `create_project`, `start_project` and `reload_project` queue a project's load, which
// `describe_stream_action` follows, `stop_project` queues the stop of every stream of a project,
// `remove_project` queues the removal of a project's streams, `delete_project` its removal and its
// folder's move to the Trash, `rename_project` and `duplicate_project` rename and copy a project,
// `import_project` makes one from a `.zip`, `set_stream_display_name` shows a stream under another
// name, `transact` applies graph actions as one transaction and answers its structured refusal,
// `add_dependency`, `update_dependency` and `list_dependencies` copy, copy again and
// list the projects a project imports, `GET /api/graph` names the machine, and `GET /api/registry` lists the node types a
// stream can add.
//
// The MCP request is spelled as StreamLib's runtime requires one (`streamlib-api-server`'s
// `mcp.rs` serves rmcp's stateless Streamable HTTP with per-request protocol metadata
// required): the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, an `Accept` of
// both JSON and SSE, and `_meta` carrying the protocol version, client info and capabilities.

import { TATO_STUDIO_MCP_CLIENT_NAME } from "../shared/tatolab_backend_contract.js";
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
  ProjectRunQueued,
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
  everyOneRead,
  isAJsonObject,
  jsonObject,
  type JsonObjectOnTheWire,
  optionalObject,
  optionalText,
  optionalUnsignedInteger,
  parseJsonOnTheWire,
  requiredText,
  requiredUnsignedInteger,
} from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { nodeCatalogFromTheRegistryAnswer, nodeCatalogRequestTarget } from "./node_catalog.js";
import { projectNodeTypeListingFromTheToolResult } from "./project_node_type_listing.js";
import { projectAssetListingFromTheListAssetsToolResult } from "./project_asset_listing.js";
import {
  duplicateFromTheDuplicateProjectToolResult,
  projectFromTheImportProjectToolResult,
  assetFromTheImportAssetToolResult,
  projectSettingsFromTheToolResult,
  type AssetImportedByTheRuntime,
  type ProjectSettingsAfterTheTransaction,
  type ProjectSettingsTool,
} from "./project_changes_on_the_wire.js";
import { projectSummaryFromTheListAssetsToolResult, projectTheRuntimeNamesFromTheListAssetsToolResult, type ProjectSummaryTheRuntimeServes } from "./project_the_runtime_names.js";
import { projectTransactionFromTheUndoOrRedoToolResult } from "./project_transactions_on_the_wire.js";
import { projectActionRefusalFromTheStructuredContent, projectGraphTransactionFromTheTransactToolResult } from "./project_graph_transaction_on_the_wire.js";
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
  projectRunQueuedFromTheStartOrReloadProjectToolResult,
  streamActionCancelAnswerFromTheCancelStreamActionToolResult,
  streamActionDescriptionFromTheDescribeStreamActionToolResult,
} from "./stream_action_description.js";

/** The MCP protocol revision the runtime serves, and the only one. */
export const LOCAL_API_MCP_PROTOCOL_VERSION = "2026-07-28";

/** The client name the app gives the runtime in every MCP request's `_meta`. */
export const LOCAL_API_MCP_CLIENT_NAME = TATO_STUDIO_MCP_CLIENT_NAME;

/** The most bytes one local API response may carry before the client gives up on it. */
const LARGEST_LOCAL_API_RESPONSE_BYTES = 8 * 1024 * 1024;

/** How long `list_project_node_types` may go without a byte: the runtime bounds the project's interpreter reading its source at 60 seconds, and answers its refusal soon after. */
const PROJECT_NODE_TYPE_LISTING_RESPONSE_TIMEOUT_MS = 65_000;

/** How long a dependency tool may go without a byte: an add or an update locks the project's Python requirements with uv, which may resolve them over the network, and a check for newer versions reads every source. */
const PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS = 180_000;

/** How long a tool that copies a whole project may go without a byte: a duplicate copies its files and history, an import unpacks a `.zip`. */
const FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS = 120_000;

/** Why a local API request came back without an answer. */
export interface LocalApiRequestFailure {
  failureDescription: string;
  /** Whether the runtime answered and refused, in its own words, rather than not answering or answering something unreadable. */
  isTheRuntimesRefusal: boolean;
}

/** A failure that is not the runtime's refusal: nothing answered, or what answered could not be read. */
export function localApiRequestFailure(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: false });
}

/** The runtime's refusal, in its own words. */
export function theRuntimesRefusal(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: true });
}

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

/** What `set_stream_display_name` answers: the one transaction that renamed the stream asset, and its commit on the project's history. */
export interface StreamDisplayNameSet {
  transaction: string;
  commit: string;
}

/** A `set_stream_display_name` tool result read field for field; unknown fields, the stream asset as it now is among them, are ignored. */
export function streamDisplayNameSetFromTheSetStreamDisplayNameToolResult(toolResultText: string): Result<StreamDisplayNameSet, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the set_stream_display_name result") : parsedToolResult;
  const displayNameSet = toolResult.ok ? streamDisplayNameSetOnTheWire(toolResult.value) : toolResult;
  return displayNameSet.ok ? displayNameSet : failedWith(`the runtime's set_stream_display_name result could not be read: ${displayNameSet.failure}`);
}

function streamDisplayNameSetOnTheWire(toolResult: JsonObjectOnTheWire): Result<StreamDisplayNameSet, string> {
  const transaction = requiredText(toolResult, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(toolResult, "commit");
  if (!commit.ok) return commit;
  return succeeded({ transaction: transaction.value, commit: commit.value });
}

/** A `describe_runtime` tool result read field for field; unknown fields are ignored. */
export function runtimeDescriptionFromTheDescribeRuntimeToolResult(toolResultText: string): Result<RuntimeDescription, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the describe_runtime result") : parsedToolResult;
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
export function listedStreamsFromTheListStreamsToolResult(toolResultText: string): Result<ListedStream[], string> {
  const listedStreams = listedStreamsFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return listedStreams.ok ? listedStreams : failedWith(`the runtime's list_streams result could not be read: ${listedStreams.failure}`);
}

function listedStreamsFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ListedStream[], string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the list_streams result");
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
export function queuedStreamActionFromTheToolResult(toolName: ProjectActionToolName, toolResultText: string): Result<string, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, `the ${toolName} result`) : parsedToolResult;
  const action = toolResult.ok ? requiredText(toolResult.value, "action") : toolResult;
  return action.ok ? action : failedWith(`the runtime's ${toolName} result could not be read: ${action.failure}`);
}

/** A runtime tool that queues an action on a whole project. */
type ProjectActionToolName = "stop_project" | "remove_project" | "delete_project";

/** `durationMs` as a timeout refusal spells it: whole seconds as `3s`, anything else as `200ms`. */
function durationAsTheTimeoutRefusalSpellsIt(durationMs: number): string {
  return durationMs % 1000 === 0 ? `${durationMs / 1000}s` : `${durationMs}ms`;
}

/** A client of the local API served at one socket path. */
export class LocalApiClient {
  /** A client of the local API at `localApiSocketPath`, giving up on a request that goes `requestTimeoutMs` without a byte, and naming itself in MCP requests as `appVersion`. */
  constructor(
    private readonly localApiSocketPath: string,
    private readonly requestTimeoutMs: number,
    private readonly appVersion: string,
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
    const toolResultText = await this.callMcpTool("describe_runtime", {});
    if (!toolResultText.ok) return toolResultText;
    const runtimeDescription = runtimeDescriptionFromTheDescribeRuntimeToolResult(toolResultText.value);
    return runtimeDescription.ok ? runtimeDescription : localApiRequestFailure(runtimeDescription.failure);
  }

  /** Every stream the runtime holds, from its `list_streams` tool. */
  async listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_streams", {});
    if (!toolResultText.ok) return toolResultText;
    const listedStreams = listedStreamsFromTheListStreamsToolResult(toolResultText.value);
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
    const toolResultText = await this.callMcpTool("logs", {
      project_directory: projectDirectory,
      ...(narrowing.stream === null ? {} : { stream: narrowing.stream }),
      ...(narrowing.action === null ? {} : { action: narrowing.action }),
      ...(after === null ? {} : { after }),
      count,
    });
    if (!toolResultText.ok) return toolResultText;
    const page = projectLogRecordsPageFromTheLogsToolResult(toolResultText.value);
    return page.ok ? page : localApiRequestFailure(page.failure);
  }

  /** Queue the stop of every stream of the project in `projectDirectory`, answering the id of the action it queued; refused in the runtime's own words, as when none of them runs. */
  stopProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("stop_project", { project_directory: projectDirectory });
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

  /** Copy the file at `source`, an absolute path on this machine, into the project in `projectDirectory` as an asset at `assetPath` through `import_asset`, the kind its extension implies, recorded under `author` or, for `null`, the runtime's own; refused in the runtime's own words. */
  async importAsset(projectDirectory: string, source: string, assetPath: string, author: ProjectTransactionAuthor | null): Promise<Result<AssetImportedByTheRuntime, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(
      "import_asset",
      { project_directory: projectDirectory, source, asset_path: assetPath, ...(author === null ? {} : { author: authorOnTheWire(author) }) },
      FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS,
    );
    if (!toolResultText.ok) return toolResultText;
    const imported = assetFromTheImportAssetToolResult(toolResultText.value);
    return imported.ok ? imported : localApiRequestFailure(imported.failure);
  }

  /** Copy the project in `projectDirectory` with its history into `into`, a folder that does not exist yet, as a project of its own; refused in the runtime's own words. */
  async duplicateProject(projectDirectory: string, into: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("duplicate_project", { project_directory: projectDirectory, into }, FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const duplicate = duplicateFromTheDuplicateProjectToolResult(toolResultText.value);
    return duplicate.ok ? duplicate : localApiRequestFailure(duplicate.failure);
  }

  /** Make a project in `projectDirectory`, a folder that does not exist yet, from `source`, an absolute `.zip` of one, through the runtime's `import_project`; runs nothing, refused in the runtime's own words. */
  async importProject(source: string, projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("import_project", { source, project_directory: projectDirectory }, FILE_COPYING_TOOL_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const imported = projectFromTheImportProjectToolResult(toolResultText.value);
    return imported.ok ? imported : localApiRequestFailure(imported.failure);
  }

  /** Call `toolName`, one of the tools that change how people see a project, answering its settings after the transaction; refused in the runtime's own words. */
  private async changeProjectSettings(toolName: ProjectSettingsTool, toolArguments: Record<string, string | null>): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(toolName, toolArguments);
    if (!toolResultText.ok) return toolResultText;
    const settings = projectSettingsFromTheToolResult(toolName, toolResultText.value);
    return settings.ok ? settings : localApiRequestFailure(settings.failure);
  }

  /** Call the tool `toolName` that queues an action, answering the id of the action the runtime queued; refused in the runtime's own words. */
  private async queueRuntimeAction(
    toolName: ProjectActionToolName,
    toolArguments: Record<string, string>,
  ): Promise<Result<string, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(toolName, toolArguments);
    if (!toolResultText.ok) return toolResultText;
    const action = queuedStreamActionFromTheToolResult(toolName, toolResultText.value);
    return action.ok ? action : localApiRequestFailure(action.failure);
  }

  /** Show the stream asset `streamAsset` of the project in `projectDirectory` under `displayName` through the runtime's `set_stream_display_name`, one transaction on its history; refused in the runtime's own words. */
  async setStreamDisplayName(projectDirectory: string, streamAsset: string, displayName: string): Promise<Result<StreamDisplayNameSet, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("set_stream_display_name", {
      project_directory: projectDirectory,
      stream_asset: streamAsset,
      display_name: displayName,
    });
    if (!toolResultText.ok) return toolResultText;
    const displayNameSet = streamDisplayNameSetFromTheSetStreamDisplayNameToolResult(toolResultText.value);
    return displayNameSet.ok ? displayNameSet : localApiRequestFailure(displayNameSet.failure);
  }

  /** Queue the creation of a new project in `projectDirectory`, or with `null` in a folder the runtime draws under `~/streams`, and its run; answered at once, refused in the runtime's own words. */
  async createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("create_project", projectDirectory === null ? {} : { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const queued = projectCreationQueuedFromTheCreateProjectToolResult(toolResultText.value);
    return queued.ok ? queued : localApiRequestFailure(queued.failure);
  }

  /** Queue the start of the stopped or never-started project in `projectDirectory`, which loads every stream asset in it; answered at once, refused in the runtime's own words, as for a running project, which `reloadProject` re-reads. */
  startProject(projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>> {
    return this.queueAProjectLoad("start_project", projectDirectory);
  }

  /** Queue the reload from disk of the running or paused project in `projectDirectory`; answered at once, refused in the runtime's own words, as for a stopped project, which `startProject` starts. */
  reloadProject(projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>> {
    return this.queueAProjectLoad("reload_project", projectDirectory);
  }

  private async queueAProjectLoad(toolName: "start_project" | "reload_project", projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(toolName, { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const queued = projectRunQueuedFromTheStartOrReloadProjectToolResult(toolName, toolResultText.value);
    return queued.ok ? queued : localApiRequestFailure(queued.failure);
  }

  /** Where the stream action `action` is: its state and step, and the streams it took in; refused in the runtime's own words, as for an action it no longer holds. */
  async describeStreamAction(action: string): Promise<Result<StreamActionFollowed, LocalApiRequestFailure>> {
    const toolAnswer = await this.callMcpToolKeepingItsRefusal("describe_stream_action", { action });
    if (!toolAnswer.ok) return toolAnswer;
    if (toolAnswer.value.kind === "refused_by_the_tool") return succeeded({ kind: "not_held", words: toolAnswer.value.words });
    const description = streamActionDescriptionFromTheDescribeStreamActionToolResult(toolAnswer.value.text);
    return description.ok ? succeeded({ kind: "described", description: description.value }) : localApiRequestFailure(description.failure);
  }

  /** End the stream action `action` early through the runtime's `cancel_stream_action`: dropped while queued, stopped at its step while running; refused in the runtime's own words, as for a stop past cancelling. */
  async cancelStreamAction(action: string): Promise<Result<StreamActionCancelAnswer, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("cancel_stream_action", { action });
    if (!toolResultText.ok) return toolResultText;
    const answer = streamActionCancelAnswerFromTheCancelStreamActionToolResult(toolResultText.value);
    return answer.ok ? answer : localApiRequestFailure(answer.failure);
  }

  /** The graph of the loaded stream `stream` from the runtime's `graph` tool, the text `tatolab graph --stream` prints. */
  async describeStreamGraph(stream: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("graph", { stream });
    if (!toolResultText.ok) return toolResultText;
    const summary = streamGraphSummaryFromTheGraphToolResult(stream, toolResultText.value);
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
    const toolResultText = await this.callMcpTool("list_project_node_types", { project_directory: projectDirectory }, PROJECT_NODE_TYPE_LISTING_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const listing = projectNodeTypeListingFromTheToolResult(toolResultText.value);
    return listing.ok ? listing : localApiRequestFailure(listing.failure);
  }

  /** Every asset of the project in `projectDirectory`, its graph documents among them, from the runtime's `list_assets`; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  async listProjectAssets(projectDirectory: string): Promise<Result<ProjectAssetListing, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_assets", { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const listing = projectAssetListingFromTheListAssetsToolResult(toolResultText.value);
    return listing.ok ? listing : localApiRequestFailure(listing.failure);
  }

  /** The project in `projectDirectory` as the runtime's `list_assets` names it; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  async nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_assets", { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const project = projectTheRuntimeNamesFromTheListAssetsToolResult(toolResultText.value);
    return project.ok ? project : localApiRequestFailure(project.failure);
  }

  /** The project in `projectDirectory` as its card shows it, from `list_assets`: its name, description and last edit; refused in the runtime's own words. */
  async summarizeTheProject(projectDirectory: string): Promise<Result<ProjectSummaryTheRuntimeServes, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_assets", { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const summary = projectSummaryFromTheListAssetsToolResult(toolResultText.value);
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** Copy the project in `source`, an absolute folder or `.zip`, into `imports/` of the project in `projectDirectory` through the runtime's `add_dependency`; refused in the runtime's own words. */
  async addDependency(projectDirectory: string, source: string): Promise<Result<ProjectDependency, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("add_dependency", { project_directory: projectDirectory, source }, PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const dependency = projectDependencyFromTheAddDependencyToolResult(toolResultText.value);
    return dependency.ok ? dependency : localApiRequestFailure(dependency.failure);
  }

  /** Copy the import `project` of the project in `projectDirectory` again from its source through the runtime's `update_dependency`, overwriting files edited since its copy only with `overwriteEditedFiles`; refused in the runtime's own words. */
  async updateDependency(projectDirectory: string, project: string, overwriteEditedFiles: boolean): Promise<Result<WorkspaceDependencyUpdate, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(
      "update_dependency",
      { project_directory: projectDirectory, project, overwrite_edited_files: overwriteEditedFiles },
      PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS,
    );
    if (!toolResultText.ok) return toolResultText;
    const update = dependencyUpdateFromTheUpdateDependencyToolResult(toolResultText.value);
    return update.ok ? update : localApiRequestFailure(update.failure);
  }

  /** Each import of the project in `projectDirectory` from the runtime's `list_dependencies`, each source read for a newer version with `checkForNewer`; refused in the runtime's own words. */
  async listDependencies(projectDirectory: string, checkForNewer: boolean): Promise<Result<ListedProjectDependency[], LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_dependencies", { project_directory: projectDirectory, check_for_newer: checkForNewer }, PROJECT_DEPENDENCY_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const dependencies = workspaceDependenciesFromTheListDependenciesToolResult(toolResultText.value);
    return dependencies.ok ? dependencies : localApiRequestFailure(dependencies.failure);
  }

  /** The files of the project in `projectDirectory`, or of its folder `under` alone, from the runtime's `list_project_files`; refused in the runtime's own words. */
  async listProjectFiles(projectDirectory: string, under: string | null): Promise<Result<ProjectFileTheRuntimeListed[], LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_project_files", under === null ? { project_directory: projectDirectory } : { project_directory: projectDirectory, under });
    if (!toolResultText.ok) return toolResultText;
    const listed = projectFilesFromTheListProjectFilesToolResult(toolResultText.value);
    return listed.ok ? listed : localApiRequestFailure(listed.failure);
  }

  /** The bytes of the file `filePath`, `/`-separated in the project in `projectDirectory`, from the runtime's `read_project_file`; refused in the runtime's own words. */
  async readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("read_project_file", { project_directory: projectDirectory, path: filePath });
    if (!toolResultText.ok) return toolResultText;
    const fileBytes = projectFileBytesFromTheReadProjectFileToolResult(toolResultText.value);
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
    const toolResultText = await this.callMcpTool("write_project_file", {
      project_directory: projectDirectory,
      path: filePath,
      content: text,
      author: authorOnTheWire(author),
      idempotency_key: idempotencyKey,
    });
    if (!toolResultText.ok) return toolResultText;
    const written = projectFileWriteFromTheWriteProjectFileToolResult(toolResultText.value);
    return written.ok ? written : localApiRequestFailure(written.failure);
  }

  /** A new Python node file at `filePath` in the project in `projectDirectory`, from the runtime's node template, as one transaction by `author` keyed by `idempotencyKey`, through the runtime's `create_node_file`; refused in the runtime's own words. */
  async createNodeFile(
    projectDirectory: string,
    filePath: string,
    author: ProjectTransactionAuthor,
    idempotencyKey: string,
  ): Promise<Result<NodeFileCreationRecorded, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("create_node_file", {
      project_directory: projectDirectory,
      path: filePath,
      author: { kind: author.kind, name: author.name },
      idempotency_key: idempotencyKey,
    });
    if (!toolResultText.ok) return toolResultText;
    const created = nodeFileCreationFromTheCreateNodeFileToolResult(toolResultText.value);
    return created.ok ? created : localApiRequestFailure(created.failure);
  }

  /** Each view the project in `projectDirectory` and its imports bring, from the runtime's `list_project_views`; refused in the runtime's own words. */
  async listProjectViews(projectDirectory: string): Promise<Result<ProjectViewTheRuntimeListed[], LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_project_views", { project_directory: projectDirectory });
    if (!toolResultText.ok) return toolResultText;
    const listed = projectViewsFromTheListProjectViewsToolResult(toolResultText.value);
    return listed.ok ? listed : localApiRequestFailure(listed.failure);
  }

  /** Publish `value` on the output `port` of the view node `node` in `stream`, through the runtime's `write_studio_view_output`; live data, recorded nowhere; refused in the runtime's own words. */
  async writeStudioViewOutput(stream: string, node: string, port: string, value: JsonValue): Promise<Result<StudioViewOutputWritten, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("write_studio_view_output", { stream, node, port, value });
    if (!toolResultText.ok) return toolResultText;
    const written = studioViewOutputFromTheWriteStudioViewOutputToolResult(toolResultText.value);
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
    const toolResultText = await this.callMcpTool(toolName, { project_directory: projectDirectory, author: authorOnTheWire(author) });
    if (!toolResultText.ok) return toolResultText;
    const transaction = projectTransactionFromTheUndoOrRedoToolResult(toolName, toolResultText.value);
    return transaction.ok ? transaction : localApiRequestFailure(transaction.failure);
  }

  /** Apply `operations` on the graphs of the streams they name as one transaction through the runtime's `transact`, by `author`, under `idempotencyKey` when one is given; a refusal the runtime structures is answered as `refused`, every other failure as a failure. */
  async transactOnTheStreamGraphs(
    operations: readonly StreamGraphAction[],
    mode: GraphEditMode,
    idempotencyKey: string | null,
    author: ProjectTransactionAuthor,
  ): Promise<Result<ProjectGraphTransactionTheRuntimeAnswered, LocalApiRequestFailure>> {
    const toolAnswer = await this.callMcpToolKeepingItsRefusal("transact", {
      operations,
      mode,
      author: authorOnTheWire(author),
      ...(idempotencyKey === null ? {} : { idempotency_key: idempotencyKey }),
    });
    if (!toolAnswer.ok) return toolAnswer;
    if (toolAnswer.value.kind === "refused_by_the_tool") {
      const refusal = projectActionRefusalFromTheStructuredContent(toolAnswer.value.structuredContent);
      return refusal.ok ? succeeded({ kind: "refused", refusal: refusal.value }) : theRuntimesRefusal(toolAnswer.value.words);
    }
    const transaction = projectGraphTransactionFromTheTransactToolResult(toolAnswer.value.text);
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

  /** Call the MCP tool `toolName` with `toolArguments` in one stateless request, giving up after `responseTimeoutMs` without a byte, answering the text of its first content block; a tool that ran and failed is refused in its own words. */
  private async callMcpTool(
    toolName: string,
    toolArguments: Readonly<Record<string, unknown>>,
    responseTimeoutMs: number = this.requestTimeoutMs,
  ): Promise<Result<string, LocalApiRequestFailure>> {
    const toolAnswer = await this.callMcpToolKeepingItsRefusal(toolName, toolArguments, responseTimeoutMs);
    if (!toolAnswer.ok) return toolAnswer;
    return toolAnswer.value.kind === "answered" ? succeeded(toolAnswer.value.text) : theRuntimesRefusal(toolAnswer.value.words);
  }

  /** As `callMcpTool`, but a tool that ran and failed answers its words apart from every other refusal, the JSON-RPC layer's included. */
  private async callMcpToolKeepingItsRefusal(
    toolName: string,
    toolArguments: Readonly<Record<string, unknown>>,
    responseTimeoutMs: number = this.requestTimeoutMs,
  ): Promise<Result<McpToolAnswer, LocalApiRequestFailure>> {
    const requestBody = mcpToolCallRequestBody(1, toolName, toolArguments, this.appVersion);
    const response = await this.sendOneHttpRequestAndReadItsResponse(
      "POST",
      "/mcp",
      [
        ["Accept", "application/json, text/event-stream"],
        ["Content-Type", "application/json"],
        ["MCP-Protocol-Version", LOCAL_API_MCP_PROTOCOL_VERSION],
        ["Mcp-Method", "tools/call"],
        ["Mcp-Name", toolName],
      ],
      Buffer.from(requestBody, "utf8"),
      responseTimeoutMs,
    );
    if (!response.ok) return response;
    return mcpToolAnswerFromTheJsonRpcResponse(toolName, response.value.body.toString("utf8"), String(response.value.statusCode));
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
          localApiRequestFailure(`${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(responseTimeoutMs)}`),
        );
      });
      connection.on("error", (connectionFailure) => {
        const failureText = describeCaughtFailure(connectionFailure);
        const failureDescription = !connected
          ? `no runtime answers at ${socketText}: ${failureText}`
          : requestSent
            ? `${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(responseTimeoutMs)}: ${failureText}`
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

/** The JSON-RPC `tools/call` request `requestId` for `toolName`, carrying the per-request `_meta` the runtime requires over `POST /mcp` and `/mcp/stdio` alike. */
export function mcpToolCallRequestBody(requestId: number, toolName: string, toolArguments: Readonly<Record<string, unknown>>, appVersion: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArguments,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": { name: LOCAL_API_MCP_CLIENT_NAME, version: appVersion },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
}

/** What a tool call answered: the text of its first content block, or the words of a tool that ran and failed (`isError`). */
export type McpToolAnswer = { kind: "answered"; text: string } | { kind: "refused_by_the_tool"; words: string; structuredContent: unknown };

/** What the JSON-RPC response `jsonRpcResponseText` to a `toolName` call answered, `answeredOver` naming how it came (an HTTP status, or `/mcp/stdio`) in a failure's words. */
export function mcpToolAnswerFromTheJsonRpcResponse(toolName: string, jsonRpcResponseText: string, answeredOver: string): Result<McpToolAnswer, LocalApiRequestFailure> {
  const jsonRpcResponse = parseJsonOnTheWire(jsonRpcResponseText);
  if (!jsonRpcResponse.ok) {
    return localApiRequestFailure(`\`${toolName}\` answered ${answeredOver} with a body that is not JSON-RPC: ${jsonRpcResponse.failure}`);
  }
  const jsonRpcFields = isAJsonObject(jsonRpcResponse.value) ? jsonRpcResponse.value : {};
  const jsonRpcError = jsonRpcFields["error"];
  if (jsonRpcError !== undefined) {
    const message = isAJsonObject(jsonRpcError) && typeof jsonRpcError["message"] === "string" ? jsonRpcError["message"] : "no message";
    return theRuntimesRefusal(`the runtime refused \`${toolName}\` (${answeredOver}): ${message}`);
  }
  const toolResult = jsonRpcFields["result"];
  if (toolResult === undefined) return localApiRequestFailure(`\`${toolName}\` answered with neither a result nor an error`);
  const toolResultFields = isAJsonObject(toolResult) ? toolResult : {};
  const content = toolResultFields["content"];
  const firstText = Array.isArray(content) ? content.map(textOfATextBlock).find((blockText) => blockText !== null) ?? null : null;
  const toolFailed = toolResultFields["isError"] === true;
  if (toolFailed) return succeeded({ kind: "refused_by_the_tool", words: firstText ?? `\`${toolName}\` failed and gave no reason`, structuredContent: toolResultFields["structuredContent"] ?? null });
  return firstText === null ? localApiRequestFailure(`\`${toolName}\` answered with no text`) : succeeded({ kind: "answered", text: firstText });
}

/** A content block's text when it is a text block carrying text. */
function textOfATextBlock(contentBlock: unknown): string | null {
  if (!isAJsonObject(contentBlock) || contentBlock["type"] !== "text") return null;
  const blockText = contentBlock["text"];
  return typeof blockText === "string" ? blockText : null;
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
