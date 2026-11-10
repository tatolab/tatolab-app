import { expect, test } from "vitest";
import { nodeFileAskedForFromTheTypedPath } from "./node_file_asked_for";

const PROJECT_FOLDER = "/home/sam/streams/s07-code";

test("a typed path asks for that file inside the open project, a leading / or ./ read as the project's folder", () => {
  for (const typedPath of ["nodes/invert.py", " nodes/invert.py ", "/nodes/invert.py", "./nodes/invert.py"]) {
    expect(nodeFileAskedForFromTheTypedPath(PROJECT_FOLDER, typedPath)).toEqual({ kind: "file", file: `${PROJECT_FOLDER}/nodes/invert.py` });
  }
});

test("an empty path or one naming a folder asks for nothing, with why", () => {
  for (const typedPath of ["", "  ", "nodes/", "./", "/"]) {
    expect(nodeFileAskedForFromTheTypedPath(PROJECT_FOLDER, typedPath)).toEqual({ kind: "not_named", why: "Name the file, as nodes/invert.py." });
  }
});
