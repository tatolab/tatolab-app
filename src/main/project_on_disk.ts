// A project folder as its `pyproject.toml` describes it: its name, its requirements, and which of
// them a uv `path` source puts in a folder. The app reads only this shape; what Python a project
// holds is the runtime's to answer.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ProjectOnDisk } from "../shared/tatolab_backend_contract.js";
import { isAMissingFileFailure, realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The file a project is described by, at its folder's root. */
export const PROJECT_DESCRIPTION_FILE_NAME = "pyproject.toml";

/** A project read from its folder, and the folder each requirement's uv `path` source names, by the requirement's normalized name. */
export interface ProjectReadFromItsFolder {
  project: ProjectOnDisk;
  pathSourceFoldersByRequirementName: ReadonlyMap<string, string>;
}

/** `packageName` as PEP 503 normalizes it, so `Hall_Of.Light` and `hall-of-light` name one project. */
export function normalizedPackageName(packageName: string): string {
  return packageName.toLowerCase().replace(/[-_.]+/g, "-");
}

/** The name a PEP 508 requirement opens with, normalized; `null` for text that opens with none. */
export function requirementsPackageName(requirement: string): string | null {
  const leadingName = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(requirement);
  const packageName = leadingName?.[1];
  return packageName === undefined ? null : normalizedPackageName(packageName);
}

function pathSourceFoldersIn(parsedProjectDescription: Record<string, unknown>, projectFolder: string): Map<string, string> {
  const pathSourceFolders = new Map<string, string>();
  const tool = parsedProjectDescription["tool"];
  const uv = isAJsonObject(tool) ? tool["uv"] : undefined;
  const sources = isAJsonObject(uv) ? uv["sources"] : undefined;
  if (!isAJsonObject(sources)) return pathSourceFolders;
  for (const [requirementName, source] of Object.entries(sources)) {
    const sourcePath = isAJsonObject(source) ? source["path"] : undefined;
    if (typeof sourcePath === "string") pathSourceFolders.set(normalizedPackageName(requirementName), path.resolve(projectFolder, sourcePath));
  }
  return pathSourceFolders;
}

/** The project in `projectFolder`, or why it could not be read, in the words of what refused: a missing `pyproject.toml`, one that is not TOML (naming its line), or one with no `[project] name`. */
export async function readProjectFromItsFolder(projectFolder: string): Promise<Result<ProjectReadFromItsFolder, string>> {
  const resolvedFolder = await realPathOrAsGiven(path.resolve(projectFolder));
  const descriptionPath = path.join(resolvedFolder, PROJECT_DESCRIPTION_FILE_NAME);
  let descriptionText: string;
  try {
    descriptionText = await readFile(descriptionPath, "utf8");
  } catch (readFailure) {
    return failedWith(
      isAMissingFileFailure(readFailure)
        ? `${resolvedFolder} has no ${PROJECT_DESCRIPTION_FILE_NAME}.`
        : `${descriptionPath} could not be read: ${describeCaughtFailure(readFailure)}`,
    );
  }
  let parsedProjectDescription: Record<string, unknown>;
  try {
    parsedProjectDescription = parseToml(descriptionText);
  } catch (parseFailure) {
    return failedWith(`${descriptionPath} is not TOML: ${describeCaughtFailure(parseFailure)}`);
  }
  const projectTable = parsedProjectDescription["project"];
  const projectName = isAJsonObject(projectTable) ? projectTable["name"] : undefined;
  if (!isAJsonObject(projectTable) || typeof projectName !== "string") return failedWith(`${descriptionPath} names no [project] name.`);
  const dependencies = projectTable["dependencies"];
  const requirements = Array.isArray(dependencies) ? dependencies.filter((requirement): requirement is string => typeof requirement === "string") : [];
  return succeeded({
    project: { folder: resolvedFolder, name: projectName, requirements },
    pathSourceFoldersByRequirementName: pathSourceFoldersIn(parsedProjectDescription, resolvedFolder),
  });
}
