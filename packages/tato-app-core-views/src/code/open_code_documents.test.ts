import { describe, expect, it } from "vitest";
import type { JsonValue, PythonLanguageServerConnectionEvent, ProjectFileReading, ProjectFileSaving } from "@tatolab/tato-app-view-sdk";
import { hasEditsNotSaved, OpenCodeDocuments, type CodeEditsNotSaved, type CodeEditsNotSavedStore, type OpenCodeDocumentsHost } from "./open_code_documents";

const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";
const STREAM_PY = `${PROJECT_FOLDER}/stream.py`;
const PYPROJECT = `${PROJECT_FOLDER}/pyproject.toml`;
const IMPORTED_STREAM_PY = "/home/jonathanf/streams/camera/stream.py";

/** Files on a pretend disk, versioned by a counter, and the language server sessions asked for. */
function fakeHost() {
  const disk = new Map<string, { text: string; version: number }>([
    [STREAM_PY, { text: "a = 1\n", version: 1 }],
    [PYPROJECT, { text: "[project]\n", version: 2 }],
    [IMPORTED_STREAM_PY, { text: "b = 2\n", version: 3 }],
  ]);
  let versionCount = 3;
  const sessions: { project_folder: string; sent: JsonValue[]; closed: boolean; onEvent: (event: PythonLanguageServerConnectionEvent) => void }[] = [];
  const host: OpenCodeDocumentsHost = {
    readProjectFile: async (file): Promise<ProjectFileReading> => {
      const onDisk = disk.get(file);
      if (onDisk === undefined) return { kind: "not_read", because: `${file} is not a file of the open project or its imports` };
      const projectFolder = file.startsWith(`${PROJECT_FOLDER}/`) ? PROJECT_FOLDER : "/home/jonathanf/streams/camera";
      return { kind: "read", file_read: { file, project_folder: projectFolder, text: onDisk.text, version: String(onDisk.version), is_editable: projectFolder === PROJECT_FOLDER } };
    },
    saveProjectFile: async (file, text, basedOnVersion): Promise<ProjectFileSaving> => {
      const onDisk = disk.get(file);
      if (onDisk !== undefined && String(onDisk.version) !== basedOnVersion) return { kind: "not_saved", because: "stream.py changed on disk since it was opened, so it was not saved." };
      versionCount += 1;
      disk.set(file, { text, version: versionCount });
      return { kind: "saved", version: String(versionCount) };
    },
    connectToPythonLanguageServer: (projectFolder, onEvent) => {
      const sent: JsonValue[] = [];
      const session = { project_folder: projectFolder, sent, closed: false, onEvent };
      sessions.push(session);
      return { send: (message) => session.sent.push(message), close: () => (session.closed = true) };
    },
  };
  const changeOnDisk = (file: string, text: string) => {
    versionCount += 1;
    disk.set(file, { text, version: versionCount });
  };
  return { host, disk, sessions, changeOnDisk };
}

/** Edits not saved kept in memory, as a frame's session storage keeps them. */
function editsNotSavedInMemory(): CodeEditsNotSavedStore & { kept: Map<string, CodeEditsNotSaved> } {
  const kept = new Map<string, CodeEditsNotSaved>();
  return { kept, editsOf: (file) => kept.get(file) ?? null, keep: (file, edits) => kept.set(file, edits), forget: (file) => kept.delete(file) };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function readDocument(documents: OpenCodeDocuments, file: string) {
  const document = documents.documentOf(file);
  if (document?.kind !== "read") throw new Error(`${file} is not read: ${JSON.stringify(document)}`);
  return document;
}

describe("the code pane's open documents", () => {
  it("reads a file once, and starts one Pyright session for its project only for a Python file", async () => {
    const { host, sessions } = fakeHost();
    const documents = new OpenCodeDocuments(host, () => undefined, editsNotSavedInMemory());
    documents.open(STREAM_PY);
    documents.open(STREAM_PY);
    documents.open(PYPROJECT);
    expect(documents.documentOf(STREAM_PY)?.kind).toBe("reading");
    await settled();
    expect(readDocument(documents, STREAM_PY)).toMatchObject({ text: "a = 1\n", is_editable: true, version_on_disk: "1" });
    expect(readDocument(documents, PYPROJECT).language_help).toBeNull();
    expect(sessions.map((session) => session.project_folder)).toEqual([PROJECT_FOLDER]);
  });

  it("saves edits at the version read, and refuses over a file changed on disk until the person saves over it", async () => {
    const { host, disk, changeOnDisk } = fakeHost();
    const documents = new OpenCodeDocuments(host, () => undefined, editsNotSavedInMemory());
    documents.open(STREAM_PY);
    await settled();
    documents.editText(STREAM_PY, "a = 2\n");
    expect(hasEditsNotSaved(documents.documentOf(STREAM_PY))).toBe(true);
    await documents.save(STREAM_PY);
    expect(disk.get(STREAM_PY)?.text).toBe("a = 2\n");
    expect(hasEditsNotSaved(documents.documentOf(STREAM_PY))).toBe(false);

    changeOnDisk(STREAM_PY, "a = 3\n");
    documents.editText(STREAM_PY, "a = 4\n");
    await documents.save(STREAM_PY);
    expect(readDocument(documents, STREAM_PY).save).toEqual({ kind: "refused", because: "stream.py changed on disk since it was opened, so it was not saved." });
    expect(disk.get(STREAM_PY)?.text).toBe("a = 3\n");
    await documents.saveOverTheFileOnDisk(STREAM_PY);
    expect(disk.get(STREAM_PY)?.text).toBe("a = 4\n");
    expect(readDocument(documents, STREAM_PY).save).toEqual({ kind: "none" });
  });

  it("takes a change on disk while nothing is edited, and marks it under edits instead of dropping them", async () => {
    const { host, changeOnDisk } = fakeHost();
    const documents = new OpenCodeDocuments(host, () => undefined, editsNotSavedInMemory());
    documents.open(STREAM_PY);
    await settled();
    changeOnDisk(STREAM_PY, "from disk\n");
    await documents.checkForChangesOnDisk(STREAM_PY);
    expect(readDocument(documents, STREAM_PY)).toMatchObject({ text: "from disk\n", is_changed_on_disk: false });

    documents.editText(STREAM_PY, "mine\n");
    changeOnDisk(STREAM_PY, "theirs\n");
    await documents.checkForChangesOnDisk(STREAM_PY);
    expect(readDocument(documents, STREAM_PY)).toMatchObject({ text: "mine\n", is_changed_on_disk: true });
    await documents.reloadFromDisk(STREAM_PY);
    expect(readDocument(documents, STREAM_PY)).toMatchObject({ text: "theirs\n", text_on_disk: "theirs\n", is_changed_on_disk: false });
  });

  it("takes back the edits not saved of a file opened again over the same store, marked changed on disk when the file changed since", async () => {
    const { host, changeOnDisk } = fakeHost();
    const editsNotSaved = editsNotSavedInMemory();
    const documentsBefore = new OpenCodeDocuments(host, () => undefined, editsNotSaved);
    documentsBefore.open(STREAM_PY);
    documentsBefore.open(PYPROJECT);
    await settled();
    documentsBefore.editText(STREAM_PY, "a = 2\n");
    documentsBefore.editText(PYPROJECT, "[tool]\n");
    expect(editsNotSaved.kept.get(STREAM_PY)).toEqual({ text: "a = 2\n", based_on_version: "1" });
    changeOnDisk(PYPROJECT, "[project]\nname = 'x'\n");

    const documentsAfter = new OpenCodeDocuments(host, () => undefined, editsNotSaved);
    documentsAfter.open(STREAM_PY);
    documentsAfter.open(PYPROJECT);
    await settled();
    expect(readDocument(documentsAfter, STREAM_PY)).toMatchObject({ text: "a = 2\n", text_on_disk: "a = 1\n", is_changed_on_disk: false });
    expect(readDocument(documentsAfter, PYPROJECT)).toMatchObject({ text: "[tool]\n", is_changed_on_disk: true });
    await documentsAfter.save(STREAM_PY);
    expect(editsNotSaved.kept.has(STREAM_PY)).toBe(false);
    documentsAfter.close(PYPROJECT);
    expect(editsNotSaved.kept.size).toBe(0);
  });

  it("keeps an import's file read-only", async () => {
    const { host, disk } = fakeHost();
    const documents = new OpenCodeDocuments(host, () => undefined, editsNotSavedInMemory());
    documents.open(IMPORTED_STREAM_PY);
    await settled();
    documents.editText(IMPORTED_STREAM_PY, "edited\n");
    await documents.save(IMPORTED_STREAM_PY);
    expect(readDocument(documents, IMPORTED_STREAM_PY)).toMatchObject({ is_editable: false, text: "b = 2\n" });
    expect(disk.get(IMPORTED_STREAM_PY)?.text).toBe("b = 2\n");
  });

  it("shows a file that cannot be read in the host's words", async () => {
    const documents = new OpenCodeDocuments(fakeHost().host, () => undefined, editsNotSavedInMemory());
    documents.open("/etc/passwd");
    await settled();
    expect(documents.documentOf("/etc/passwd")).toEqual({ kind: "not_read", file: "/etc/passwd", because: "/etc/passwd is not a file of the open project or its imports" });
  });

  it("takes Pyright's diagnostics, says when its session ended, and closes it with the project's last file", async () => {
    const { host, sessions } = fakeHost();
    const forgotten: string[] = [];
    const documents = new OpenCodeDocuments(host, (file) => forgotten.push(file), editsNotSavedInMemory());
    documents.open(STREAM_PY);
    await settled();
    const [session] = sessions;
    if (session === undefined) throw new Error("no session started");
    session.onEvent({
      kind: "message",
      message: {
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri: `file://${STREAM_PY}`, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 2, message: "unused" }] },
      },
    });
    expect(readDocument(documents, STREAM_PY).diagnostics).toMatchObject([{ severity: "warning", message: "unused" }]);
    session.onEvent({ kind: "ended", because: "Pyright exited with code 1" });
    expect(readDocument(documents, STREAM_PY)).toMatchObject({ language_help: null, language_server_ended_because: "Pyright exited with code 1" });
    documents.close(STREAM_PY);
    expect(documents.documentOf(STREAM_PY)).toBeUndefined();
    expect(session.closed).toBe(true);
    expect(forgotten).toEqual([STREAM_PY]);
  });
});
