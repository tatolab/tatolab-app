// What the runtime answers when a project itself changes: `rename_project` how people see the
// project after the transaction, `duplicate_project` the duplicate, a project of its own, and
// `import_project` the project it unpacked from a `.zip` of one.

import { jsonObject, parseJsonOnTheWire, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** A project the runtime made in a folder of its own, from a duplicate or a `.zip`. */
export interface ProjectMadeByTheRuntime {
  /** The new project's folder, symlinks resolved. */
  folder: string;
  /** Its UUID, new to it. */
  project: string;
  name: string;
}

function readTheToolResult<Read>(toolName: string, toolResultText: string, readTheResult: (toolResult: JsonObjectOnTheWire) => Result<Read, string>): Result<Read, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, `the ${toolName} result`) : parsedToolResult;
  const read = toolResult.ok ? readTheResult(toolResult.value) : toolResult;
  return read.ok ? read : failedWith(`the runtime's ${toolName} result could not be read: ${read.failure}`);
}

function projectMadeIn(toolResult: JsonObjectOnTheWire, nameKey: "project_name" | "name"): Result<ProjectMadeByTheRuntime, string> {
  const projectDirectory = requiredText(toolResult, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(toolResult, "project");
  if (!project.ok) return project;
  const name = requiredText(toolResult, nameKey);
  if (!name.ok) return name;
  return succeeded({ folder: projectDirectory.value, project: project.value, name: name.value });
}

/** The project's name after `rename_project`, from its `project_name`. */
export function projectNameFromTheRenameProjectToolResult(toolResultText: string): Result<string, string> {
  return readTheToolResult("rename_project", toolResultText, (toolResult) => requiredText(toolResult, "project_name"));
}

/** The duplicate `duplicate_project` made: its `project_directory`, `project` and `project_name`. */
export function duplicateFromTheDuplicateProjectToolResult(toolResultText: string): Result<ProjectMadeByTheRuntime, string> {
  return readTheToolResult("duplicate_project", toolResultText, (toolResult) => projectMadeIn(toolResult, "project_name"));
}

/** The project `import_project` unpacked: its `project_directory`, `project` and `name`. */
export function projectFromTheImportProjectToolResult(toolResultText: string): Result<ProjectMadeByTheRuntime, string> {
  return readTheToolResult("import_project", toolResultText, (toolResult) => projectMadeIn(toolResult, "name"));
}
