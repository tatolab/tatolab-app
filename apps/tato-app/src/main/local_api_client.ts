// The app's client of the runtime's local API. Every control operation is one `POST /control` through
// the generated `@tatolab/runtime-client`, typed by the contract the runtime unit carries; `GET
// /health` says the runtime is up and `GET /api/graph` names the machine, each read through
// `getOverTheLocalApi`.

import { Effect, type Layer } from "effect";
import type {
  ListedStream,
  ProjectCreationQueued,
  ProjectStreamActionQueued,
  ProjectTheRuntimeNames,
  ProjectTransactionAuthor,
  RuntimeDescription,
  StreamActionFollowed,
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
import { failedWith, succeeded, type Result } from "./result.js";
import { bodyOfAnOkAnswer, getOverTheLocalApi } from "./local_api_plain_http.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { describeStreamAction, listDependencies, listProjectFiles, nameTheProject, openProject, reloadProject } from "./runtime_operations.js";
import { queuedStreamActionFromTheToolResult, type ProjectActionToolName } from "./stream_changes_on_the_wire.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import {
  authorOnTheWire,
  callOneControlOperationOverAPost,
  controlOperationTimeLimitMs,
  type ControlOperationAnswer,
  type ControlOperationMethodName,
  type ControlOperationParams,
  type ControlOperationResult,
  type RuntimeControl,
} from "./tatolab_runtime_control_operation_call.js";
import {
  duplicateFromTheDuplicateProjectToolResult,
  projectFromTheImportProjectToolResult,
  assetAtItsPathFromTheToolResult,
  projectSettingsFromTheToolResult,
  type ProjectAssetAtItsPath,
  type ProjectSettingsAfterTheTransaction,
  type ProjectSettingsTool,
} from "./project_changes_on_the_wire.js";
import { projectSummaryFromTheListAssetsToolResult, type ProjectSummaryTheRuntimeServes } from "./project_the_runtime_names.js";
import {
  projectFileBytesFromTheReadProjectFileToolResult,
  projectFileWriteFromTheWriteProjectFileToolResult,
  nodeFileCreationFromTheCreateNodeFileToolResult,
  type NodeFileCreationRecorded,
  type ProjectFileTheRuntimeListed,
  type ProjectFileWriteRecorded,
} from "./project_files_on_the_wire.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { projectCreationQueuedFromTheCreateProjectToolResult } from "./stream_action_description.js";

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

/** A `describe_runtime` tool result read field for field; unknown fields are ignored. */
export function runtimeDescriptionFromTheDescribeRuntimeToolResult(operationResult: ControlOperationResult<"describe_runtime">): Result<RuntimeDescription, string> {
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

/** A runtime tool that pauses or resumes a whole project's playback at once, queueing no action. */
/** A client of the local API served at one socket path. */
export class LocalApiClient {
  /** A client of the local API at `localApiSocketPath`, giving up on a request unanswered after `requestTimeoutMs`. */
  /** The live `RuntimeControl` each Effect operation this client answers runs on. */
  private readonly runtimeControl: Layer.Layer<RuntimeControl>;

  constructor(
    private readonly localApiSocketPath: string,
    private readonly requestTimeoutMs: number,
  ) {
    this.runtimeControl = runtimeControlLayer(localApiSocketPath, requestTimeoutMs);
  }

  /** Whether the runtime answers `GET /health` with `ok`. */
  async checkHealth(): Promise<Result<void, LocalApiRequestFailure>> {
    const response = await this.answerOf(getOverTheLocalApi(this.localApiSocketPath, "/health", this.requestTimeoutMs));
    if (!response.ok) return response;
    const body = response.value.body.trim();
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
    const graph = parseJsonOnTheWire(graphBody.value);
    const machine = graph.ok ? (isAJsonObject(graph.value) ? requiredText(graph.value, "machine") : failedWith("the graph is not an object")) : graph;
    return machine.ok ? machine : localApiRequestFailure(`the runtime's /api/graph names no machine: ${machine.failure}`);
  }

  /** Queue the close of the open project in `projectDirectory`, which ends its playback and unloads every stream of it, answering the id of the action it queued; refused in the runtime's own words, as for a project that is not open. */
  closeProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.queueRuntimeAction("close_project", { project_directory: projectDirectory });
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
    );
    if (!operationResult.ok) return operationResult;
    const imported = assetAtItsPathFromTheToolResult("import_asset", operationResult.value);
    return imported.ok ? imported : localApiRequestFailure(imported.failure);
  }

  /** Copy the project in `projectDirectory` with its history into `into`, a folder that does not exist yet, as a project of its own; refused in the runtime's own words. */
  async duplicateProject(projectDirectory: string, into: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("duplicate_project", { project_directory: projectDirectory, into });
    if (!operationResult.ok) return operationResult;
    const duplicate = duplicateFromTheDuplicateProjectToolResult(operationResult.value);
    return duplicate.ok ? duplicate : localApiRequestFailure(duplicate.failure);
  }

  /** Make a project in `projectDirectory`, a folder that does not exist yet, from `source`, an absolute `.zip` of one, through the runtime's `import_project`; runs nothing, refused in the runtime's own words. */
  async importProject(source: string, projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("import_project", { source, project_directory: projectDirectory });
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

  /** Queue the creation of a new project in `projectDirectory`, or with `null` in a folder the runtime draws under `~/streams`, and its run; answered at once, refused in the runtime's own words. */
  async createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("create_project", projectDirectory === null ? {} : { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const queued = projectCreationQueuedFromTheCreateProjectToolResult(operationResult.value);
    return queued.ok ? queued : localApiRequestFailure(queued.failure);
  }

  /** Queue the open of the closed or never-opened project in `projectDirectory`, which loads every stream asset in it with its playback stopped; answered at once, refused in the runtime's own words, as for an open project, which `reloadProject` re-reads. */
  openProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.answerOf(openProject(projectDirectory));
  }

  /** Queue the reload from disk of the open project in `projectDirectory`, which keeps its playback and retries its failed streams; answered at once, refused in the runtime's own words, as for a project that is not open, which `openProject` opens. */
  reloadProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.answerOf(reloadProject(projectDirectory));
  }

  /** Where the stream action `action` is: its state and step, and the streams it took in; refused in the runtime's own words, as for an action it no longer holds. */
  describeStreamAction(action: string): Promise<Result<StreamActionFollowed, LocalApiRequestFailure>> {
    return this.answerOf(describeStreamAction(action));
  }

  /** The project in `projectDirectory` as the runtime's `list_assets` names it; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    return this.answerOf(nameTheProject(projectDirectory));
  }

  /** The project in `projectDirectory` as its card shows it, from `list_assets`: its name, description and last edit; refused in the runtime's own words. */
  async summarizeTheProject(projectDirectory: string): Promise<Result<ProjectSummaryTheRuntimeServes, LocalApiRequestFailure>> {
    const operationResult = await this.callControlOperation("list_assets", { project_directory: projectDirectory });
    if (!operationResult.ok) return operationResult;
    const summary = projectSummaryFromTheListAssetsToolResult(operationResult.value);
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** Each import of the project in `projectDirectory` from the runtime's `list_dependencies`, each source read for a newer version with `checkForNewer`; refused in the runtime's own words. */
  listDependencies(projectDirectory: string, checkForNewer: boolean): Promise<Result<ListedProjectDependency[], LocalApiRequestFailure>> {
    return this.answerOf(listDependencies(projectDirectory, checkForNewer));
  }

  /** The files of the project in `projectDirectory`, or of its folder `under` alone, from the runtime's `list_project_files`; refused in the runtime's own words. */
  listProjectFiles(projectDirectory: string, under: string | null): Promise<Result<ProjectFileTheRuntimeListed[], LocalApiRequestFailure>> {
    return this.answerOf(listProjectFiles(projectDirectory, under));
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

  /** `GET requestTarget`, answering the body of a `200`; any other answer is refused in the runtime's own words when its body carries them. */
  private getBodyOfAnOkAnswer(requestTarget: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.answerOf(
      getOverTheLocalApi(this.localApiSocketPath, requestTarget, this.requestTimeoutMs).pipe(Effect.flatMap((response) => bodyOfAnOkAnswer(requestTarget, response))),
    );
  }

  /** `runtimeOperation` run over this client's local API to its end: its answer, or its failure in its words, a refusal as the runtime's. */
  private answerOf<Answer>(runtimeOperation: Effect.Effect<Answer, RuntimeControlFailure, RuntimeControl>): Promise<Result<Answer, LocalApiRequestFailure>> {
    return Effect.runPromise(
      runtimeOperation.pipe(
        Effect.match({
          onSuccess: (answer): Result<Answer, LocalApiRequestFailure> => succeeded(answer),
          onFailure: (failure) => (failure._tag === "RuntimeRefused" ? theRuntimesRefusal(failure.words) : localApiRequestFailure(failure.words)),
        }),
        Effect.provide(this.runtimeControl),
      ),
    );
  }

  /** Call `method` with `params` in one `POST /control`, giving up after its time limit; the operation's own refusal is the runtime's, in its words. */
  private async callControlOperation<Method extends ControlOperationMethodName>(method: Method, params: ControlOperationParams<Method>): Promise<Result<ControlOperationResult<Method>, LocalApiRequestFailure>> {
    const answer = await this.callControlOperationKeepingItsRefusal(method, params);
    if (!answer.ok) return answer;
    return answer.value.kind === "answered" ? succeeded(answer.value.result) : theRuntimesRefusal(answer.value.words);
  }

  /** As `callControlOperation`, but the operation's own refusal is answered apart from every other failure, with the structured refusal when the runtime gave one. */
  private callControlOperationKeepingItsRefusal<Method extends ControlOperationMethodName>(
    method: Method,
    params: ControlOperationParams<Method>,
  ): Promise<Result<ControlOperationAnswer<Method>, LocalApiRequestFailure>> {
    return callOneControlOperationOverAPost(this.localApiSocketPath, method, params, controlOperationTimeLimitMs(method, this.requestTimeoutMs));
  }
}
