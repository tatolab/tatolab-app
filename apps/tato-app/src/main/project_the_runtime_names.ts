// A project as the runtime's `list_assets` tool names it: its folder, its UUID and its name from
// `tatolab-project.json`. Its assets and every other key are ignored.

import type { ProjectTheRuntimeNames } from "../shared/tatolab_backend_contract.js";
import { jsonObject, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The project `list_assets` answered with `toolResultText`, or why it could not be read. */
export function projectTheRuntimeNamesFromTheListAssetsToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  const project = projectFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return project.ok ? project : failedWith(`the runtime's list_assets result could not be read: ${project.failure}`);
}

function projectFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ProjectTheRuntimeNames, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the listing");
  if (!toolResult.ok) return toolResult;
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(toolResult.value, "project");
  if (!project.ok) return project;
  const projectName = requiredText(toolResult.value, "project_name");
  if (!projectName.ok) return projectName;
  return succeeded({ folder: projectDirectory.value, project: project.value, name: projectName.value });
}
