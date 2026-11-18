// The app's client of the runtime's local API. Every control operation is one `POST /control` through
// the generated `@tatolab/runtime-client`, typed by the contract the runtime unit carries; `GET
// /health` says the runtime is up and `GET /api/graph` names the machine, each read through
// `getOverTheLocalApi`.

import { Effect, type Layer } from "effect";
import type {
  ListedStream,
  ProjectStreamActionQueued,
  ProjectTheRuntimeNames,
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
import { listDependencies, listStreams, nameTheProject, reloadProject } from "./runtime_operations.js";
import { queuedStreamActionFromTheToolResult, type ProjectActionToolName } from "./stream_changes_on_the_wire.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import {
  callOneControlOperationOverAPost,
  controlOperationTimeLimitMs,
  type ControlOperationAnswer,
  type ControlOperationMethodName,
  type ControlOperationParams,
  type ControlOperationResult,
  type RuntimeControl,
} from "./tatolab_runtime_control_operation_call.js";
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

  /** Queue the reload from disk of the open project in `projectDirectory`, which keeps its playback and retries its failed streams; answered at once, refused in the runtime's own words, as for a project that is not open, which the runtime's `open_project` opens. */
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
