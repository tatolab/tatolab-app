// What the runtime answers when a project itself changes: `rename_project`, `set_project_description`
// and `set_project_cover` how people see the project after the transaction, `import_asset`, `relocate_asset` and
// `delete_asset` the asset each changed, `duplicate_project` the duplicate, a project of its own under a
// new UUID, and `import_project` the project it unpacked from a `.zip` of one.

import type { ProjectTheRuntimeNames } from "../shared/tatolab_backend_contract.js";
import { optionalText, requiredObject, requiredText, toolResultReadWith, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { projectNamedIn } from "./project_the_runtime_names.js";
import { succeeded, type Result } from "./result.js";

/** How people see a project after `rename_project`, `set_project_description` or `set_project_cover`: its `project_name`, `project_description` and `project_cover`. */
export interface ProjectSettingsAfterTheTransaction {
  name: string;
  description: string | null;
  /** The UUID of the media asset the project is shown by, `null` when it has none. */
  cover: string | null;
}

/** A media, scene or data asset an asset tool answered: its UUID and its `/`-separated path in the project. */
export interface ProjectAssetAtItsPath {
  asset: string;
  path: string;
}

function projectSettingsIn(toolResult: JsonObjectOnTheWire): Result<ProjectSettingsAfterTheTransaction, string> {
  const name = requiredText(toolResult, "project_name");
  if (!name.ok) return name;
  const description = optionalText(toolResult, "project_description");
  if (!description.ok) return description;
  const cover = optionalText(toolResult, "project_cover");
  if (!cover.ok) return cover;
  return succeeded({ name: name.value, description: description.value, cover: cover.value });
}

/** The tools that change how people see a project, each answering its settings after the transaction. */
export type ProjectSettingsTool = "rename_project" | "set_project_description" | "set_project_cover";

/** How people see the project after `toolName`, one of the tools that change its settings, answered `toolResultText`. */
export function projectSettingsFromTheToolResult(toolName: ProjectSettingsTool, toolResultText: string): Result<ProjectSettingsAfterTheTransaction, string> {
  return toolResultReadWith(toolName, toolResultText, projectSettingsIn);
}

/** The tools that answer one asset: the one `import_asset` made, the one `relocate_asset` put at its new path, and the one `delete_asset` stopped tracking, as it was. */
export type ProjectAssetTool = "import_asset" | "relocate_asset" | "delete_asset";

/** The asset `toolName` answered, from its `asset`'s `asset` and `path`. */
export function assetAtItsPathFromTheToolResult(toolName: ProjectAssetTool, toolResultText: string): Result<ProjectAssetAtItsPath, string> {
  return toolResultReadWith(toolName, toolResultText, (toolResult) => {
    const assetTheToolAnswered = requiredObject(toolResult, "asset");
    if (!assetTheToolAnswered.ok) return assetTheToolAnswered;
    const asset = requiredText(assetTheToolAnswered.value, "asset");
    if (!asset.ok) return asset;
    const assetPath = requiredText(assetTheToolAnswered.value, "path");
    if (!assetPath.ok) return assetPath;
    return succeeded({ asset: asset.value, path: assetPath.value });
  });
}

/** The duplicate `duplicate_project` made: its `project_directory`, `project` and `project_name`. */
export function duplicateFromTheDuplicateProjectToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  return toolResultReadWith("duplicate_project", toolResultText, (toolResult) => projectNamedIn(toolResult, "project_name"));
}

/** The project `import_project` unpacked: its `project_directory`, `project` and `name`. */
export function projectFromTheImportProjectToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  return toolResultReadWith("import_project", toolResultText, (toolResult) => projectNamedIn(toolResult, "name"));
}
