import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenWorkspaceReading } from "../shared/tatolab_backend_contract.js";
import { WorkspaceFiles, workspaceFileVersionOf } from "./workspace_files.js";

const foldersMade: string[] = [];

afterEach(async () => {
  for (const folder of foldersMade.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function aFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-workspace-files-")));
  foldersMade.push(folder);
  return folder;
}

async function writeAFile(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

/** A workspace on disk with its project's `stream.py`, a node file, and a folder import copied inside it. */
async function aWorkspaceOnDisk() {
  const workspaceFolder = await aFolder();
  const importFolder = path.join(workspaceFolder, "imports", "hall-of-light");
  await writeAFile(path.join(workspaceFolder, "pyproject.toml"), "[project]\nname = \"studio\"\n");
  await writeAFile(path.join(workspaceFolder, "stream.py"), "@stream\ndef main(stream_builder):\n    pass\n");
  await writeAFile(path.join(workspaceFolder, "nodes", "aurora_field.py"), "class AuroraField: ...\n");
  await writeAFile(path.join(workspaceFolder, ".venv", "lib", "site.py"), "");
  await writeAFile(path.join(workspaceFolder, "nodes", "__pycache__", "aurora_field.cpython-312.py"), "");
  await writeAFile(path.join(workspaceFolder, "README.md"), "");
  await writeAFile(path.join(importFolder, "pyproject.toml"), "[project]\nname = \"hall-of-light\"\n");
  await writeAFile(path.join(importFolder, "stream.py"), "# imported\n");
  const reading: OpenWorkspaceReading = {
    kind: "read",
    workspace: {
      workspace_project: { folder: workspaceFolder, name: "studio", requirements: ["hall-of-light"] },
      imports: [{ name: "hall-of-light", requirement: "hall-of-light", source: { kind: "folder", project: { folder: importFolder, name: "hall-of-light", requirements: [] } } }],
    },
  };
  return { workspaceFolder, importFolder, workspaceFiles: new WorkspaceFiles(() => reading) };
}

test("a workspace project's file reads with its text, its version, and as editable", async () => {
  const { workspaceFolder, workspaceFiles } = await aWorkspaceOnDisk();
  const streamPy = path.join(workspaceFolder, "stream.py");

  expect(await workspaceFiles.readWorkspaceFile(streamPy)).toEqual({
    ok: true,
    value: {
      file: streamPy,
      project_folder: workspaceFolder,
      text: "@stream\ndef main(stream_builder):\n    pass\n",
      version: workspaceFileVersionOf("@stream\ndef main(stream_builder):\n    pass\n"),
      is_editable: true,
    },
  });
});

test("an import's file reads read-only, though its folder sits inside the workspace project's", async () => {
  const { importFolder, workspaceFiles } = await aWorkspaceOnDisk();

  const read = await workspaceFiles.readWorkspaceFile(path.join(importFolder, "stream.py"));

  expect(read.ok && { project_folder: read.value.project_folder, is_editable: read.value.is_editable }).toEqual({ project_folder: importFolder, is_editable: false });
});

test("a file outside the workspace's projects, by a relative path, by `..`, or through a link, is refused", async () => {
  const { workspaceFolder, workspaceFiles } = await aWorkspaceOnDisk();
  const outsideFolder = await aFolder();
  await writeAFile(path.join(outsideFolder, "secret.py"), "TOKEN = 1\n");
  await symlink(path.join(outsideFolder, "secret.py"), path.join(workspaceFolder, "linked_secret.py"));

  for (const file of ["stream.py", path.join(workspaceFolder, "..", path.basename(outsideFolder), "secret.py"), path.join(workspaceFolder, "linked_secret.py"), workspaceFolder]) {
    const read = await workspaceFiles.readWorkspaceFile(file);
    expect(read.ok ? "read" : read.failure).toContain("is not a file of the open workspace's projects");
  }
});

test("a save based on the version on disk writes the file whole and answers the new version", async () => {
  const { workspaceFolder, workspaceFiles } = await aWorkspaceOnDisk();
  const streamPy = path.join(workspaceFolder, "stream.py");
  const read = await workspaceFiles.readWorkspaceFile(streamPy);
  if (!read.ok) throw new Error(read.failure);

  const saved = await workspaceFiles.saveWorkspaceFile(streamPy, "# edited\n", read.value.version);

  expect(saved).toEqual({ ok: true, value: { version: workspaceFileVersionOf("# edited\n") } });
  expect(await readFile(streamPy, "utf8")).toBe("# edited\n");
});

test("a save over a file changed on disk since it was read writes nothing", async () => {
  const { workspaceFolder, workspaceFiles } = await aWorkspaceOnDisk();
  const streamPy = path.join(workspaceFolder, "stream.py");
  const read = await workspaceFiles.readWorkspaceFile(streamPy);
  if (!read.ok) throw new Error(read.failure);
  await writeFile(streamPy, "# an agent's edit\n");

  expect(await workspaceFiles.saveWorkspaceFile(streamPy, "# mine\n", read.value.version)).toEqual({
    ok: false,
    failure: "stream.py changed on disk since it was opened, so it was not saved.",
  });
  expect(await readFile(streamPy, "utf8")).toBe("# an agent's edit\n");
});

test("a new file saves when based on no version, and an import's file never saves", async () => {
  const { workspaceFolder, importFolder, workspaceFiles } = await aWorkspaceOnDisk();

  expect((await workspaceFiles.saveWorkspaceFile(path.join(workspaceFolder, "nodes", "new_node.py"), "x = 1\n", null)).ok).toBe(true);
  expect(await workspaceFiles.saveWorkspaceFile(path.join(importFolder, "stream.py"), "# no\n", workspaceFileVersionOf("# imported\n"))).toEqual({
    ok: false,
    failure: `${path.join(importFolder, "stream.py")} belongs to an imported project, which the studio opens read-only.`,
  });
});

test("a project's files list its Python files and pyproject.toml, skipping the venv, caches, hidden folders and the projects inside it", async () => {
  const { workspaceFolder, workspaceFiles } = await aWorkspaceOnDisk();

  expect(await workspaceFiles.listWorkspaceProjectFiles(workspaceFolder)).toEqual({
    ok: true,
    value: {
      project_folder: workspaceFolder,
      files: [path.join("nodes", "aurora_field.py"), "pyproject.toml", "stream.py"],
    },
  });
  expect(await workspaceFiles.listWorkspaceProjectFiles("/etc")).toEqual({ ok: false, failure: "/etc is not a project folder of the open workspace." });
});
