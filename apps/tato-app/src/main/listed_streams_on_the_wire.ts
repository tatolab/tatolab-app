// What the runtime's `list_streams` answers: every stream it holds, with where it came from, its
// state, and the action and step it is in.

import type { ListedStream, StreamLocation } from "../shared/tatolab_backend_contract.js";
import { arrayOrEmpty, everyOneRead, jsonObject, type JsonObjectOnTheWire, optionalObject, optionalText, optionalUnsignedInteger, requiredText } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

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
