// A project's imports as the runtime's dependency tools answer them: `add_dependency` the import it
// copied, `update_dependency` the copy it committed or the files edited since the last one, and
// `list_dependencies` each import with the files of its folder edited since its copy and, with
// `check_for_newer`, whether its source holds another version. Every other key is ignored.

import type { ProjectDependency, WorkspaceDependencyUpdate } from "../shared/tatolab_backend_contract.js";
import { arrayOrEmpty, everyOneRead, jsonObject, type JsonObjectOnTheWire, optionalText, requiredArray, requiredText, requiredTrueOrFalse } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** One import as `list_dependencies` answers it. */
export interface ListedProjectDependency {
  dependency: ProjectDependency;
  edited_files: string[];
  /** `null` when the sources were not read, or this one's could not be. */
  newer_version_exists: boolean | null;
  check_refused_because: string | null;
}

/** The import `add_dependency` answered with `operationResult`, or why it could not be read. */
export function projectDependencyFromTheAddDependencyToolResult(operationResult: unknown): Result<ProjectDependency, string> {
  const dependency = withTheToolResultObject(operationResult, (toolResult) => {
    const dependencyOnTheWire = jsonObject(toolResult["dependency"], "the dependency");
    return dependencyOnTheWire.ok ? projectDependencyOnTheWire(dependencyOnTheWire.value) : dependencyOnTheWire;
  });
  return dependency.ok ? dependency : failedWith(`the runtime's add_dependency result could not be read: ${dependency.failure}`);
}

/** What `update_dependency` answered with `operationResult`: the copy it committed, or the files it waits on the overwrite of; or why it could not be read. */
export function dependencyUpdateFromTheUpdateDependencyToolResult(operationResult: unknown): Result<WorkspaceDependencyUpdate, string> {
  const update = withTheToolResultObject(operationResult, (toolResult): Result<WorkspaceDependencyUpdate, string> => {
    const overwriteConfirmationNeeded = requiredTrueOrFalse(toolResult, "overwrite_confirmation_needed");
    if (!overwriteConfirmationNeeded.ok) return overwriteConfirmationNeeded;
    if (overwriteConfirmationNeeded.value) {
      const editedFiles = textsUnder(toolResult, "edited_files");
      return editedFiles.ok ? succeeded({ kind: "edited_since_its_copy", edited_files: editedFiles.value }) : editedFiles;
    }
    const dependencyOnTheWire = jsonObject(toolResult["dependency"], "the dependency");
    if (!dependencyOnTheWire.ok) return dependencyOnTheWire;
    const dependency = projectDependencyOnTheWire(dependencyOnTheWire.value);
    return dependency.ok ? succeeded({ kind: "updated", dependency: dependency.value }) : dependency;
  });
  return update.ok ? update : failedWith(`the runtime's update_dependency result could not be read: ${update.failure}`);
}

/** Each import `list_dependencies` answered with `operationResult`, in the order `tatolab-project.json` lists them, or why they could not be read. */
export function workspaceDependenciesFromTheListDependenciesToolResult(operationResult: unknown): Result<ListedProjectDependency[], string> {
  const listed = withTheToolResultObject(operationResult, (toolResult) => {
    const dependencies = requiredArray(toolResult, "dependencies");
    return dependencies.ok ? everyOneRead(dependencies.value, listedProjectDependencyOnTheWire) : dependencies;
  });
  return listed.ok ? listed : failedWith(`the runtime's list_dependencies result could not be read: ${listed.failure}`);
}

function withTheToolResultObject<ReadValue>(operationResult: unknown, readTheToolResult: (toolResult: JsonObjectOnTheWire) => Result<ReadValue, string>): Result<ReadValue, string> {
  const toolResult = jsonObject(operationResult, "the tool result");
  return toolResult.ok ? readTheToolResult(toolResult.value) : toolResult;
}

function projectDependencyOnTheWire(dependency: JsonObjectOnTheWire): Result<ProjectDependency, string> {
  const project = requiredText(dependency, "project");
  if (!project.ok) return project;
  const folder = requiredText(dependency, "folder");
  if (!folder.ok) return folder;
  const source = requiredText(dependency, "source");
  if (!source.ok) return source;
  const version = requiredText(dependency, "version");
  if (!version.ok) return version;
  return succeeded({ project: project.value, folder: folder.value, source: source.value, version: version.value });
}

function listedProjectDependencyOnTheWire(listedValue: unknown): Result<ListedProjectDependency, string> {
  const listed = jsonObject(listedValue, "a listed dependency");
  if (!listed.ok) return listed;
  const dependencyOnTheWire = jsonObject(listed.value["dependency"], "the dependency");
  if (!dependencyOnTheWire.ok) return dependencyOnTheWire;
  const dependency = projectDependencyOnTheWire(dependencyOnTheWire.value);
  if (!dependency.ok) return dependency;
  const editedFiles = textsUnder(listed.value, "edited_files");
  if (!editedFiles.ok) return editedFiles;
  const newerVersionExists = listed.value["newer_version_exists"];
  if (newerVersionExists !== undefined && newerVersionExists !== null && typeof newerVersionExists !== "boolean") return failedWith("`newer_version_exists` is not true or false");
  const checkRefusedBecause = optionalText(listed.value, "check_refused_because");
  if (!checkRefusedBecause.ok) return checkRefusedBecause;
  return succeeded({ dependency: dependency.value, edited_files: editedFiles.value, newer_version_exists: newerVersionExists ?? null, check_refused_because: checkRefusedBecause.value });
}

function textsUnder(jsonObjectOnTheWire: JsonObjectOnTheWire, key: string): Result<string[], string> {
  const values = arrayOrEmpty(jsonObjectOnTheWire, key);
  if (!values.ok) return values;
  return everyOneRead(values.value, (value) => (typeof value === "string" ? succeeded(value) : failedWith(`\`${key}\` holds something that is not text`)));
}
