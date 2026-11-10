// A project as the runtime's `list_assets` tool names it: its folder, its UUID and its name from
// `tatolab-project.json`, and for its card its description and when its history last changed.
// Its assets and every other key are ignored.

import type { ProjectTheRuntimeNames } from "../shared/tatolab_backend_contract.js";
import { jsonObject, optionalText, optionalUnsignedInteger, parseJsonOnTheWire, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** A project as its card on the Projects home shows it: what the runtime names it, what it is, and when it was last edited. */
export interface ProjectSummaryTheRuntimeServes extends ProjectTheRuntimeNames {
  /** `project_description`: what the project is, `null` when nobody has described it. */
  description: string | null;
  /** `project_last_edited_at`, whole seconds since the Unix epoch, as milliseconds for display; `null` before its first commit. */
  last_edited_at_wall_clock_ms: number | null;
}

/** The project `list_assets` answered with `toolResultText`, or why it could not be read. */
export function projectTheRuntimeNamesFromTheListAssetsToolResult(toolResultText: string): Result<ProjectTheRuntimeNames, string> {
  const listing = listAssetsToolResultObject(toolResultText);
  const project = listing.ok ? projectNamedIn(listing.value) : listing;
  return project.ok ? project : failedWith(`the runtime's list_assets result could not be read: ${project.failure}`);
}

/** The project `list_assets` answered with `toolResultText`, with its description and last edit, or why it could not be read. */
export function projectSummaryFromTheListAssetsToolResult(toolResultText: string): Result<ProjectSummaryTheRuntimeServes, string> {
  const listing = listAssetsToolResultObject(toolResultText);
  const summary = listing.ok ? projectSummaryIn(listing.value) : listing;
  return summary.ok ? summary : failedWith(`the runtime's list_assets result could not be read: ${summary.failure}`);
}

function listAssetsToolResultObject(toolResultText: string): Result<JsonObjectOnTheWire, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  return parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the listing") : parsedToolResult;
}

function projectNamedIn(toolResult: JsonObjectOnTheWire): Result<ProjectTheRuntimeNames, string> {
  const projectDirectory = requiredText(toolResult, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(toolResult, "project");
  if (!project.ok) return project;
  const projectName = requiredText(toolResult, "project_name");
  if (!projectName.ok) return projectName;
  return succeeded({ folder: projectDirectory.value, project: project.value, name: projectName.value });
}

function projectSummaryIn(toolResult: JsonObjectOnTheWire): Result<ProjectSummaryTheRuntimeServes, string> {
  const named = projectNamedIn(toolResult);
  if (!named.ok) return named;
  const description = optionalText(toolResult, "project_description");
  if (!description.ok) return description;
  const lastEditedAtSeconds = optionalUnsignedInteger(toolResult, "project_last_edited_at");
  if (!lastEditedAtSeconds.ok) return lastEditedAtSeconds;
  return succeeded({
    ...named.value,
    description: description.value,
    last_edited_at_wall_clock_ms: lastEditedAtSeconds.value === null ? null : lastEditedAtSeconds.value * 1000,
  });
}
