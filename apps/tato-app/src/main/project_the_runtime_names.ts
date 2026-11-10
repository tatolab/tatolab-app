// A project as the runtime's tools name it: its folder, its UUID and its name from
// `tatolab-project.json`, and, from `list_assets`, for its card its description and when its
// history last changed. Its assets and every other key are ignored.

import type { ProjectTheRuntimeNames } from "../shared/tatolab_backend_contract.js";
import { arrayOrEmpty, isAJsonObject, optionalText, optionalUnsignedInteger, requiredText, toolResultReadWith, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { succeeded, type Result } from "./result.js";

/** A project as its card on the Projects home shows it: what the runtime names it, what it is, and when it was last edited. */
export interface ProjectSummaryTheRuntimeServes extends ProjectTheRuntimeNames {
  /** `project_description`: what the project is, `null` when nobody has described it. */
  description: string | null;
  /** `project_last_edited_at`, whole seconds since the Unix epoch, as milliseconds for display; `null` before its first commit. */
  last_edited_at_wall_clock_ms: number | null;
  /** The path in the project of the media asset `project_cover` names, `null` when it names none or one the listing does not hold. */
  cover_path: string | null;
}

/** The project `list_assets` answered with `toolResultText`, or why it could not be read. */
export function projectTheRuntimeNamesFromTheListAssetsToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  return toolResultReadWith("list_assets", toolResultText, (toolResult) => projectNamedIn(toolResult, "project_name"));
}

/** The project `list_assets` answered with `toolResultText`, with its description and last edit, or why it could not be read. */
export function projectSummaryFromTheListAssetsToolResult(toolResultText: string): Result<ProjectSummaryTheRuntimeServes, string> {
  return toolResultReadWith("list_assets", toolResultText, projectSummaryIn);
}

/** The project a tool result names by its `project_directory`, its `project` UUID and its name at `nameKey`. */
export function projectNamedIn(toolResult: JsonObjectOnTheWire, nameKey: "project_name" | "name"): Result<ProjectTheRuntimeNames, string> {
  const projectDirectory = requiredText(toolResult, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(toolResult, "project");
  if (!project.ok) return project;
  const projectName = requiredText(toolResult, nameKey);
  if (!projectName.ok) return projectName;
  return succeeded({ folder: projectDirectory.value, project: project.value, name: projectName.value });
}

function projectSummaryIn(toolResult: JsonObjectOnTheWire): Result<ProjectSummaryTheRuntimeServes, string> {
  const named = projectNamedIn(toolResult, "project_name");
  if (!named.ok) return named;
  const description = optionalText(toolResult, "project_description");
  if (!description.ok) return description;
  const lastEditedAtSeconds = optionalUnsignedInteger(toolResult, "project_last_edited_at");
  if (!lastEditedAtSeconds.ok) return lastEditedAtSeconds;
  const cover = optionalText(toolResult, "project_cover");
  if (!cover.ok) return cover;
  const assets = arrayOrEmpty(toolResult, "assets");
  if (!assets.ok) return assets;
  const coverAsset = cover.value === null ? undefined : assets.value.filter(isAJsonObject).find((listedAsset) => listedAsset["asset"] === cover.value);
  const coverPath = typeof coverAsset?.["path"] === "string" ? coverAsset["path"] : null;
  return succeeded({
    ...named.value,
    description: description.value,
    last_edited_at_wall_clock_ms: lastEditedAtSeconds.value === null ? null : lastEditedAtSeconds.value * 1000,
    cover_path: coverPath,
  });
}
