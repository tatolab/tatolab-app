import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { TatolabPlatform, TatolabStatus, ProjectFolderChosenFor } from "../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import { ControlTooltipProvider } from "./design_system/control_tooltip";
import { afterTheFirstContentfulPaintIsPresented } from "./first_contentful_paint_presented";
import { holdsWindowShortcutModifier } from "./presentation/platform_presentation";
import { RuntimeDescriptionReadings } from "./runtime_description_reading";
import {
  TatolabWindowEnvironmentContext,
  TatolabWindowStatusStore,
  type TatolabWindowEnvironment,
} from "./setup_and_preferences/tatolab_window_context";
import { RUN_LIVE_KEY, type StudioMenuBarCommands } from "./studio_shell/studio_menu_bar_model";
import { GetMoreWindowView, type GetMoreSources } from "./studio_shell/get_more_window_view";
import { PoppedOutViewerWindowView } from "./studio_shell/popped_out_viewer_window_view";
import { StudioWindow, type StudioWindowSources } from "./studio_shell/studio_window";
import { StudioWindowModel, streamsOfTheProjectToStop } from "./studio_shell/studio_window_model";
import { STUDIO_LAYOUTS, StudioLayoutsKeptInStorage } from "./studio_shell/studio_layouts";

import { CODE_EDITOR_VIEW_TYPE } from "./studio_views/code_editor/code_editor_view_type";
import { PROPERTIES_VIEW_TYPE } from "./studio_views/properties/properties_view_type";
import { VIEWER_VIEW_TYPE } from "./studio_views/viewer/viewer_view_type";
import { STREAM_GRAPH_VIEW_TYPE } from "./studio_views/stream_graph/stream_graph_view_type";
import { OUTLINER_VIEW_TYPE } from "./studio_views/outliner/outliner_view_type";
import { inWindowStudioViewHostServices, useWatchedStudioValue } from "./view_host/in_window_view_host";
import { StreamGraphAndCatalogReadings } from "./view_host/stream_graph_and_catalog_readings";
import { registeredStudioViewType, StudioViewTypeRegistry } from "./view_host/studio_view_type_registry";
import { ProjectLogReadings } from "./view_host/project_log_readings";
import { PythonLanguageServerConnections } from "./view_host/python_language_server_connections";
import { PortViewerConnections } from "./view_host/port_viewer_connections";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "./window_visibility";

/** The page's storage, or `null` where the page may not use it. */
function windowLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The view types every studio area can show, in the view-type menu's order. */
function studioViewTypeRegistry(): StudioViewTypeRegistry {
  return new StudioViewTypeRegistry([
    registeredStudioViewType(STREAM_GRAPH_VIEW_TYPE),
    registeredStudioViewType(OUTLINER_VIEW_TYPE),
    registeredStudioViewType(PROPERTIES_VIEW_TYPE),
    registeredStudioViewType(VIEWER_VIEW_TYPE),
    registeredStudioViewType(CODE_EDITOR_VIEW_TYPE),
  ]);
}

/** The studio, the Viewer alone in a window popped out of one, or a studio window's Get more window: the window's one screen from the first status on. */
function TatolabWindowRoot({
  studioWindowSources,
  getMoreSources,
  noticeTheFirstStatusCommitted,
}: {
  studioWindowSources: StudioWindowSources;
  getMoreSources: GetMoreSources;
  noticeTheFirstStatusCommitted: () => void;
}) {
  useEffect(noticeTheFirstStatusCommitted, [noticeTheFirstStatusCommitted]);
  const poppedOutViewer = useWatchedStudioValue(studioWindowSources.model.poppedOutViewer);
  const getMoreWorkspace = useWatchedStudioValue(studioWindowSources.model.getMoreWorkspace);
  if (getMoreWorkspace !== null) return <GetMoreWindowView workspace={getMoreWorkspace} sources={getMoreSources} platform={studioWindowSources.platform} />;
  if (poppedOutViewer !== null) {
    return (
      <PoppedOutViewerWindowView
        target={poppedOutViewer}
        viewTypeRegistry={studioWindowSources.viewTypeRegistry}
        viewHostServices={studioWindowSources.viewHostServices}
        platform={studioWindowSources.platform}
      />
    );
  }
  return <StudioWindow sources={studioWindowSources} />;
}

/**
 * Mounts the main window, built for `platform`, into `rootElement`; the answer shows each status the backend reports
 * to the React window, which renders on the first. `onTheFirstStatusDrawn`
 * runs once, after the frame holding the first status has been presented.
 */
export function mountTatolabWindow(
  rootElement: HTMLElement,
  backend: TatolabBackend,
  platform: TatolabPlatform,
  onTheFirstStatusDrawn?: () => void,
): (status: TatolabStatus) => void {
  document.documentElement.dataset.platform = platform;
  const runtimeDescriptionReadings = new RuntimeDescriptionReadings(backend);
  runtimeDescriptionReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => runtimeDescriptionReadings.setPollingAllowed(isVisible));
  const streamGraphAndCatalogReadings = new StreamGraphAndCatalogReadings(backend);
  streamGraphAndCatalogReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => streamGraphAndCatalogReadings.setPollingAllowed(isVisible));
  const projectLogReadings = new ProjectLogReadings(backend);
  projectLogReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => projectLogReadings.setPollingAllowed(isVisible));
  const pythonLanguageServerConnections = new PythonLanguageServerConnections(backend);
  const portViewerConnections = new PortViewerConnections(backend);
  const studioWindowModel = new StudioWindowModel(new StudioLayoutsKeptInStorage(windowLocalStorage()));

  const chooseProjectFolder = (chosenFor: ProjectFolderChosenFor) => {
    studioWindowModel.projectOpeningRefusal.publish(null);
    backend.chooseProjectFolder(chosenFor).catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
  };
  const studioMenuBarCommands: StudioMenuBarCommands = {
    showProjects: () => {
      backend.showTheProjectsWindow().catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
    },
    openAProject: () => chooseProjectFolder("project_to_open"),
    createAProject: () => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.readNewProjectDefaults().then(
        (newProjectDefaults) => studioWindowModel.newProjectSheetOpenedWith.publish(newProjectDefaults),
        (rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)),
      );
    },
    openPreferences: () => studioWindowModel.preferencesSection.publish("general"),
    openAbout: () => studioWindowModel.preferencesSection.publish("about"),
    checkForAppUpdates: () => {
      studioWindowModel.appUpdateChoiceRefusal.publish(null);
      studioWindowModel.preferencesSection.publish("about");
      backend.checkForTatolabAppUpdates().catch((rejection: unknown) => studioWindowModel.appUpdateChoiceRefusal.publish(describeBackendRejection(rejection)));
    },
    takeTheNewerAppVersion: () => {
      studioWindowModel.appUpdateChoiceRefusal.publish(null);
      studioWindowModel.preferencesSection.publish("about");
      backend.takeTheNewerTatolabAppVersion().catch((rejection: unknown) => studioWindowModel.appUpdateChoiceRefusal.publish(describeBackendRejection(rejection)));
    },
    chooseLayout: (layoutName) => studioWindowModel.chooseLayout(layoutName),
    runTheProjectLive: () => {
      studioWindowModel.projectRunRefusal.publish(null);
      backend.runOpenProject().catch((rejection: unknown) => studioWindowModel.projectRunRefusal.publish({ asked_to: "run", because: describeBackendRejection(rejection) }));
    },
    stopTheProject: () => {
      studioWindowModel.projectRunRefusal.publish(null);
      const openProject = studioWindowModel.openProject.readLatest();
      if (openProject.kind !== "read") return;
      const { folder, name } = openProject.open_project.project;
      const streamsToStop = streamsOfTheProjectToStop(studioWindowModel.listedStreams.readLatest(), folder);
      if (streamsToStop.length === 0) {
        studioWindowModel.projectRunRefusal.publish({ asked_to: "stop", because: `No stream of ${name} is running.` });
        return;
      }
      Promise.all(streamsToStop.map((stream) => backend.runStreamAction("stop_stream", stream))).catch((rejection: unknown) =>
        studioWindowModel.projectRunRefusal.publish({ asked_to: "stop", because: describeBackendRejection(rejection) }),
      );
    },
    openGetMore: () => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.openGetMoreWindow().catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
    },
    openTheProjectStreamPy: () => {
      const openProject = studioWindowModel.openProject.readLatest();
      if (openProject.kind === "read") studioWindowModel.openCodeFile(`${openProject.open_project.project.folder}/stream.py`);
    },
  };
  const studioWindowSources: StudioWindowSources = {
    model: studioWindowModel,
    viewTypeRegistry: studioViewTypeRegistry(),
    viewHostServices: inWindowStudioViewHostServices(studioWindowModel.viewHostSources(), streamGraphAndCatalogReadings, {
      backend,
      projectLogReadings,
      pythonLanguageServerConnections,
      portViewerConnections,
    }),
    commands: studioMenuBarCommands,
    projects: {
      readRecentProjects: () => backend.readRecentProjects(),
      openARecentProject: (folder) => {
        studioWindowModel.projectOpeningRefusal.publish(null);
        backend.openRecentProject(folder).catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
      },
    },
    newProject: {
      chooseNewProjectLocation: (startingAt) => backend.chooseNewProjectLocation(startingAt),
      createNewProject: async (name, location) => {
        const created = await backend.createNewProject(name, location);
        if (created.project_creation !== null) studioWindowModel.openTheNewProjectsStream(created.folder, created.project_creation.stream);
        return created;
      },
    },
    platform,
  };
  backend.onOpenProjectChanged((reading) => {
    if (studioWindowModel.getMoreWorkspace.readLatest() !== null) studioWindowModel.getMoreWorkspace.publish(reading);
    else studioWindowModel.showOpenProject(reading);
  });
  const getMoreSources: GetMoreSources = {
    readPackageCatalog: () => backend.readPackageCatalog(),
    previewImport: (requirement) => backend.previewImport(requirement),
    importIntoWorkspace: (requirement, basedOnVersion) => backend.importIntoWorkspace(requirement, basedOnVersion),
    openImportToEdit: (name) => backend.openImportToEdit(name),
    describeRejection: describeBackendRejection,
  };
  const readTheOpenProject = () =>
    void backend.readOpenProject().then(
      (reading) => studioWindowModel.showOpenProject(reading),
      (rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)),
    );
  const whatTheWindowShowsIsRead = Promise.all([backend.readPoppedOutViewer().catch(() => null), backend.readGetMoreWorkspace().catch(() => null)]).then(([poppedOutViewer, getMoreWorkspace]) => {
    if (poppedOutViewer !== null) studioWindowModel.showAsPoppedOutViewer(poppedOutViewer);
    else if (getMoreWorkspace !== null) studioWindowModel.getMoreWorkspace.publish(getMoreWorkspace);
    else readTheOpenProject();
  });
  backend.onStreamPageRequested((streamId) => studioWindowModel.openStreamTabOfAListedStream(streamId));

  let statusStore: TatolabWindowStatusStore | null = null;

  /** Runs the studio's shortcut for `key`, held with ⌘ on macOS and Ctrl on Linux; false when `key` has none. */
  function runStudioShortcut(key: string): boolean {
    const layoutOfTheDigit = STUDIO_LAYOUTS.find((layout) => layout.shortcut_digit === key);
    if (layoutOfTheDigit !== undefined) {
      if (studioWindowModel.studioLayouts.readLatest() === null) return false;
      studioWindowModel.chooseLayout(layoutOfTheDigit.name);
      return true;
    }
    switch (key) {
      case "o":
        studioMenuBarCommands.openAProject();
        return true;
      case ",":
        studioMenuBarCommands.openPreferences();
        return true;
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    if (statusStore === null || studioWindowModel.poppedOutViewer.readLatest() !== null || studioWindowModel.getMoreWorkspace.readLatest() !== null) return;
    if (keyboardEvent.key === RUN_LIVE_KEY && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey) {
      if (studioWindowModel.studioLayouts.readLatest() === null) return;
      keyboardEvent.preventDefault();
      if (keyboardEvent.shiftKey) studioMenuBarCommands.stopTheProject();
      else studioMenuBarCommands.runTheProjectLive();
      return;
    }
    if (!holdsWindowShortcutModifier(platform, keyboardEvent)) return;
    const key = keyboardEvent.key.length === 1 ? keyboardEvent.key.toLowerCase() : keyboardEvent.key;
    if (runStudioShortcut(key)) keyboardEvent.preventDefault();
  });

  let runtimeStateLastShown: TatolabStatus["runtime_state"] | null = null;
  const showStatusOutsideReact = (status: TatolabStatus) => {
    studioWindowModel.showStatus(status);
    if (runtimeStateLastShown !== null && status.runtime_state !== runtimeStateLastShown) runtimeDescriptionReadings.forgetAndReadAgainAsTheRuntimesStateChanged();
    runtimeStateLastShown = status.runtime_state;
  };
  let firstStatusCommitNoticed = false;
  const noticeTheFirstStatusCommitted = () => {
    if (firstStatusCommitNoticed || onTheFirstStatusDrawn === undefined) return;
    firstStatusCommitNoticed = true;
    afterTheFirstContentfulPaintIsPresented(onTheFirstStatusDrawn);
  };
  const renderTheWindowOn = (firstStatusStore: TatolabWindowStatusStore) => {
    const environment: TatolabWindowEnvironment = {
      backend,
      platform,
      statusStore: firstStatusStore,
      runtimeDescriptionReadings,
    };
    createRoot(rootElement).render(
      <StrictMode>
        <TatolabWindowEnvironmentContext value={environment}>
          <ControlTooltipProvider>
            <TatolabWindowRoot studioWindowSources={studioWindowSources} getMoreSources={getMoreSources} noticeTheFirstStatusCommitted={noticeTheFirstStatusCommitted} />
          </ControlTooltipProvider>
        </TatolabWindowEnvironmentContext>
      </StrictMode>,
    );
  };

  return (status) => {
    showStatusOutsideReact(status);
    if (statusStore === null) {
      const firstStatusStore = new TatolabWindowStatusStore(status);
      statusStore = firstStatusStore;
      void whatTheWindowShowsIsRead.then(() => renderTheWindowOn(firstStatusStore));
    } else {
      statusStore.publishStatus(status);
    }
  };
}
