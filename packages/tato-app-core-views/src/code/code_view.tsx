import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { AreaSplit } from "@tatolab/tato-app-view-sdk/design_system/area_split";
import { CodeFileTabStrip, type OpenableCodeFileGroup } from "@tatolab/tato-app-view-sdk/design_system/code_file_tab_strip";
import { CodeTextEditor, forgetCodeEditorDocument } from "@tatolab/tato-app-view-sdk/design_system/code_text_editor";
import { codeEditorLanguageOfFile } from "@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_types";
import { LogRecordLines } from "@tatolab/tato-app-view-sdk/design_system/log_record_lines";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { ProjectLogReading, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import {
  codeFileTabsOf,
  codeViewSettingsOf,
  logRecordLineOf,
  projectsWithFilesToOffer,
  withTheFileClosed,
  withTheFileShown,
  type CodeViewSettings,
} from "./code_view_settings";
import { hasEditsNotSaved, OpenCodeDocuments, type CodeEditsNotSaved, type CodeEditsNotSavedStore, type OpenCodeDocument } from "./open_code_documents";

/** The issue that names the file a node's class is defined in, which opening a node's code waits on. */
const OPENING_A_NODES_FILE_WAITS_ON = "tatolab/streamlib#2918";

/** Keeps with the area the settings `change` makes of the latest ones, showing why when Studio refuses them. */
type RememberTheCodeSettings = (change: (settings: CodeViewSettings) => CodeViewSettings) => void;

const EDITS_NOT_SAVED_KEY_PREFIX = "tatolab.code.edits_not_saved:";

function isCodeEditsNotSaved(value: unknown): value is CodeEditsNotSaved {
  return typeof value === "object" && value !== null && "text" in value && typeof value.text === "string" && "based_on_version" in value && typeof value.based_on_version === "string";
}

// Session storage is shared by the frames of one window that come from the core views' origin, and outlives a frame loaded again; a
// private window or blocked site data can refuse it, and then edits are kept only while the frame stays.
const EDITS_NOT_SAVED_IN_SESSION_STORAGE: CodeEditsNotSavedStore = {
  editsOf: (file) => {
    try {
      const kept = sessionStorage.getItem(EDITS_NOT_SAVED_KEY_PREFIX + file);
      const parsed: unknown = kept === null ? null : JSON.parse(kept);
      return isCodeEditsNotSaved(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  keep: (file, edits) => {
    try {
      sessionStorage.setItem(EDITS_NOT_SAVED_KEY_PREFIX + file, JSON.stringify(edits));
    } catch {
      return;
    }
  },
  forget: (file) => {
    try {
      sessionStorage.removeItem(EDITS_NOT_SAVED_KEY_PREFIX + file);
    } catch {
      return;
    }
  },
};

function useOpenCodeDocuments(connection: TatoAppViewConnection): OpenCodeDocuments {
  const [documents] = useState(() => new OpenCodeDocuments(connection, forgetCodeEditorDocument, EDITS_NOT_SAVED_IN_SESSION_STORAGE));
  useSyncExternalStore(documents.subscribe, documents.snapshot);
  return documents;
}

/** The files each of the open project and its imports offers to open, listed again whenever the project is read again. */
function useOpenableFileGroups(connection: TatoAppViewConnection): OpenableCodeFileGroup[] {
  const openProject = useViewReading(connection.watchOpenProject);
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

function CodeAreaHeaderTools({
  connection,
  documents,
  settings,
  rememberTheSettings,
}: {
  connection: TatoAppViewConnection;
  documents: OpenCodeDocuments;
  settings: CodeViewSettings;
  rememberTheSettings: RememberTheCodeSettings;
}) {
  const openableFileGroups = useOpenableFileGroups(connection);
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
      onTabChosen={(file) => rememberTheSettings((latest) => ({ ...latest, shown_file: file }))}
      onTabClosed={(file) => {
        rememberTheSettings((latest) => withTheFileClosed(latest, file));
        documents.close(file);
      }}
      onFileChosen={(file) => rememberTheSettings((latest) => withTheFileShown(latest, file))}
      onLogsToggled={(areShown) => rememberTheSettings((latest) => ({ ...latest, logs_shown: areShown }))}
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

function ProjectLog({ connection, projectFolder }: { connection: TatoAppViewConnection; projectFolder: string }) {
  const watchTheProjectsLog = useCallback((listener: (reading: ProjectLogReading) => void): StopWatching => connection.watchProjectLog(projectFolder, listener), [connection, projectFolder]);
  const reading = useViewReading(watchTheProjectsLog);
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

function CodeAreaBody({
  connection,
  documents,
  settings,
  rememberTheSettings,
}: {
  connection: TatoAppViewConnection;
  documents: OpenCodeDocuments;
  settings: CodeViewSettings;
  rememberTheSettings: RememberTheCodeSettings;
}) {
  const openProject = useViewReading(connection.watchOpenProject);
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
        if (logsSizePercent !== undefined) rememberTheSettings((latest) => ({ ...latest, logs_size_percent: Math.round(logsSizePercent) }));
      }}
    />
  );
}

/** Shows the file each opening of the area names, once: an opening the area took before, heard again as its frame loads again, is left as the person left the tabs. */
function useTheFileTheAreaIsOpenedOn(connection: TatoAppViewConnection, rememberTheSettings: RememberTheCodeSettings): void {
  const openedOn = useViewReading(connection.watchOpenedOn);
  useEffect(() => {
    if (openedOn?.kind !== "file") return;
    const { file, opening_id: openingId } = openedOn;
    rememberTheSettings((settings) => (settings.opening_taken === openingId ? settings : { ...withTheFileShown(settings, file), opening_taken: openingId }));
  }, [openedOn, rememberTheSettings]);
}

function CodeOfTheArea({ connection, settings }: { connection: TatoAppViewConnection; settings: CodeViewSettings }) {
  const documents = useOpenCodeDocuments(connection);
  const [settingsRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  // Studio's reading of a change arrives after the change is asked for, so the next change is made of the last one asked.
  const latestSettings = useRef(settings);
  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);
  const rememberTheSettings = useCallback<RememberTheCodeSettings>(
    (change) => {
      const changed = change(latestSettings.current);
      if (changed === latestSettings.current) return;
      latestSettings.current = changed;
      showTheRefusalOf("Didn't keep the area's files:", connection.rememberSettings(changed));
    },
    [connection, showTheRefusalOf],
  );
  useTheFileTheAreaIsOpenedOn(connection, rememberTheSettings);
  return (
    <CoreViewFrame connection={connection} headerTools={<CodeAreaHeaderTools connection={connection} documents={documents} settings={settings} rememberTheSettings={rememberTheSettings} />}>
      <RefusalOfTheLatestAskBar refusal={settingsRefusal} />
      <CodeAreaBody connection={connection} documents={documents} settings={settings} rememberTheSettings={rememberTheSettings} />
    </CoreViewFrame>
  );
}

/** Code: the project's files in Monaco with Pyright's diagnostics and completion, saved straight to disk, the project's log under them; opened on a file, it shows that file. */
export function CodeView({ connection }: { connection: TatoAppViewConnection }) {
  const settings = useViewReadingSoFar(connection.watchSettings);
  if (settings.kind === "not_read_yet") return <CoreViewFrame connection={connection}>{null}</CoreViewFrame>;
  return <CodeOfTheArea connection={connection} settings={codeViewSettingsOf(settings.reading)} />;
}
