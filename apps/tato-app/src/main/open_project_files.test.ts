import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenProjectReading } from "../shared/tatolab_backend_contract.js";
import { OpenProjectFiles, projectFileVersionOf } from "./open_project_files.js";

const foldersMade: string[] = [];

afterEach(async () => {
  for (const folder of foldersMade.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function aFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-project-files-")));
  foldersMade.push(folder);
  return folder;
}

async function writeAFile(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

/** A project on disk with its project's `stream.py`, a node file, and a folder import copied inside it. */
async function aProjectOnDisk() {
  const projectFolder = await aFolder();
  const importFolder = path.join(projectFolder, "imports", "hall-of-light");
  await writeAFile(path.join(projectFolder, "pyproject.toml"), "[project]\nname = \"studio\"\n");
  await writeAFile(path.join(projectFolder, "stream.py"), "@stream\ndef main(stream_builder):\n    pass\n");
  await writeAFile(path.join(projectFolder, "nodes", "aurora_field.py"), "class AuroraField: ...\n");
  await writeAFile(path.join(projectFolder, ".venv", "lib", "site.py"), "");
  await writeAFile(path.join(projectFolder, "nodes", "__pycache__", "aurora_field.cpython-312.py"), "");
  await writeAFile(path.join(projectFolder, "README.md"), "");
  await writeAFile(path.join(importFolder, "pyproject.toml"), "[project]\nname = \"hall-of-light\"\n");
  await writeAFile(path.join(importFolder, "stream.py"), "# imported\n");
  const reading: OpenProjectReading = {
    kind: "read",
    open_project: {
      project: { folder: projectFolder, name: "studio", requirements: ["hall-of-light"] },
      imports: [{ name: "hall-of-light", requirement: "hall-of-light", source: { kind: "folder", project: { folder: importFolder, name: "hall-of-light", requirements: [] } } }],
    },
  };
  return { projectFolder, importFolder, openProjectFiles: new OpenProjectFiles(() => reading) };
}

test("an open project's file reads with its text, its version, and as editable", async () => {
  const { projectFolder, openProjectFiles } = await aProjectOnDisk();
  const streamPy = path.join(projectFolder, "stream.py");

  expect(await openProjectFiles.readProjectFile(streamPy)).toEqual({
    ok: true,
    value: {
      file: streamPy,
      project_folder: projectFolder,
      text: "@stream\ndef main(stream_builder):\n    pass\n",
      version: projectFileVersionOf("@stream\ndef main(stream_builder):\n    pass\n"),
      is_editable: true,
    },
  });
});

test("an import's file reads read-only, though its folder sits inside the open project's", async () => {
  const { importFolder, openProjectFiles } = await aProjectOnDisk();

  const read = await openProjectFiles.readProjectFile(path.join(importFolder, "stream.py"));

  expect(read.ok && { project_folder: read.value.project_folder, is_editable: read.value.is_editable }).toEqual({ project_folder: importFolder, is_editable: false });
});

test("a file outside the open project and its imports, by a relative path, by `..`, or through a link, is refused", async () => {
  const { projectFolder, openProjectFiles } = await aProjectOnDisk();
  const outsideFolder = await aFolder();
  await writeAFile(path.join(outsideFolder, "secret.py"), "TOKEN = 1\n");
  await symlink(path.join(outsideFolder, "secret.py"), path.join(projectFolder, "linked_secret.py"));

  for (const file of ["stream.py", path.join(projectFolder, "..", path.basename(outsideFolder), "secret.py"), path.join(projectFolder, "linked_secret.py"), projectFolder]) {
    const read = await openProjectFiles.readProjectFile(file);
    expect(read.ok ? "read" : read.failure).toContain("is not a file of the open project or its imports");
  }
});

test("a save based on the version on disk writes the file whole and answers the new version", async () => {
  const { projectFolder, openProjectFiles } = await aProjectOnDisk();
  const streamPy = path.join(projectFolder, "stream.py");
  const read = await openProjectFiles.readProjectFile(streamPy);
  if (!read.ok) throw new Error(read.failure);

  const saved = await openProjectFiles.saveProjectFile(streamPy, "# edited\n", read.value.version);

  expect(saved).toEqual({ ok: true, value: { version: projectFileVersionOf("# edited\n") } });
  expect(await readFile(streamPy, "utf8")).toBe("# edited\n");
});

test("a save over a file changed on disk since it was read writes nothing", async () => {
  const { projectFolder, openProjectFiles } = await aProjectOnDisk();
  const streamPy = path.join(projectFolder, "stream.py");
  const read = await openProjectFiles.readProjectFile(streamPy);
  if (!read.ok) throw new Error(read.failure);
  await writeFile(streamPy, "# an agent's edit\n");

  expect(await openProjectFiles.saveProjectFile(streamPy, "# mine\n", read.value.version)).toEqual({
    ok: false,
    failure: "stream.py changed on disk since it was opened, so it was not saved.",
  });
  expect(await readFile(streamPy, "utf8")).toBe("# an agent's edit\n");
});

test("a new file saves when based on no version, and an import's file never saves", async () => {
  const { projectFolder, importFolder, openProjectFiles } = await aProjectOnDisk();

  expect((await openProjectFiles.saveProjectFile(path.join(projectFolder, "nodes", "new_node.py"), "x = 1\n", null)).ok).toBe(true);
  expect(await openProjectFiles.saveProjectFile(path.join(importFolder, "stream.py"), "# no\n", projectFileVersionOf("# imported\n"))).toEqual({
    ok: false,
    failure: `${path.join(importFolder, "stream.py")} belongs to an imported project, which the studio opens read-only.`,
  });
});

test("a project's files list its Python files and pyproject.toml, skipping the venv, caches, hidden folders and the projects inside it", async () => {
  const { projectFolder, openProjectFiles } = await aProjectOnDisk();

  expect(await openProjectFiles.listProjectFiles(projectFolder)).toEqual({
    ok: true,
    value: {
      project_folder: projectFolder,
      files: [path.join("nodes", "aurora_field.py"), "pyproject.toml", "stream.py"],
    },
  });
  expect(await openProjectFiles.listProjectFiles("/etc")).toEqual({ ok: false, failure: "/etc is not the folder of the open project or of one of its imports." });
});
