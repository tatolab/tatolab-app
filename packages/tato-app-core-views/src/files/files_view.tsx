import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TreeView } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { FilePlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { OpenProject, OpenProjectReading, ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { CODE_VIEW_TYPE_ID, extensionsTheCodeViewOpens } from "../shared/files_the_code_view_opens";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { useRowExpansionKeptInSettings } from "../shared/row_expansion_kept_in_settings";
import { projectsWithFilesOf } from "../shared/projects_with_files";
import { filesTreeOfTheProject, type ProjectFilesListedForTheTree } from "./files_tree_of_the_project";
import { NewNodeFileForm } from "./new_node_file_form";

/** The change feed of the project in `projectFolder`, read again each time the runtime applies a transaction to it. */
function useTransactionsAppliedTo(connection: TatoAppViewConnection, projectFolder: string): ProjectTransactionsReading | null {
  return useViewReading(useCallback((listener: (reading: ProjectTransactionsReading) => void): StopWatching => connection.watchProjectTransactions(projectFolder, listener), [connection, projectFolder]));
}

/** Each project's files as the runtime lists them, listed again after each transaction on the project and each time the view's frame takes the focus. */
function useProjectFilesListedForTheTree(connection: TatoAppViewConnection, openProject: OpenProject): ProjectFilesListedForTheTree[] {
  const projectFolders = useMemo(() => projectsWithFilesOf(openProject).map((projectWithFiles) => projectWithFiles.project_folder), [openProject]);
  const transactions = useTransactionsAppliedTo(connection, openProject.project.folder);
  const [listingsAskedFor, setListingsAskedFor] = useState(0);
  const [listedProjects, setListedProjects] = useState<ProjectFilesListedForTheTree[]>([]);
  useEffect(() => {
    const listAgain = () => setListingsAskedFor((count) => count + 1);
    window.addEventListener("focus", listAgain);
    return () => window.removeEventListener("focus", listAgain);
  }, []);
  useEffect(() => {
    let isStale = false;
    void Promise.all(projectFolders.map(async (projectFolder) => ({ project_folder: projectFolder, listing: await connection.listProjectFiles(projectFolder) }))).then((listed) => {
      if (!isStale) setListedProjects(listed);
    });
    return () => {
      isStale = true;
    };
  }, [connection, projectFolders, transactions, listingsAskedFor]);
  return listedProjects;
}

/** The latest file chosen that no view of the build opens, or `null`. */
type FileNotOpenedNote = { file_name: string } | null;

const WHAT_CODE_OPENS = `Code opens ${extensionsTheCodeViewOpens().join(" ")} files.`;

function FilesOfTheProject({
  connection,
  openProject,
  isTheNewNodeFileFormOpen,
  closeTheNewNodeFileForm,
}: {
  connection: TatoAppViewConnection;
  openProject: OpenProject;
  isTheNewNodeFileFormOpen: boolean;
  closeTheNewNodeFileForm: () => void;
}) {
  const listedProjects = useProjectFilesListedForTheTree(connection, openProject);
  const settings = useViewReading(connection.watchSettings);
  const [expansionChoices, toggleTheRow] = useRowExpansionKeptInSettings(connection.rememberSettings, settings);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [askRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const [fileNotOpened, setFileNotOpened] = useState<FileNotOpenedNote>(null);
  const closeTheNewNodeFileFormForTheButton = () => {
    closeTheNewNodeFileForm();
    document.querySelector<HTMLElement>("[data-files-new-node-file]")?.focus();
  };
  const openTheNewNodeFileInCode = (file: string) => {
    closeTheNewNodeFileForm();
    showTheRefusalOf("Didn't open the new file:", connection.openView(CODE_VIEW_TYPE_ID, { kind: "file", file }));
  };
  const filesTreeRows = useMemo(() => filesTreeOfTheProject(openProject, listedProjects, expansionChoices), [openProject, listedProjects, expansionChoices]);
  const meaningOfRow = (rowId: string) => filesTreeRows.find((filesTreeRow) => filesTreeRow.row.row_id === rowId);
  return (
    <>
      {isTheNewNodeFileFormOpen && <NewNodeFileForm connection={connection} projectFolder={openProject.project.folder} onCreated={openTheNewNodeFileInCode} onClosed={closeTheNewNodeFileFormForTheButton} />}
      {fileNotOpened === null ? <RefusalOfTheLatestAskBar refusal={askRefusal} /> : <RefusalLine layout="bar" tone="warning" lead={`Didn't open ${fileNotOpened.file_name}:`} words={WHAT_CODE_OPENS} />}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-files-tree="">
        <TreeView
          label="Files"
          rows={filesTreeRows.map((filesTreeRow) => filesTreeRow.row)}
          selectedRowId={selectedRowId}
          onRowSelected={(rowId) => {
            setSelectedRowId(rowId);
            setFileNotOpened(null);
          }}
          onRowActivated={(rowId) => {
            const filesTreeRow = meaningOfRow(rowId);
            if (filesTreeRow === undefined) return;
            const { meaning, row } = filesTreeRow;
            setFileNotOpened(null);
            if (meaning.kind === "folder" && row.expansion !== "leaf") toggleTheRow(rowId, row.expansion === "collapsed");
            if (meaning.kind !== "file") return;
            if (!meaning.opens_in_code) {
              setFileNotOpened({ file_name: row.label });
              return;
            }
            showTheRefusalOf("Didn't open the file:", connection.openView(CODE_VIEW_TYPE_ID, { kind: "file", file: meaning.file }));
          }}
          onExpansionToggled={toggleTheRow}
        />
      </div>
      <p className="shrink-0 px-3 pt-2 pb-3 text-2xs text-fg-3">The project folder on disk. The Outliner shows the graph instead.</p>
    </>
  );
}

function FilesBody({
  connection,
  openProject,
  isTheNewNodeFileFormOpen,
  closeTheNewNodeFileForm,
}: {
  connection: TatoAppViewConnection;
  openProject: OpenProjectReading | null;
  isTheNewNodeFileFormOpen: boolean;
  closeTheNewNodeFileForm: () => void;
}) {
  if (openProject === null) return null;
  if (openProject.kind === "none_open") return <WaitingState title="No project is open" explanation="Open or create one from the File menu." />;
  if (openProject.kind === "unreadable") return <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />;
  return <FilesOfTheProject connection={connection} openProject={openProject.open_project} isTheNewNodeFileFormOpen={isTheNewNodeFileFormOpen} closeTheNewNodeFileForm={closeTheNewNodeFileForm} />;
}

/** Files: the open project's folder and its imports' as a tree under the project's name, every file listed by the runtime; choosing a file opens it in Code, and New node file makes one from the runtime's node template. */
export function FilesView({ connection }: { connection: TatoAppViewConnection }) {
  const openProject = useViewReading(connection.watchOpenProject);
  const [projectTheNewNodeFileFormIsOpenFor, setProjectTheNewNodeFileFormIsOpenFor] = useState<string | null>(null);
  const openProjectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const isTheNewNodeFileFormOpen = openProjectFolder !== null && projectTheNewNodeFileFormIsOpenFor === openProjectFolder;
  return (
    <CoreViewFrame
      connection={connection}
      toolbarLabel="Files tools"
      toolbarTools={
          <IconButton
            icon={FilePlus}
            label={isTheNewNodeFileFormOpen ? "Close New node file" : "New node file"}
            disabledReason={openProjectFolder === null ? "Open a project to add a node file to it." : null}
            onPressed={() => setProjectTheNewNodeFileFormIsOpenFor(isTheNewNodeFileFormOpen ? null : openProjectFolder)}
            data-files-new-node-file=""
          />
      }
    >
      <FilesBody connection={connection} openProject={openProject} isTheNewNodeFileFormOpen={isTheNewNodeFileFormOpen} closeTheNewNodeFileForm={() => setProjectTheNewNodeFileFormIsOpenFor(null)} />
    </CoreViewFrame>
  );
}
