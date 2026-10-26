import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { inspectStreamProjectFolder, pythonVersionNamedIn, streamFunctionsMarkedIn } from "./stream_project_folder_inspection.js";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function temporaryProjectFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-app-project-"));
  temporaryFolders.push(folder);
  return folder;
}

async function writeProjectFile(projectFolder: string, pathInProject: string, contents: string): Promise<void> {
  await mkdir(path.dirname(path.join(projectFolder, pathInProject)), { recursive: true });
  await writeFile(path.join(projectFolder, pathInProject), contents);
}

test("the module-level @stream functions are found in file order, past other decorators and comments", () => {
  const streamFileText = [
    "from tatolab.stream import StreamBuilder, stream",
    "",
    "@stream",
    "def heat_map(stream_builder: StreamBuilder) -> None:",
    "    pass",
    "",
    "@stream  # the lobby's",
    "@functools.cache",
    "# a comment between",
    "async def lobby_wall(stream_builder):",
    "    pass",
    "",
    "@other",
    "def not_a_stream(): pass",
    "",
    "class Holder:",
    "    @stream",
    "    def nested(self): pass",
    "",
    "@stream",
    "x = 1",
    "def after_an_assignment(): pass",
  ].join("\n");
  expect(streamFunctionsMarkedIn(streamFileText)).toEqual(["heat_map", "lobby_wall"]);
});

test("the Python version is uv's version_info, else the standard library's version", () => {
  expect(pythonVersionNamedIn("home = /opt/python/bin\nimplementation = CPython\nuv = 0.9.2\nversion_info = 3.12.7\n")).toBe("3.12.7");
  expect(pythonVersionNamedIn("home = /usr/bin\nversion = 3.12.3\n")).toBe("3.12.3");
  expect(pythonVersionNamedIn("home = /usr/bin\n")).toBeNull();
});

test("a project with stream.py and a synced .venv reports its functions, Python and tatolab-stream", async () => {
  const projectFolder = await temporaryProjectFolder();
  await writeProjectFile(projectFolder, "stream.py", "@stream\ndef main(stream_builder):\n    pass\n");
  await writeProjectFile(projectFolder, ".venv/pyvenv.cfg", "version_info = 3.12.7\n");
  await writeProjectFile(projectFolder, ".venv/bin/python3.12", "");
  await symlink("python3.12", path.join(projectFolder, ".venv/bin/python"));
  await mkdir(path.join(projectFolder, ".venv/lib/python3.12/site-packages/tatolab_stream-0.55.1.dist-info"), { recursive: true });

  expect(await inspectStreamProjectFolder(projectFolder)).toEqual({
    folder: projectFolder,
    folder_exists: true,
    stream_file_present: true,
    stream_functions: ["main"],
    python_environment: { kind: "present", python_version: "3.12.7", tatolab_stream_version: "0.55.1" },
  });
});

test("a project without .venv/bin/python reports its environment missing, and a folder not there yet reports nothing", async () => {
  const projectFolder = await temporaryProjectFolder();
  await writeProjectFile(projectFolder, "stream.py", "print('no stream here')\n");
  await writeProjectFile(projectFolder, ".venv/pyvenv.cfg", "version_info = 3.12.7\n");

  expect(await inspectStreamProjectFolder(projectFolder)).toEqual({
    folder: projectFolder,
    folder_exists: true,
    stream_file_present: true,
    stream_functions: [],
    python_environment: { kind: "missing" },
  });

  const folderNotThereYet = path.join(projectFolder, "streams", "hello");
  expect(await inspectStreamProjectFolder(folderNotThereYet)).toEqual({
    folder: folderNotThereYet,
    folder_exists: false,
    stream_file_present: false,
    stream_functions: [],
    python_environment: { kind: "missing" },
  });
});
