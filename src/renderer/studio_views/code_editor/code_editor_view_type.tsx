import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActionButton } from "../../design_system/action_button";
import { AreaSplit } from "../../design_system/area_split";
import { CodeFileTabStrip, type OpenableCodeFileGroup } from "../../design_system/code_file_tab_strip";
import { CodeTextEditor, forgetCodeEditorDocument } from "../../design_system/code_text_editor";
import { codeEditorLanguageOfFile } from "../../design_system/code_text_editor_types";
import { LogRecordLines } from "../../design_system/log_record_lines";
import { ReadOnlyBanner } from "../../design_system/read_only_banner";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import type { ProjectLogReading, StopWatching, StudioViewHostConnection, StudioViewType } from "../../view_host/studio_view_contract";
import {
  codeFileTabsOf,
  codeViewSettingsFromSavedLayout,
  DEFAULT_CODE_VIEW_SETTINGS,
  logRecordLineOf,
  projectsWithFilesToOffer,
  withTheFileClosed,
  withTheFileShown,
  type CodeViewSettings,
} from "./code_editor_view_settings";
import { hasEditsNotSaved, OpenCodeDocuments, type OpenCodeDocument } from "./open_code_documents";

type CodeViewConnection = StudioViewHostConnection<CodeViewSettings>;

/** The issue that names the file a node's class is defined in, which opening a node's code waits on. */
const OPENING_A_NODES_FILE_WAITS_ON = "tatolab/streamlib#2918";

/**
 * The host hands every area the same functions, so the documents open behind them are found by one of
 * those functions: every code area of the window shares one set of open files, as split editors do.
 */
const openCodeDocumentsOfEachHost = new WeakMap<CodeViewConnection["readProjectFile"], { documents: OpenCodeDocuments; last_code_file_ask_taken: number }>();

function openCodeDocumentsOf(connection: CodeViewConnection): { documents: OpenCodeDocuments; last_code_file_ask_taken: number } {
  const known = openCodeDocumentsOfEachHost.get(connection.readProjectFile);
  if (known !== undefined) return known;
  const created = { documents: new OpenCodeDocuments(connection, forgetCodeEditorDocument), last_code_file_ask_taken: 0 };
  openCodeDocumentsOfEachHost.set(connection.readProjectFile, created);
  return created;
}

function useOpenCodeDocuments(connection: CodeViewConnection): OpenCodeDocuments {
  const { documents } = openCodeDocumentsOf(connection);
  useSyncExternalStore(documents.subscribe, documents.snapshot);
  return documents;
}

/** The files each of the open project and its imports offers to open, listed again whenever the project is read again. */
function useOpenableFileGroups(connection: CodeViewConnection): OpenableCodeFileGroup[] {
  const openProject = useStudioViewReading(connection.watchOpenProject);
  const projects = useMemo(() => projectsWithFilesToOffer(openProject), [openProject]);
  const [groups, setGroups] = useState<OpenableCodeFileGroup[]>([]);
  useEffect(() => {
    let isStale = false;
    void Promise.all(
      projects.map(async ({ project_name: projectName, project_folder: projectFolder }): Promise<OpenableCodeFileGroup> => {
        const listing = await connection.listProjectFiles(projectFolder);
        if (listing.kind === "not_listed") return { project_name: projectName, files: [], not_listed_because: listing.because };
        return { project_name: projectName, files: listing.project_files.files.map((name) => ({ file: `${projectFolder}/${name}`, name })), not_listed_because: null };
      }),
    ).then((listedGroups) => {
      if (!isStale) setGroups(listedGroups);
    });
    return () => {
      isStale = true;
    };
  }, [connection, projects]);
  return groups;
}

function CodeAreaHeaderTools({ connection }: { connection: CodeViewConnection }) {
  const documents = useOpenCodeDocuments(connection);
  const openableFileGroups = useOpenableFileGroups(connection);
  const { settings } = connection;
  const tabs = codeFileTabsOf(settings.open_files, (file) => {
    const document = documents.documentOf(file);
    return { has_edits_not_saved: hasEditsNotSaved(document), is_read_only: document?.kind === "read" && !document.is_editable };
  });
  return (
    <CodeFileTabStrip
      tabs={tabs}
      shownFile={settings.shown_file}
      openableFileGroups={openableFileGroups}
      areLogsShown={settings.logs_shown}
      onTabChosen={(file) => connection.rememberSettings({ ...settings, shown_file: file })}
      onTabClosed={(file) => {
        connection.rememberSettings(withTheFileClosed(settings, file));
        documents.close(file);
      }}
      onFileChosen={(file) => connection.rememberSettings(withTheFileShown(settings, file))}
      onLogsToggled={(areShown) => connection.rememberSettings({ ...settings, logs_shown: areShown })}
    />
  );
}

/** What stands over the editor: the import's read-only note, a save refused, or the file changed on disk under edits. */
function CodeDocumentNotice({ documents, document }: { documents: OpenCodeDocuments; document: Extract<OpenCodeDocument, { kind: "read" }> }) {
  if (!document.is_editable) {
    return <ReadOnlyBanner words={<>Read only · this file belongs to an import</>} data-code-document-notice="read_only" />;
  }
  if (document.is_changed_on_disk) {
    return (
      <ReadOnlyBanner
        words="This file changed on disk while it held edits not saved."
        action={
          <div className="flex gap-1">
            <ActionButton size="small" appearance="quiet" onPressed={() => void documents.reloadFromDisk(document.file)} data-code-document-action="reload">
              Take the file on disk
            </ActionButton>
            <ActionButton size="small" appearance="quiet" onPressed={() => void documents.saveOverTheFileOnDisk(document.file)} data-code-document-action="save_over">
              Keep mine and save
            </ActionButton>
          </div>
        }
        data-code-document-notice="changed_on_disk"
      />
    );
  }
  if (document.save.kind === "refused") {
    return (
      <ReadOnlyBanner
        words={document.save.because}
        action={
          <div className="flex gap-1">
            <ActionButton size="small" appearance="quiet" onPressed={() => void documents.reloadFromDisk(document.file)} data-code-document-action="reload">
              Reload
            </ActionButton>
            <ActionButton size="small" appearance="quiet" onPressed={() => void documents.saveOverTheFileOnDisk(document.file)} data-code-document-action="save_over">
              Save over it
            </ActionButton>
          </div>
        }
        data-code-document-notice="save_refused"
      />
    );
  }
  return null;
}

function CodeDocumentNoticeRow({ documents, document }: { documents: OpenCodeDocuments; document: Extract<OpenCodeDocument, { kind: "read" }> }) {
  if (document.is_editable && !document.is_changed_on_disk && document.save.kind !== "refused") return null;
  return (
    <div className="flex shrink-0 border-b border-studio-area-header-line px-2 py-1.5">
      <CodeDocumentNotice documents={documents} document={document} />
    </div>
  );
}

function ShownCodeDocument({ documents, file }: { documents: OpenCodeDocuments; file: string }) {
  const document = documents.documentOf(file);
  useEffect(() => {
    documents.open(file);
    const checkTheFileOnDisk = () => void documents.checkForChangesOnDisk(file);
    window.addEventListener("focus", checkTheFileOnDisk);
    return () => window.removeEventListener("focus", checkTheFileOnDisk);
  }, [documents, file]);
  const onTextEdited = useCallback((text: string) => documents.editText(file, text), [documents, file]);
  const onSaveAsked = useCallback(() => void documents.save(file), [documents, file]);
  if (document === undefined || document.kind === "reading") return <div className="flex-1" data-code-document-state="reading" />;
  if (document.kind === "not_read") return <WaitingState isFailure title={`${file.split("/").at(-1) ?? file} can't be opened`} explanation={document.because} data-code-document-state="not_read" />;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-code-document-state="read" data-code-document-file={file}>
      <CodeDocumentNoticeRow documents={documents} document={document} />
      <CodeTextEditor
        documentKey={file}
        language={codeEditorLanguageOfFile(file)}
        text={document.text}
        isReadOnly={!document.is_editable}
        diagnostics={document.diagnostics}
        languageHelp={document.language_help}
        onTextEdited={onTextEdited}
        onSaveAsked={onSaveAsked}
        data-code-text-editor={file}
      />
      {document.language_server_ended_because !== null && (
        <p className="shrink-0 border-t border-studio-area-header-line px-3 py-1 text-2xs text-warn-text" data-code-language-server="ended">
          Pyright stopped: {document.language_server_ended_because}
        </p>
      )}
    </div>
  );
}

function ProjectLog({ connection, projectFolder }: { connection: CodeViewConnection; projectFolder: string }) {
  const watchTheProjectsLog = useCallback((listener: (reading: ProjectLogReading) => void): StopWatching => connection.watchProjectLog(projectFolder, listener), [connection, projectFolder]);
  const reading = useStudioViewReading(watchTheProjectsLog);
  const lines = useMemo(() => (reading?.kind === "read" ? reading.records.map(logRecordLineOf) : []), [reading]);
  return (
    <section aria-label="Project log" className="flex h-full min-h-0 flex-col bg-studio-area" data-code-project-log={projectFolder}>
      <header className="flex h-6 shrink-0 items-center border-b border-studio-area-header-line px-3 text-2xs text-fg-3">Log</header>
      {reading?.kind === "not_read" ? (
        <p className="px-3 py-2 font-mono text-2xs text-fg-3" data-code-project-log-state="not_read">
          {reading.because}
        </p>
      ) : (
        <LogRecordLines lines={lines} whenEmpty={reading === null ? "Reading the project's log…" : "Nothing logged yet. Run the project with Live (F5)."} data-code-project-log-state="read" />
      )}
    </section>
  );
}

function CodeAreaBody({ connection }: { connection: CodeViewConnection }) {
  const documents = useOpenCodeDocuments(connection);
  const { settings } = connection;
  const codeFileAsked = useStudioViewReading(connection.watchCodeFileAsked);
  const openProject = useStudioViewReading(connection.watchOpenProject);
  useEffect(() => {
    const host = openCodeDocumentsOf(connection);
    if (codeFileAsked === null || codeFileAsked.ask <= host.last_code_file_ask_taken) return;
    host.last_code_file_ask_taken = codeFileAsked.ask;
    connection.rememberSettings(withTheFileShown(settings, codeFileAsked.file));
  }, [codeFileAsked, connection, settings]);

  const shownDocument = settings.shown_file === null ? undefined : documents.documentOf(settings.shown_file);
  const openProjectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const loggedProjectFolder = shownDocument?.kind === "read" ? shownDocument.project_folder : openProjectFolder;

  const code =
    settings.shown_file === null ? (
      <WaitingState
        title="No file open"
        explanation="Open a file of the project from + above. A node's own file opens from the graph once the runtime names it."
        waitsOn={OPENING_A_NODES_FILE_WAITS_ON}
        data-code-document-state="none_open"
      />
    ) : (
      <ShownCodeDocument documents={documents} file={settings.shown_file} />
    );
  if (!settings.logs_shown || loggedProjectFolder === null) return <div className="flex min-h-0 flex-1 flex-col">{code}</div>;
  return (
    <AreaSplit
      label="Code and the project's log"
      direction="column"
      parts={[
        { part_id: "code", size_percent: 100 - settings.logs_size_percent, content: <div className="flex h-full min-h-0 flex-col">{code}</div> },
        { part_id: "log", size_percent: settings.logs_size_percent, content: <ProjectLog connection={connection} projectFolder={loggedProjectFolder} /> },
      ]}
      onSizesChanged={(sizePercentByPartId) => {
        const logsSizePercent = sizePercentByPartId.log;
        if (logsSizePercent !== undefined) connection.rememberSettings({ ...settings, logs_size_percent: Math.round(logsSizePercent) });
      }}
    />
  );
}

/** Code: the project's files in Monaco with Pyright's diagnostics and completion, saved straight to disk, the project's log under them. */
export const CODE_EDITOR_VIEW_TYPE: StudioViewType<CodeViewSettings> = {
  view_type_id: "code",
  title: "Code",
  icon: "code",
  brought_by: { kind: "built_in" },
  default_settings: DEFAULT_CODE_VIEW_SETTINGS,
  settingsFromSavedLayout: codeViewSettingsFromSavedLayout,
  renderStudioView: (connection) => ({ header_tools: <CodeAreaHeaderTools connection={connection} />, body: <CodeAreaBody connection={connection} /> }),
};
