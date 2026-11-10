// What the runtime answers when a project itself changes: `rename_project` how people see the
// project after the transaction, `duplicate_project` the duplicate, a project of its own under a
// new UUID, and `import_project` the project it unpacked from a `.zip` of one.

import type { ProjectTheRuntimeNames } from "../shared/tatolab_backend_contract.js";
import { requiredText, toolResultReadWith } from "./json_on_the_wire.js";
import { projectNamedIn } from "./project_the_runtime_names.js";
import type { Result } from "./result.js";

/** The project's name after `rename_project`, from its `project_name`. */
export function projectNameFromTheRenameProjectToolResult(toolResultText: string): Result<string, string> {
  return toolResultReadWith("rename_project", toolResultText, (toolResult) => requiredText(toolResult, "project_name"));
}

/** The duplicate `duplicate_project` made: its `project_directory`, `project` and `project_name`. */
export function duplicateFromTheDuplicateProjectToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  return toolResultReadWith("duplicate_project", toolResultText, (toolResult) => projectNamedIn(toolResult, "project_name"));
}

/** The project `import_project` unpacked: its `project_directory`, `project` and `name`. */
export function projectFromTheImportProjectToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  return toolResultReadWith("import_project", toolResultText, (toolResult) => projectNamedIn(toolResult, "name"));
}
