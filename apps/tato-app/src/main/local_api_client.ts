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
} from "../shared/tatolab_backend_contract.js";
import {
  isAJsonObject,
  parseJsonOnTheWire,
  requiredText,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { bodyOfAnOkAnswer, getOverTheLocalApi } from "./local_api_plain_http.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { createProject, listDependencies, listProjectFiles, listStreams, nameTheProject, openProject, readProjectFile, reloadProject } from "./runtime_operations.js";
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
  projectFileWriteFromTheWriteProjectFileToolResult,
  nodeFileCreationFromTheCreateNodeFileToolResult,
  type NodeFileCreationRecorded,
  type ProjectFileTheRuntimeListed,
  type ProjectFileWriteRecorded,
} from "./project_files_on_the_wire.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";

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

  /** Every stream the runtime holds, from its `list_streams` tool. */
  listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    return this.answerOf(listStreams());
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
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    return this.answerOf(createProject(projectDirectory));
  }


  /** Queue the open of the closed or never-opened project in `projectDirectory`, which loads every stream asset in it with its playback stopped; answered at once, refused in the runtime's own words, as for an open project, which `reloadProject` re-reads. */
  openProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.answerOf(openProject(projectDirectory));
  }

  /** Queue the reload from disk of the open project in `projectDirectory`, which keeps its playback and retries its failed streams; answered at once, refused in the runtime's own words, as for a project that is not open, which `openProject` opens. */
  reloadProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.answerOf(reloadProject(projectDirectory));
  }

  /** The project in `projectDirectory` as the runtime's `list_assets` names it; refused in the runtime's own words, as for a folder holding no `tatolab-project.json`. */
  nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    return this.answerOf(nameTheProject(projectDirectory));
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
  readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, LocalApiRequestFailure>> {
    return this.answerOf(readProjectFile(projectDirectory, filePath));
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
          onFailure: (failure) =>
            failure._tag === "RuntimeRefused" || failure._tag === "RuntimeOfAnotherContract" ? theRuntimesRefusal(failure.words) : localApiRequestFailure(failure.words),
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
