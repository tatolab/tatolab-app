/** The file a New node file path asks the runtime for: absolute inside the open project, or why none is asked for yet. */
export type NodeFileAskedFor = { kind: "file"; file: string } | { kind: "not_named"; why: string };

const WHY_NO_FILE_IS_NAMED_YET = "Name the file, as nodes/invert.py.";

/** `typedPath` inside `projectFolder`, a leading `/` or `./` read as the project's own folder; a path naming a folder asks for nothing. The runtime decides every other refusal. */
export function nodeFileAskedForFromTheTypedPath(projectFolder: string, typedPath: string): NodeFileAskedFor {
  const pathInTheProject = typedPath.trim().replace(/^(\.\/|\/)+/, "");
  if (pathInTheProject === "" || pathInTheProject.endsWith("/")) return { kind: "not_named", why: WHY_NO_FILE_IS_NAMED_YET };
  return { kind: "file", file: `${projectFolder}/${pathInTheProject}` };
}
