// The runtime's answers about a queued stream action: `create_project`, `start_project` and `reload_project`, which answer
// at once with the action they queued, `describe_stream_action`, which follows it to its end, and
// `cancel_stream_action`, which ends it early.

import type {
  ProjectCreationQueued,
  ProjectRunQueued,
  StreamActionCancelAnswer,
  StreamActionDescription,
  StreamActionVenvSync,
  StreamActionVenvSyncPackage,
  StreamTakenInByAnAction,
} from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
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

/** A `start_project` or `reload_project` tool result, named by `toolName`, read field for field; unknown fields are ignored. */
export function projectRunQueuedFromTheStartOrReloadProjectToolResult(
  toolName: "start_project" | "reload_project",
  toolResultText: string,
): Result<ProjectRunQueued, string> {
  const toolResult = toolResultObject(toolName, toolResultText);
  if (!toolResult.ok) return readOrSayWhy(toolName, toolResult);
  const action = requiredText(toolResult.value, "action");
  if (!action.ok) return readOrSayWhy(toolName, action);
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return readOrSayWhy(toolName, projectDirectory);
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
  const venvSyncOnTheWire = optionalObject(toolResult.value, "venv_sync");
  if (!venvSyncOnTheWire.ok) return readOrSayWhy("describe_stream_action", venvSyncOnTheWire);
  const venvSync = venvSyncOnTheWire.value === null ? succeeded(null) : venvSyncOnTheWireRead(venvSyncOnTheWire.value);
  if (!venvSync.ok) return readOrSayWhy("describe_stream_action", venvSync);
  return succeeded({
    action: action.value,
    project_directory: projectDirectory.value,
    kind: kind.value,
    state: state.value,
    step: step.value,
    streams: streams.value,
    failed_because: failedBecause.value,
    venv_sync: venvSync.value,
  });
}

function venvSyncPackageOnTheWireRead(packageOnTheWire: unknown): Result<StreamActionVenvSyncPackage, string> {
  const venvSyncPackage = jsonObject(packageOnTheWire, "a package of the venv sync");
  if (!venvSyncPackage.ok) return venvSyncPackage;
  const name = requiredText(venvSyncPackage.value, "name");
  if (!name.ok) return name;
  const version = optionalText(venvSyncPackage.value, "version");
  if (!version.ok) return version;
  const kind = requiredText(venvSyncPackage.value, "kind");
  if (!kind.ok) return kind;
  const state = requiredText(venvSyncPackage.value, "state");
  if (!state.ok) return state;
  const downloadSizeBytes = optionalUnsignedInteger(venvSyncPackage.value, "download_size_bytes");
  if (!downloadSizeBytes.ok) return downloadSizeBytes;
  return succeeded({ name: name.value, version: version.value, kind: kind.value, state: state.value, download_size_bytes: downloadSizeBytes.value });
}

function venvSyncOnTheWireRead(venvSyncOnTheWire: JsonObjectOnTheWire): Result<StreamActionVenvSync, string> {
  const phase = requiredText(venvSyncOnTheWire, "phase");
  if (!phase.ok) return phase;
  const packagesResolved = optionalUnsignedInteger(venvSyncOnTheWire, "packages_resolved");
  if (!packagesResolved.ok) return packagesResolved;
  const packagesPrepared = optionalUnsignedInteger(venvSyncOnTheWire, "packages_prepared");
  if (!packagesPrepared.ok) return packagesPrepared;
  const packagesInstalled = optionalUnsignedInteger(venvSyncOnTheWire, "packages_installed");
  if (!packagesInstalled.ok) return packagesInstalled;
  const downloadsStarted = requiredUnsignedInteger(venvSyncOnTheWire, "downloads_started");
  if (!downloadsStarted.ok) return downloadsStarted;
  const downloadsDone = requiredUnsignedInteger(venvSyncOnTheWire, "downloads_done");
  if (!downloadsDone.ok) return downloadsDone;
  const packagesOnTheWire = arrayOrEmpty(venvSyncOnTheWire, "packages");
  if (!packagesOnTheWire.ok) return packagesOnTheWire;
  const packages = everyOneRead(packagesOnTheWire.value, venvSyncPackageOnTheWireRead);
  if (!packages.ok) return packages;
  return succeeded({
    phase: phase.value,
    packages_resolved: packagesResolved.value,
    packages_prepared: packagesPrepared.value,
    packages_installed: packagesInstalled.value,
    downloads_started: downloadsStarted.value,
    downloads_done: downloadsDone.value,
    packages: packages.value,
  });
}

/** A `cancel_stream_action` tool result read field for field; unknown fields are ignored. */
export function streamActionCancelAnswerFromTheCancelStreamActionToolResult(toolResultText: string): Result<StreamActionCancelAnswer, string> {
  const toolResult = toolResultObject("cancel_stream_action", toolResultText);
  if (!toolResult.ok) return readOrSayWhy("cancel_stream_action", toolResult);
  const action = requiredText(toolResult.value, "action");
  if (!action.ok) return readOrSayWhy("cancel_stream_action", action);
  const state = requiredText(toolResult.value, "state");
  if (!state.ok) return readOrSayWhy("cancel_stream_action", state);
  return succeeded({ action: action.value, state: state.value });
}
