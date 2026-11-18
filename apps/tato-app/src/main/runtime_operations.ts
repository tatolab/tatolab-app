// Each runtime operation the main process asks for, as an Effect on `RuntimeControl`: the control
// operation or plain request it makes, and the reader that walks its answer into the shape Studio
// keeps. Every one fails with a `RuntimeControlFailure`, an answer its reader cannot read as not the
// contract's type.

import { Effect } from "effect";
import type { NodeCatalog, ProjectAssetListing, ProjectLogNarrowing, ProjectLogRecordsPage, ProjectNodeTypeListing, StreamActionCancelAnswer, StreamGraphSummary } from "../shared/tatolab_backend_contract.js";
import { jsonTextKeepingTheWrittenNumbers, prettyJsonTextKeepingTheWrittenNumbers } from "./json_on_the_wire.js";
import { bodyOfAnOkAnswer } from "./local_api_plain_http.js";
import { fromResult } from "./result_as_effect.js";
import { nodeCatalogFromTheRegistryAnswer, nodeCatalogRequestTarget } from "./node_catalog.js";
import { projectAssetListingFromTheListAssetsToolResult } from "./project_asset_listing.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import { projectNodeTypeListingFromTheToolResult } from "./project_node_type_listing.js";
import { ContractMismatch, type RuntimeControlFailure } from "./runtime_control_failures.js";
import { streamActionCancelAnswerFromTheCancelStreamActionToolResult } from "./stream_action_description.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { controlOperationReadWith, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

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
