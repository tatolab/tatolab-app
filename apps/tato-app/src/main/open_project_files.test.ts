import { createHash } from "node:crypto";
import path from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, expect, test } from "vitest";
import type { OpenProjectReading, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { cleanUps, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { createANodeFileInTheOpenProject, listTheOpenProjectsFiles, projectFileVersionOf, readTheOpenProjectsFile, saveTheOpenProjectsFile } from "./open_project_files.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { IdempotencyKeys, PersonEditingInStudio } from "./studio_runtime.js";
import type { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { idempotencyKeysNumberedInOrder } from "./tatolab_commands_test_support.js";

afterEach(cleanUpWhatTheTestStarted);

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

function textParam(params: Readonly<Record<string, unknown>>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function sha256Of(fileBytes: Buffer): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

/**
 * A runtime holding the open project's files in memory by their `/`-separated path, answering `list_project_files`, `read_project_file`,
 * `write_project_file` and `create_node_file` as its file tools do, a write under `imports/` refused; with the file operations run against it
 * by Sam, each key minted `a-key-<n>` in order.
 */
async function aRuntimeHoldingTheOpenProjectsFiles() {
  const filesByPath = new Map<string, Buffer>([
    ["pyproject.toml", Buffer.from('[project]\nname = "studio"\n')],
    ["stream.py", Buffer.from("@stream\ndef main(stream_builder):\n    pass\n")],
    ["nodes/aurora_field.py", Buffer.from("class AuroraField: ...\n")],
    ["README.md", Buffer.from("")],
    ["views/deck/icon.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["imports/hall-of-light/tatolab-project.json", Buffer.from("{}\n")],
    ["imports/hall-of-light/pyproject.toml", Buffer.from('[project]\nname = "hall-of-light"\n')],
    ["imports/hall-of-light/stream.py", Buffer.from("# imported\n")],
  ]);
  const writeRefusals: { words: string | null } = { words: null };
  const server = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    const filePath = textParam(params, "path");
    if (textParam(params, "project_directory") !== PROJECT_FOLDER) return controlOperationFailedResponse(`${method} failed: not a project`);
    switch (method) {
      case "list_project_files": {
        const under = textParam(params, "under");
        if (under !== "" && ![...filesByPath.keys()].some((heldPath) => heldPath.startsWith(`${under}/`))) return controlOperationFailedResponse(`list_project_files failed: \`${under}\` is not a folder of the project`);
        const files = [...filesByPath.entries()]
          .filter(([heldPath]) => under === "" || heldPath.startsWith(`${under}/`))
          .map(([heldPath, fileBytes]) => ({ path: heldPath, byte_len: fileBytes.length }))
          .sort((first, second) => first.path.localeCompare(second.path));
        return controlOperationResultResponse({ files });
      }
      case "read_project_file": {
        const fileBytes = filesByPath.get(filePath);
        if (fileBytes === undefined) return controlOperationFailedResponse(`read_project_file failed: \`${filePath}\` is not a file of the project`);
        return controlOperationResultResponse({ path: filePath, byte_len: fileBytes.length, content_base64: fileBytes.toString("base64"), content_sha256: sha256Of(fileBytes) });
      }
      case "write_project_file": {
        if (writeRefusals.words !== null) return controlOperationFailedResponse(writeRefusals.words);
        if (filePath.startsWith("imports/")) return controlOperationFailedResponse(`write_project_file failed: the file \`${filePath}\` is not written with write_project_file: it is an import's`);
        const written = Buffer.from(textParam(params, "content"));
        filesByPath.set(filePath, written);
        return controlOperationResultResponse({ path: filePath, content_sha256: sha256Of(written), transaction: "a1b2c3d4-0000-4000-8000-000000000001", commit: "4f102d0624025485316c83cd6d759672c34fb18a" });
      }
      case "create_node_file": {
        if (filesByPath.has(filePath)) return controlOperationFailedResponse(`create_node_file failed: the project already holds \`${filePath}\`, and a new file is never written over it`);
        filesByPath.set(filePath, Buffer.from("class Invert: ...\n"));
        return controlOperationResultResponse({ path: filePath, node_type: "nodes.invert:Invert", transaction: "a1b2c3d4-0000-4000-8000-000000000002", commit: "5a213e0735136596427d94de6e86a783d45fc29b" });
      }
      default:
        return controlOperationFailedResponse(`${method} is not a file tool`);
    }
  });
  cleanUps.push(() => server.close());
  const servicesOfTheSave = Layer.mergeAll(
    runtimeControlLayer(server.localApiSocketPath, 2_000),
    Layer.succeed(PersonEditingInStudio, { author: SAM }),
    Layer.succeed(IdempotencyKeys, { mint: idempotencyKeysNumberedInOrder() }),
  );
  const run = <Answer>(operation: Effect.Effect<Answer, { readonly words: string }, RuntimeControl | PersonEditingInStudio | IdempotencyKeys>): Promise<Result<Answer, string>> =>
    Effect.runPromise(operation.pipe(Effect.match({ onSuccess: (answer) => succeeded(answer), onFailure: (failure) => failedWith(failure.words) }), Effect.provide(servicesOfTheSave)));
  const callsOf = (method: string) => controlOperationCallsReceivedBy(server).filter(([called]) => called === method).map(([, params]) => params);
  return {
    filesByPath,
    writeRefusals,
    writesAsked: () => callsOf("write_project_file"),
    pathsWritten: () => callsOf("write_project_file").map((params) => (isAJsonObject(params) ? params["path"] : null)),
    nodeFileCreationsAsked: () => callsOf("create_node_file"),
    readProjectFile: (file: string) => run(readTheOpenProjectsFile(OPEN_PROJECT, file)),
    saveProjectFile: (file: string, text: string, basedOnVersion: string | null) => run(saveTheOpenProjectsFile(OPEN_PROJECT, file, text, basedOnVersion)),
    createNodeFile: (file: string) => run(createANodeFileInTheOpenProject(OPEN_PROJECT, file)),
    listProjectFiles: (projectFolder: string) => run(listTheOpenProjectsFiles(OPEN_PROJECT, projectFolder)),
  };
}

test("an open project's file reads through the runtime with its text, its version, and as editable", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
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
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();

  const read = await openProjectFiles.readProjectFile(`${IMPORT_FOLDER}/stream.py`);

  expect(read.ok && { text: read.value.text, project_folder: read.value.project_folder, is_editable: read.value.is_editable }).toEqual({
    text: "# imported\n",
    project_folder: IMPORT_FOLDER,
    is_editable: false,
  });
});

test("a file outside the open project, by a relative path or by `..`, is refused before the runtime is asked, and a missing one in the runtime's words", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();

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
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
  const nodeFile = `${PROJECT_FOLDER}/nodes/aurora_field.py`;
  const read = await openProjectFiles.readProjectFile(nodeFile);
  if (!read.ok) throw new Error(read.failure);

  const firstSave = await openProjectFiles.saveProjectFile(nodeFile, "# edited\n", read.value.version);
  const secondSave = await openProjectFiles.saveProjectFile(nodeFile, "# edited again\n", projectFileVersionOf("# edited\n"));

  expect([firstSave, secondSave]).toEqual([
    { ok: true, value: { version: projectFileVersionOf("# edited\n") } },
    { ok: true, value: { version: projectFileVersionOf("# edited again\n") } },
  ]);
  expect(openProjectFiles.writesAsked()).toEqual([
    { project_directory: PROJECT_FOLDER, path: "nodes/aurora_field.py", content: "# edited\n", author: SAM, idempotency_key: "a-key-1" },
    { project_directory: PROJECT_FOLDER, path: "nodes/aurora_field.py", content: "# edited again\n", author: SAM, idempotency_key: "a-key-2" },
  ]);
});

test("a save over a file changed since it was read, or over a file made since, asks the runtime to write nothing", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
  const streamPy = `${PROJECT_FOLDER}/stream.py`;
  const read = await openProjectFiles.readProjectFile(streamPy);
  if (!read.ok) throw new Error(read.failure);
  openProjectFiles.filesByPath.set("stream.py", Buffer.from("# an agent's edit\n"));

  expect(await openProjectFiles.saveProjectFile(streamPy, "# mine\n", read.value.version)).toEqual({
    ok: false,
    failure: "stream.py changed since it was opened, so it was not saved.",
  });
  expect(await openProjectFiles.saveProjectFile(streamPy, "# mine\n", null)).toEqual({ ok: false, failure: "stream.py already exists, so it was not saved over." });
  expect(openProjectFiles.writesAsked()).toEqual([]);
});

test("a new file saves when based on no version, and an import's file is never sent to the runtime to write", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/nodes/new_node.py`, "x = 1\n", null)).toEqual({ ok: true, value: { version: projectFileVersionOf("x = 1\n") } });
  expect(await openProjectFiles.saveProjectFile(`${IMPORT_FOLDER}/stream.py`, "# no\n", projectFileVersionOf("# imported\n"))).toEqual({
    ok: false,
    failure: `${IMPORT_FOLDER}/stream.py belongs to an imported project, which the studio opens read-only.`,
  });
  expect(openProjectFiles.pathsWritten()).toEqual(["nodes/new_node.py"]);
});

test("a refused write is answered in the runtime's own words", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
  openProjectFiles.writeRefusals.words = "write_project_file failed: the project's history is busy";

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/stream.py`, "# mine\n", projectFileVersionOf("@stream\ndef main(stream_builder):\n    pass\n"))).toEqual({
    ok: false,
    failure: "write_project_file failed: the project's history is busy",
  });
});

test("the open project's files list every file the runtime lists, leaving its imports out, and an import's list its own", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();

  expect(await openProjectFiles.listProjectFiles(PROJECT_FOLDER)).toEqual({
    ok: true,
    value: { project_folder: PROJECT_FOLDER, files: ["nodes/aurora_field.py", "pyproject.toml", "README.md", "stream.py", "views/deck/icon.png"] },
  });
  expect(await openProjectFiles.listProjectFiles(IMPORT_FOLDER)).toEqual({
    ok: true,
    value: { project_folder: IMPORT_FOLDER, files: ["pyproject.toml", "stream.py", "tatolab-project.json"] },
  });
  expect(await openProjectFiles.listProjectFiles("/etc")).toEqual({ ok: false, failure: "/etc is not the folder of the open project or of one of its imports." });
});

test("a new file saves into a folder the project does not hold yet, and saving what the file already holds writes nothing", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
  const streamPy = `${PROJECT_FOLDER}/stream.py`;
  const heldText = "@stream\ndef main(stream_builder):\n    pass\n";

  expect(await openProjectFiles.saveProjectFile(`${PROJECT_FOLDER}/effects/glow/glow.py`, "class Glow: ...\n", null)).toEqual({ ok: true, value: { version: projectFileVersionOf("class Glow: ...\n") } });
  expect(await openProjectFiles.saveProjectFile(streamPy, heldText, projectFileVersionOf(heldText))).toEqual({ ok: true, value: { version: projectFileVersionOf(heldText) } });
  expect(openProjectFiles.pathsWritten()).toEqual(["effects/glow/glow.py"]);
});

test("a new node file is one create_node_file by the person with a fresh key, answering the file and the node type it declares", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();
  const invertPy = `${PROJECT_FOLDER}/nodes/invert.py`;

  expect(await openProjectFiles.createNodeFile(invertPy)).toEqual({ ok: true, value: { file: invertPy, node_type: "nodes.invert:Invert" } });
  expect(openProjectFiles.nodeFileCreationsAsked()).toEqual([{ project_directory: PROJECT_FOLDER, path: "nodes/invert.py", author: SAM, idempotency_key: "a-key-1" }]);
  expect(await openProjectFiles.createNodeFile(invertPy)).toEqual({
    ok: false,
    failure: "create_node_file failed: the project already holds `nodes/invert.py`, and a new file is never written over it",
  });
});

test("a new node file in an import or outside the open project is refused before the runtime is asked", async () => {
  const openProjectFiles = await aRuntimeHoldingTheOpenProjectsFiles();

  expect(await openProjectFiles.createNodeFile(`${IMPORT_FOLDER}/nodes/invert.py`)).toEqual({
    ok: false,
    failure: `${IMPORT_FOLDER}/nodes/invert.py belongs to an imported project, which the studio opens read-only.`,
  });
  const outside = await openProjectFiles.createNodeFile("/etc/invert.py");
  expect(outside.ok ? "created" : outside.failure).toContain("is not a file of the open project or its imports");
  expect(openProjectFiles.nodeFileCreationsAsked()).toEqual([]);
});
