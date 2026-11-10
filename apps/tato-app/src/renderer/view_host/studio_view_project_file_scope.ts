// A project's view reaches Studio only through its bridge, so the bridge is where everything it asks
// of a project is held to the project that brings it: the open project for its own view, the
// import's folder for an import's, never the folder of the project that imported it.

import type { StudioViewHostServices } from "./studio_view_contract";

/** Whether `file` names `folder` or a path under it, with no `.` or `..` step that could climb out. */
function isAtOrUnderTheFolder(file: string, folder: string): boolean {
  if (file.split("/").some((pathSegment) => pathSegment === "." || pathSegment === "..")) return false;
  return file === folder || file.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
}

/** `hostServices` with every ask and watch that names a project folder or file held to `viewsProjectFolder`, the folder of the project bringing the view `viewTitle`, and refused outside it. */
export function hostServicesHeldToTheViewsProject(hostServices: StudioViewHostServices, viewTitle: string, viewsProjectFolder: string): StudioViewHostServices {
  const refusalOutside = (fileOrFolder: string) => `${viewTitle} reaches only its own project, in ${viewsProjectFolder}; ${fileOrFolder} is outside it.`;
  const isTheViewsOwn = (fileOrFolder: string) => isAtOrUnderTheFolder(fileOrFolder, viewsProjectFolder);
  return {
    ...hostServices,
    readProjectFile: async (file) => (isTheViewsOwn(file) ? hostServices.readProjectFile(file) : { kind: "not_read", because: refusalOutside(file) }),
    saveProjectFile: async (file, text, basedOnVersion) => (isTheViewsOwn(file) ? hostServices.saveProjectFile(file, text, basedOnVersion) : { kind: "not_saved", because: refusalOutside(file) }),
    listProjectFiles: async (projectFolder) => (isTheViewsOwn(projectFolder) ? hostServices.listProjectFiles(projectFolder) : { kind: "not_listed", because: refusalOutside(projectFolder) }),
    watchProjectLog: (projectFolder, listener) => {
      if (isTheViewsOwn(projectFolder)) return hostServices.watchProjectLog(projectFolder, listener);
      listener({ kind: "not_read", because: refusalOutside(projectFolder) });
      return () => undefined;
    },
    watchProjectNodeTypes: (projectFolder, listener) => {
      if (isTheViewsOwn(projectFolder)) return hostServices.watchProjectNodeTypes(projectFolder, listener);
      listener({ kind: "not_listed", because: refusalOutside(projectFolder) });
      return () => undefined;
    },
    watchProjectTransactions: (projectFolder, listener) => {
      if (isTheViewsOwn(projectFolder)) return hostServices.watchProjectTransactions(projectFolder, listener);
      listener({ kind: "not_read", because: refusalOutside(projectFolder) });
      return () => undefined;
    },
    undoInTheProject: async (projectFolder, author) => (isTheViewsOwn(projectFolder) ? hostServices.undoInTheProject(projectFolder, author) : { kind: "not_applied", because: refusalOutside(projectFolder) }),
    redoInTheProject: async (projectFolder, author) => (isTheViewsOwn(projectFolder) ? hostServices.redoInTheProject(projectFolder, author) : { kind: "not_applied", because: refusalOutside(projectFolder) }),
    transactInTheProject: async (projectFolder, operations, mode, idempotencyKey) =>
      isTheViewsOwn(projectFolder) ? hostServices.transactInTheProject(projectFolder, operations, mode, idempotencyKey) : { kind: "not_sent", because: refusalOutside(projectFolder) },
    connectToPythonLanguageServer: (projectFolder, onEvent) => {
      if (isTheViewsOwn(projectFolder)) return hostServices.connectToPythonLanguageServer(projectFolder, onEvent);
      onEvent({ kind: "ended", because: refusalOutside(projectFolder) });
      return { send: () => undefined, close: () => undefined };
    },
  };
}
