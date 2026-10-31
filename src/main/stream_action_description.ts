// The runtime's answers about a queued load: `create_project` and `run_project`, which answer at
// once with the action they queued, and `describe_stream_action`, which follows it to its end.

import type { ProjectCreationQueued, ProjectRunQueued, StreamActionDescription, StreamTakenInByAnAction } from "../shared/tatolab_backend_contract.js";
import { arrayOrEmpty, everyOneRead, jsonObject, type JsonObjectOnTheWire, optionalText, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

function toolResultObject(toolName: string, toolResultText: string): Result<JsonObjectOnTheWire, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  return parsedToolResult.ok ? jsonObject(parsedToolResult.value, `the ${toolName} result`) : parsedToolResult;
}

function readOrSayWhy<ReadValue>(toolName: string, read: Result<ReadValue, string>): Result<ReadValue, string> {
  return read.ok ? read : failedWith(`the runtime's ${toolName} result could not be read: ${read.failure}`);
}

/** A `create_project` tool result read field for field; unknown fields are ignored. */
export function projectCreationQueuedFromTheCreateProjectToolResult(toolResultText: string): Result<ProjectCreationQueued, string> {
  const toolResult = toolResultObject("create_project", toolResultText);
  if (!toolResult.ok) return readOrSayWhy("create_project", toolResult);
  const action = requiredText(toolResult.value, "action");
  if (!action.ok) return readOrSayWhy("create_project", action);
  const stream = requiredText(toolResult.value, "stream");
  if (!stream.ok) return readOrSayWhy("create_project", stream);
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return readOrSayWhy("create_project", projectDirectory);
  return succeeded({ action: action.value, stream: stream.value, project_directory: projectDirectory.value });
}

/** A `run_project` tool result read field for field; unknown fields are ignored. */
export function projectRunQueuedFromTheRunProjectToolResult(toolResultText: string): Result<ProjectRunQueued, string> {
  const toolResult = toolResultObject("run_project", toolResultText);
  if (!toolResult.ok) return readOrSayWhy("run_project", toolResult);
  const action = requiredText(toolResult.value, "action");
  if (!action.ok) return readOrSayWhy("run_project", action);
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return readOrSayWhy("run_project", projectDirectory);
  return succeeded({ action: action.value, project_directory: projectDirectory.value });
}

function streamTakenInOnTheWire(streamOnTheWire: unknown): Result<StreamTakenInByAnAction, string> {
  const streamTakenIn = jsonObject(streamOnTheWire, "a stream of the action");
  if (!streamTakenIn.ok) return streamTakenIn;
  const stream = requiredText(streamTakenIn.value, "stream");
  if (!stream.ok) return stream;
  const displayName = requiredText(streamTakenIn.value, "display_name");
  if (!displayName.ok) return displayName;
  const state = optionalText(streamTakenIn.value, "state");
  if (!state.ok) return state;
  return succeeded({ stream: stream.value, display_name: displayName.value, state: state.value });
}

/** A `describe_stream_action` tool result read field for field; unknown fields are ignored. */
export function streamActionDescriptionFromTheDescribeStreamActionToolResult(toolResultText: string): Result<StreamActionDescription, string> {
  const toolResult = toolResultObject("describe_stream_action", toolResultText);
  if (!toolResult.ok) return readOrSayWhy("describe_stream_action", toolResult);
  const action = requiredText(toolResult.value, "action");
  if (!action.ok) return readOrSayWhy("describe_stream_action", action);
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return readOrSayWhy("describe_stream_action", projectDirectory);
  const kind = requiredText(toolResult.value, "kind");
  if (!kind.ok) return readOrSayWhy("describe_stream_action", kind);
  const state = requiredText(toolResult.value, "state");
  if (!state.ok) return readOrSayWhy("describe_stream_action", state);
  const step = optionalText(toolResult.value, "step");
  if (!step.ok) return readOrSayWhy("describe_stream_action", step);
  const streamsOnTheWire = arrayOrEmpty(toolResult.value, "streams");
  if (!streamsOnTheWire.ok) return readOrSayWhy("describe_stream_action", streamsOnTheWire);
  const streams = everyOneRead(streamsOnTheWire.value, streamTakenInOnTheWire);
  if (!streams.ok) return readOrSayWhy("describe_stream_action", streams);
  const failedBecause = optionalText(toolResult.value, "failed_because");
  if (!failedBecause.ok) return readOrSayWhy("describe_stream_action", failedBecause);
  return succeeded({
    action: action.value,
    project_directory: projectDirectory.value,
    kind: kind.value,
    state: state.value,
    step: step.value,
    streams: streams.value,
    failed_because: failedBecause.value,
  });
}
