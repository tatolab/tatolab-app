// What the runtime's tools that change a project's streams answer: the id of the stream action a
// project-wide action queued, and the stream asset, transaction and commit of a change to one stream
// asset.

import { jsonObject, type JsonObjectOnTheWire, requiredObject, requiredText } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { ControlOperationResult } from "./tatolab_runtime_control_operation_call.js";

/** A runtime tool that queues an action on a whole project. */
export type ProjectActionToolName = "stop_playback" | "close_project" | "remove_project" | "delete_project";

/** The action id a tool result that queued a stream action names, read from the result of `toolName`. */
export function queuedStreamActionFromTheToolResult(toolName: ProjectActionToolName, operationResult: ControlOperationResult<ProjectActionToolName>): Result<string, string> {
  const toolResult = jsonObject(operationResult, `the ${toolName} result`);
  const action = toolResult.ok ? requiredText(toolResult.value, "action") : toolResult;
  return action.ok ? action : failedWith(`the runtime's ${toolName} result could not be read: ${action.failure}`);
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
export function streamAssetChangeFromTheToolResult(toolName: StreamAssetChangeToolName, operationResult: ControlOperationResult<StreamAssetChangeToolName>): Result<StreamAssetChange, string> {
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
