import path from "node:path";
import { expect, test } from "vitest";
import type { OpenProjectReading, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { OpenProjectFiles, projectFileVersionOf, type ProjectFilesOfTheRuntime } from "./open_project_files.js";
import { failedWith, succeeded } from "./result.js";

const PROJECT_FOLDER = "/home/sam/streams/studio";
const IMPORT_FOLDER = `${PROJECT_FOLDER}/imports/hall-of-light`;
const SAM: ProjectTransactionAuthor = { kind: "person", name: "sam" };

const OPEN_PROJECT: OpenProjectReading = {
  kind: "read",
  open_project: {
    project: { folder: PROJECT_FOLDER, project: "0b6f3c1e-2d4a-4e8b-9c7d-5a1f8e3b6d20", name: "studio" },
    imports: [
      {
        project: "dde5a62f-b0a8-45d2-a741-79140871f978",
        name: "hall-of-light",
        folder: "hall-of-light",
        source: { kind: "folder", project: { folder: IMPORT_FOLDER, project: "dde5a62f-b0a8-45d2-a741-79140871f978", name: "hall-of-light" } },
      },
    ],
    imports_not_listed_because: null,
  },
};

interface WriteTheRuntimeWasAsked {
  project_directory: string;
  path: string;
  text: string;
  author: ProjectTransactionAuthor;
  idempotency_key: string;
}

/** The runtime's file tools over files held in memory by their `/`-separated path in the open project, as `list_project_files`, `read_project_file` and `write_project_file` answer, recording each write asked. */
class FakeProjectFilesOfTheRuntime implements ProjectFilesOfTheRuntime {
  readonly writesAsked: WriteTheRuntimeWasAsked[] = [];
  readonly filesByPath = new Map<string, Buffer>([
    ["pyproject.toml", Buffer.from('[project]\nname = "studio"\n')],
    ["stream.py", Buffer.from("@stream\ndef main(stream_builder):\n    pass\n")],
    ["nodes/aurora_field.py", Buffer.from("class AuroraField: ...\n")],
    ["README.md", Buffer.from("")],
    ["views/deck/icon.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["imports/hall-of-light/tatolab-project.json", Buffer.from("{}\n")],
    ["imports/hall-of-light/pyproject.toml", Buffer.from('[project]\nname = "hall-of-light"\n')],
    ["imports/hall-of-light/stream.py", Buffer.from("# imported\n")],
  ]);

  listProjectFiles: ProjectFilesOfTheRuntime["listProjectFiles"] = async (projectDirectory, under) => {
    if (projectDirectory !== PROJECT_FOLDER) return failedWith(`list_project_files failed: ${projectDirectory} is not a project`);
    if (under !== null && ![...this.filesByPath.keys()].some((filePath) => filePath.startsWith(`${under}/`))) return failedWith(`list_project_files failed: \`${under}\` is not a folder of the project`);
    const listed = [...this.filesByPath.entries()]
      .filter(([filePath]) => under === null || filePath.startsWith(`${under}/`))
      .map(([filePath, fileBytes]) => ({ path: filePath, byte_len: fileBytes.length }));
    return succeeded(listed.sort((first, second) => first.path.localeCompare(second.path)));
  };

  readProjectFile: ProjectFilesOfTheRuntime["readProjectFile"] = async (projectDirectory, filePath) => {
    const fileBytes = projectDirectory === PROJECT_FOLDER ? this.filesByPath.get(filePath) : undefined;
    return fileBytes === undefined ? failedWith(`read_project_file failed: \`${filePath}\` is not a file of the project`) : succeeded(fileBytes);
  };

  writeProjectFile: ProjectFilesOfTheRuntime["writeProjectFile"] = async (projectDirectory, filePath, text, author, idempotencyKey) => {
    this.writesAsked.push({ project_directory: projectDirectory, path: filePath, text, author, idempotency_key: idempotencyKey });
    if (filePath.startsWith("imports/")) return failedWith(`write_project_file failed: the file \`${filePath}\` is not written with write_project_file: it is an import's`);
    this.filesByPath.set(filePath, Buffer.from(text));
    return succeeded({ path: filePath, transaction: "a1b2c3d4-0000-4000-8000-000000000001", commit: "4f102d0624025485316c83cd6d759672c34fb18a" });
  };
}

function openProjectFilesOverTheFakeRuntime() {
  const projectFilesOfTheRuntime = new FakeProjectFilesOfTheRuntime();
  let idempotencyKeysMinted = 0;
  const openProjectFiles = new OpenProjectFiles({
    readOpenProject: () => OPEN_PROJECT,
    projectFilesOfTheRuntime,
    personSavingTheFiles: SAM,
    mintAnIdempotencyKey: () => `save-${++idempotencyKeysMinted}`,
  });
  return { projectFilesOfTheRuntime, openProjectFiles };
}

test("an open project's file reads through the runtime with its text, its version, and as editable", async () => {
  const { openProjectFiles } = openProjectFilesOverTheFakeRuntime();
  const streamPy = `${PROJECT_FOLDER}/stream.py`;

  expect(await openProjectFiles.readProjectFile(streamPy)).toEqual({
    ok: true,
    value: {
      file: streamPy,
      project_folder: PROJECT_FOLDER,
      text: "@stream\ndef main(stream_builder):\n    pass\n",
      version: projectFileVersionOf("@stream\ndef main(stream_builder):\n    pass\n"),
      is_editable: true,
    },
  });
});

test("an import's file reads through the open project, read-only, with the import as its project", async () => {
  const { openProjectFiles } = openProjectFilesOverTheFakeRuntime();

  const read = await openProjectFiles.readProjectFile(`${IMPORT_FOLDER}/stream.py`);

  expect(read.ok && { text: read.value.text, project_folder: read.value.project_folder, is_editable: read.value.is_editable }).toEqual({
    text: "# imported\n",
    project_folder: IMPORT_FOLDER,
    is_editable: false,
  });
});

test("a file outside the open project, by a relative path or by `..`, is refused before the runtime is asked, and a missing one in the runtime's words", async () => {
  const { openProjectFiles } = openProjectFilesOverTheFakeRuntime();

  for (const file of ["stream.py", path.join(PROJECT_FOLDER, "..", "elsewhere", "secret.py"), PROJECT_FOLDER]) {
    const read = await openProjectFiles.readProjectFile(file);
    expect(read.ok ? "read" : read.failure).toContain("is not a file of the open project or its imports");
  }
  expect(await openProjectFiles.readProjectFile(`${PROJECT_FOLDER}/nodes/gone.py`)).toEqual({
    ok: false,
    failure: "read_project_file failed: `nodes/gone.py` is not a file of the project",
  });
});

test("a save based on the version the runtime holds is one write_project_file by the person, with a fresh key each save, answering the new version", async () => {
  const { projectFilesOfTheRuntime, openProjectFiles } = openProjectFilesOverTheFakeRuntime();
  const nodeFile = `${PROJECT_FOLDER}/nodes/aurora_field.py`;
  const read = await openProjectFiles.readProjectFile(nodeFile);
  if (!read.ok) throw new Error(read.failure);

  const firstSave = await openProjectFiles.saveProjectFile(nodeFile, "# edited\n", read.value.version);
  const secondSave = await openProjectFiles.saveProjectFile(nodeFile, "# edited again\n", projectFileVersionOf("# edited\n"));

  expect([firstSave, secondSave]).toEqual([
    { ok: true, value: { version: projectFileVersionOf("# edited\n") } },
    { ok: true, value: { version: projectFileVersionOf("# edited again\n") } },
  ]);
  expect(projectFilesOfTheRuntime.writesAsked).toEqual([
    { project_directory: PROJECT_FOLDER, path: "nodes/aurora_field.py", text: "# edited\n", author: SAM, idempotency_key: "save-1" },
    { project_directory: PROJECT_FOLDER, path: "nodes/aurora_field.py", text: "# edited again\n", author: SAM, idempotency_key: "save-2" },
  ]);
});

test("a save over a file changed since it was read, or over a file made since, asks the runtime to write nothing", async () => {
  const { projectFilesOfTheRuntime, openProjectFiles } = openProjectFilesOverTheFakeRuntime();
  const streamPy = `${PROJECT_FOLDER}/stream.py`;
  const read = await openProjectFiles.readProjectFile(streamPy);
  if (!read.ok) throw new Error(read.failure);
  projectFilesOfTheRuntime.filesByPath.set("stream.py", Buffer.from("# an agent's edit\n"));

  expect(await openProjectFiles.saveProjectFile(streamPy, "# mine\n", read.value.version)).toEqual({
    ok: false,
    failure: "stream.py changed since it was opened, so it was not saved.",
  });
  expect(await openProjectFiles.saveProjectFile(streamPy, "# mine\n", null)).toEqual({ ok: false, failure: "stream.py already exists, so it was not saved over." });
  expect(projectFilesOfTheRuntime.writesAsked).toEqual([]);
});

test("a new file saves when based on no version, and an import's file is never sent to the runtime to write", async () => {
  const { projectFilesOfTheRuntime, openProjectFiles } = openProjectFilesOverTheFakeRuntime();

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/nodes/new_node.py`, "x = 1\n", null)).toEqual({ ok: true, value: { version: projectFileVersionOf("x = 1\n") } });
  expect(await openProjectFiles.saveProjectFile(`${IMPORT_FOLDER}/stream.py`, "# no\n", projectFileVersionOf("# imported\n"))).toEqual({
    ok: false,
    failure: `${IMPORT_FOLDER}/stream.py belongs to an imported project, which the studio opens read-only.`,
  });
  expect(projectFilesOfTheRuntime.writesAsked.map((writeAsked) => writeAsked.path)).toEqual(["nodes/new_node.py"]);
});

test("a refused write is answered in the runtime's own words", async () => {
  const { projectFilesOfTheRuntime, openProjectFiles } = openProjectFilesOverTheFakeRuntime();
  projectFilesOfTheRuntime.writeProjectFile = async () => failedWith("write_project_file failed: the project's history is busy");

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/stream.py`, "# mine\n", projectFileVersionOf("@stream\ndef main(stream_builder):\n    pass\n"))).toEqual({
    ok: false,
    failure: "write_project_file failed: the project's history is busy",
  });
});

test("the open project's files list its Python files and pyproject.toml, leaving its imports out, and an import's list its own", async () => {
  const { openProjectFiles } = openProjectFilesOverTheFakeRuntime();

  expect(await openProjectFiles.listProjectFiles(PROJECT_FOLDER)).toEqual({
    ok: true,
    value: { project_folder: PROJECT_FOLDER, files: ["nodes/aurora_field.py", "pyproject.toml", "stream.py"] },
  });
  expect(await openProjectFiles.listProjectFiles(IMPORT_FOLDER)).toEqual({
    ok: true,
    value: { project_folder: IMPORT_FOLDER, files: ["pyproject.toml", "stream.py"] },
  });
  expect(await openProjectFiles.listProjectFiles("/etc")).toEqual({ ok: false, failure: "/etc is not the folder of the open project or of one of its imports." });
});

test("a new file saves into a folder the project does not hold yet, and saving what the file already holds writes nothing", async () => {
  const { projectFilesOfTheRuntime, openProjectFiles } = openProjectFilesOverTheFakeRuntime();
  const streamPy = `${PROJECT_FOLDER}/stream.py`;
  const heldText = "@stream\ndef main(stream_builder):\n    pass\n";

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/effects/glow/glow.py`, "class Glow: ...\n", null)).toEqual({ ok: true, value: { version: projectFileVersionOf("class Glow: ...\n") } });
  expect(await openProjectFiles.saveProjectFile(streamPy, heldText, projectFileVersionOf(heldText))).toEqual({ ok: true, value: { version: projectFileVersionOf(heldText) } });
  expect(projectFilesOfTheRuntime.writesAsked.map((writeAsked) => writeAsked.path)).toEqual(["effects/glow/glow.py"]);
});
