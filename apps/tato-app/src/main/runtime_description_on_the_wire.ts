// How the app reads the runtime's `describe_runtime` answer: its version, build, uptime and own log
// folder, read field for field.

import type { RuntimeDescription } from "../shared/tatolab_backend_contract.js";
import { jsonObject, type JsonObjectOnTheWire, optionalText, requiredText, requiredUnsignedInteger } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { ControlOperationResult } from "./tatolab_runtime_control_operation_call.js";

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
