// The files the code pane has open, shared by every code area of the window: each one's text as
// read from disk and as edited, the version a save is checked against, what Pyright says of it, and
// how its last save went. One Pyright session serves each project with a Python file open, and ends
// when the project's last one closes.

import type { CodeEditorDiagnostic, CodeEditorLanguageHelp } from "../../design_system/code_text_editor_types";
import type { StudioViewHostConnection, JsonValue, PythonLanguageServerConnection } from "../../view_host/studio_view_contract";
import { PythonLanguageClient } from "./python_language_client";

/** What the open documents ask of the host. */
export type OpenCodeDocumentsHost = Pick<StudioViewHostConnection<JsonValue>, "readProjectFile" | "saveProjectFile" | "connectToPythonLanguageServer">;

/** How a document's last save went, or one under way. */
export type OpenCodeDocumentSave = { kind: "none" } | { kind: "saving" } | { kind: "refused"; because: string };

/** One open file as the code pane shows it. */
export type OpenCodeDocument =
  | { kind: "reading"; file: string }
  | { kind: "not_read"; file: string; because: string }
  | {
      kind: "read";
      file: string;
      project_folder: string;
      is_editable: boolean;
      /** The text as the user has it, edits included. */
      text: string;
      /** The text as last read from or written to disk. */
      text_on_disk: string;
      version_on_disk: string;
      /** Whether the file on disk changed while it held edits not saved, so neither is taken over the other unasked. */
      is_changed_on_disk: boolean;
      diagnostics: readonly CodeEditorDiagnostic[];
      save: OpenCodeDocumentSave;
      language_help: CodeEditorLanguageHelp | null;
      /** Why the project's Pyright session ended, or `null` while it serves or the file is not Python. */
      language_server_ended_because: string | null;
    };

/** Whether `document` holds edits not yet saved. */
export function hasEditsNotSaved(document: OpenCodeDocument | undefined): boolean {
  return document?.kind === "read" && document.text !== document.text_on_disk;
}

function isAPythonFile(file: string): boolean {
  return file.endsWith(".py") || file.endsWith(".pyi");
}

/** One project's Pyright session and the documents it serves. */
interface ProjectLanguageSession {
  client: PythonLanguageClient;
  connection: PythonLanguageServerConnection;
  files: Set<string>;
  ended_because: string | null;
}

/** Every file the code pane has open, read and saved through `host`. */
export class OpenCodeDocuments {
  private readonly documentsByFile = new Map<string, OpenCodeDocument>();
  private readonly languageSessionsByProjectFolder = new Map<string, ProjectLanguageSession>();
  private readonly listeners = new Set<() => void>();
  private snapshotCount = 0;

  constructor(
    private readonly host: OpenCodeDocumentsHost,
    private readonly forgetTheEditorsCopy: (file: string) => void,
  ) {}

  /** Calls `listener` after every change to any document; the returned function stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A number that changes with every change, for `useSyncExternalStore`. */
  readonly snapshot = (): number => this.snapshotCount;

  documentOf(file: string): OpenCodeDocument | undefined {
    return this.documentsByFile.get(file);
  }

  /** Read `file` from disk the first time it is asked for. */
  open(file: string): void {
    if (this.documentsByFile.has(file)) return;
    this.documentsByFile.set(file, { kind: "reading", file });
    this.publish();
    void this.readFromDisk(file, "first_read");
  }

  /** Take `text` as the user's edit of `file`. */
  editText(file: string, text: string): void {
    const document = this.documentsByFile.get(file);
    if (document?.kind !== "read" || !document.is_editable || document.text === text) return;
    this.documentsByFile.set(file, { ...document, text });
    this.languageSessionsByProjectFolder.get(document.project_folder)?.client.changeDocument(file, text);
    this.publish();
  }

  /** Write `file`'s edits to disk, unless it changed there since it was read. */
  async save(file: string): Promise<void> {
    const document = this.documentsByFile.get(file);
    if (document?.kind !== "read" || !document.is_editable || document.save.kind === "saving") return;
    if (document.text === document.text_on_disk && document.save.kind === "none") return;
    await this.writeToDisk(document, document.version_on_disk);
  }

  /** Write `file`'s edits over whatever is on disk now, as the person chose after a refused save. */
  async saveOverTheFileOnDisk(file: string): Promise<void> {
    const document = this.documentsByFile.get(file);
    if (document?.kind !== "read" || !document.is_editable) return;
    const reading = await this.host.readProjectFile(file);
    if (reading.kind === "not_read") {
      this.replaceTheReadDocument(file, (latest) => ({ ...latest, save: { kind: "refused", because: reading.because } }));
      return;
    }
    const latest = this.documentsByFile.get(file);
    if (latest?.kind === "read") await this.writeToDisk(latest, reading.file_read.version);
  }

  /** Take `file`'s text from disk again, dropping any edits. */
  async reloadFromDisk(file: string): Promise<void> {
    await this.readFromDisk(file, "reload");
  }

  /** Read `file` again and take what changed on disk, unless edits are held, which are marked as changed under them. */
  async checkForChangesOnDisk(file: string): Promise<void> {
    const document = this.documentsByFile.get(file);
    if (document?.kind === "not_read") {
      await this.readFromDisk(file, "reload");
      return;
    }
    if (document?.kind !== "read" || document.save.kind === "saving") return;
    await this.readFromDisk(file, "check");
  }

  /** Close `file`: its text, its Pyright document, and the project's session once it serves no other. */
  close(file: string): void {
    const document = this.documentsByFile.get(file);
    if (document === undefined) return;
    this.documentsByFile.delete(file);
    this.forgetTheEditorsCopy(file);
    if (document.kind === "read") {
      const session = this.languageSessionsByProjectFolder.get(document.project_folder);
      if (session !== undefined && session.files.delete(file)) {
        session.client.closeDocument(file);
        if (session.files.size === 0) {
          session.client.end();
          session.connection.close();
          this.languageSessionsByProjectFolder.delete(document.project_folder);
        }
      }
    }
    this.publish();
  }

  private async readFromDisk(file: string, why: "first_read" | "reload" | "check"): Promise<void> {
    const reading = await this.host.readProjectFile(file);
    const before = this.documentsByFile.get(file);
    if (before === undefined) return;
    if (reading.kind === "not_read") {
      if (before.kind === "read" && why === "check") return;
      this.documentsByFile.set(file, { kind: "not_read", file, because: reading.because });
      this.publish();
      return;
    }
    const { file_read: fileRead } = reading;
    if (before.kind === "read") {
      if (why === "check") {
        if (fileRead.version === before.version_on_disk) return;
        const hasEdits = before.text !== before.text_on_disk;
        this.documentsByFile.set(
          file,
          hasEdits ? { ...before, is_changed_on_disk: true } : { ...before, text: fileRead.text, text_on_disk: fileRead.text, version_on_disk: fileRead.version, is_changed_on_disk: false },
        );
      } else {
        this.documentsByFile.set(file, { ...before, text: fileRead.text, text_on_disk: fileRead.text, version_on_disk: fileRead.version, is_changed_on_disk: false, save: { kind: "none" } });
      }
      const latest = this.documentsByFile.get(file);
      if (latest?.kind === "read") this.languageSessionsByProjectFolder.get(latest.project_folder)?.client.changeDocument(file, latest.text);
      this.publish();
      return;
    }
    const session = isAPythonFile(file) ? this.languageSessionOf(fileRead.project_folder) : null;
    this.documentsByFile.set(file, {
      kind: "read",
      file,
      project_folder: fileRead.project_folder,
      is_editable: fileRead.is_editable,
      text: fileRead.text,
      text_on_disk: fileRead.text,
      version_on_disk: fileRead.version,
      is_changed_on_disk: false,
      diagnostics: [],
      save: { kind: "none" },
      language_help:
        session === null
          ? null
          : {
              completionsAt: (line, character) => session.client.completionsAt(file, line, character),
              hoverAt: (line, character) => session.client.hoverAt(file, line, character),
            },
      language_server_ended_because: session?.ended_because ?? null,
    });
    if (session !== null) {
      session.files.add(file);
      session.client.openDocument(file, fileRead.text);
    }
    this.publish();
  }

  private async writeToDisk(document: Extract<OpenCodeDocument, { kind: "read" }>, basedOnVersion: string): Promise<void> {
    const { file, text } = document;
    this.replaceTheReadDocument(file, (latest) => ({ ...latest, save: { kind: "saving" } }));
    const saving = await this.host.saveProjectFile(file, text, basedOnVersion);
    if (saving.kind === "not_saved") {
      this.replaceTheReadDocument(file, (latest) => ({ ...latest, save: { kind: "refused", because: saving.because } }));
      return;
    }
    this.replaceTheReadDocument(file, (latest) => ({ ...latest, text_on_disk: text, version_on_disk: saving.version, is_changed_on_disk: false, save: { kind: "none" } }));
    this.languageSessionsByProjectFolder.get(document.project_folder)?.client.noteDocumentSaved(file);
  }

  private replaceTheReadDocument(file: string, replace: (latest: Extract<OpenCodeDocument, { kind: "read" }>) => OpenCodeDocument): void {
    const latest = this.documentsByFile.get(file);
    if (latest?.kind !== "read") return;
    this.documentsByFile.set(file, replace(latest));
    this.publish();
  }

  private languageSessionOf(projectFolder: string): ProjectLanguageSession {
    const known = this.languageSessionsByProjectFolder.get(projectFolder);
    if (known !== undefined) return known;
    const files = new Set<string>();
    let client: PythonLanguageClient | null = null;
    const connection = this.host.connectToPythonLanguageServer(projectFolder, (event) => {
      if (event.kind === "message") {
        client?.receive(event.message);
        return;
      }
      client?.end();
      session.ended_because = event.because;
      for (const file of session.files) {
        this.replaceTheReadDocument(file, (latest) => ({ ...latest, language_help: null, language_server_ended_because: event.because }));
      }
    });
    client = new PythonLanguageClient((message) => connection.send(message), projectFolder, {
      onDiagnosticsPublished: (file, diagnostics) => this.replaceTheReadDocument(file, (latest) => ({ ...latest, diagnostics })),
    });
    const session: ProjectLanguageSession = { client, connection, files, ended_because: null };
    this.languageSessionsByProjectFolder.set(projectFolder, session);
    client.start();
    return session;
  }

  private publish(): void {
    this.snapshotCount += 1;
    for (const listener of [...this.listeners]) listener();
  }
}
