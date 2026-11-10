import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { TatolabPlatform, TatolabStatus, ProjectFolderChosenFor } from "../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import { ControlTooltipProvider } from "@tatolab/tato-app-view-sdk/design_system/control_tooltip";
import { afterTheFirstContentfulPaintIsPresented } from "./first_contentful_paint_presented";
import { holdsWindowShortcutModifier } from "./presentation/platform_presentation";
import { RuntimeDescriptionReadings } from "./runtime_description_reading";
import {
  TatolabWindowEnvironmentContext,
  TatolabWindowStatusStore,
  type TatolabWindowEnvironment,
} from "./setup_and_preferences/tatolab_window_context";
import { RUN_LIVE_KEY, studioMenusSentToTheSystemMenuBar, type StudioMenuBarCommands } from "./studio_shell/studio_menu_bar_model";
import { ModuleManagerWindowView, type ModuleManagerSources } from "./studio_shell/module_manager_window_view";
import { PoppedOutViewerWindowView } from "./studio_shell/popped_out_viewer_window_view";
import { StudioWindow, type StudioWindowSources } from "./studio_shell/studio_window";
import { StudioWindowModel } from "./studio_shell/studio_window_model";
import { STUDIO_LAYOUTS, StudioLayoutsKeptInStorage } from "./studio_shell/studio_layouts";

import { CODE_EDITOR_VIEW_TYPE } from "./studio_views/code_editor/code_editor_view_type";
import { VIEWER_VIEW_TYPE } from "./studio_views/viewer/viewer_view_type";
import { STREAM_GRAPH_VIEW_TYPE } from "./studio_views/stream_graph/stream_graph_view_type";
import { inWindowStudioViewHostServices, useWatchedStudioValue } from "./view_host/in_window_view_host";
import { StreamGraphAndCatalogReadings } from "./view_host/stream_graph_and_catalog_readings";
import { registeredStudioViewType, StudioViewTypeRegistry } from "./view_host/studio_view_type_registry";
import { tatolabFrameViewType } from "./view_host/tatolab_frame_view_type";
import { coreViewTypesOf, servedCoreViewFolderUrl } from "./view_host/core_view_types";
import { CORE_VIEWS } from "@tatolab/tato-app-core-views";
import { ProjectLogReadings } from "./view_host/project_log_readings";
import { ProjectTransactionsReadings } from "./view_host/project_transactions_readings";
import { ProjectNodeTypeReadings } from "./view_host/project_node_type_readings";
import { PythonLanguageServerConnections } from "./view_host/python_language_server_connections";
import { PortViewerConnections } from "./view_host/port_viewer_connections";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "./window_visibility";
import { ProjectsHomeChoicesKeptInStorage } from "./studio_shell/projects_home_choices_kept_in_storage";
import { tatolabWindowLocalStorage } from "./tatolab_window_local_storage";

/** The view types every studio area can show, in the view-type menu's order. */
function studioViewTypeRegistry(): StudioViewTypeRegistry {
  const coreViewTypes = coreViewTypesOf(CORE_VIEWS, (folder) => servedCoreViewFolderUrl(folder, document.baseURI));
  const coreViewTypeIn = (folder: string) => {
    const coreViewType = coreViewTypes.view_types_by_folder.get(folder);
    return coreViewType === undefined ? [] : [coreViewType];
  };
  return new StudioViewTypeRegistry(
    [
      registeredStudioViewType(STREAM_GRAPH_VIEW_TYPE),
      ...coreViewTypeIn("outliner"),
      ...coreViewTypeIn("palette"),
      ...coreViewTypeIn("properties"),
      ...coreViewTypeIn("history"),
      registeredStudioViewType(VIEWER_VIEW_TYPE),
      registeredStudioViewType(CODE_EDITOR_VIEW_TYPE),
    ],
    (listed, manifest, projectName) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: projectName }),
    coreViewTypes.not_opened,
  );
}

/** Keeps `viewTypeRegistry` listing the views of the project `studioWindowModel` has open, listed again each time another is read. */
function listTheOpenProjectsStudioViews(backend: TatolabBackend, studioWindowModel: StudioWindowModel, viewTypeRegistry: StudioViewTypeRegistry): void {
  let listingsAsked = 0;
  studioWindowModel.openProject.watch((openProjectReading) => {
    listingsAsked += 1;
    const thisListing = listingsAsked;
    if (openProjectReading.kind !== "read") {
      viewTypeRegistry.projectStudioViews.publish({ kind: "none_open" });
      return;
    }
    const projectName = openProjectReading.open_project.project.name;
    backend.listStudioViewsOfTheOpenProject().then(
      (studioViews) => {
        if (thisListing === listingsAsked) viewTypeRegistry.projectStudioViews.publish({ kind: "listed", project_name: projectName, studio_views: studioViews });
      },
      (rejection: unknown) => {
        if (thisListing === listingsAsked) viewTypeRegistry.projectStudioViews.publish({ kind: "not_listed", because: describeBackendRejection(rejection) });
      },
    );
  });
}

/** The studio, the Viewer alone in a window popped out of one, or a studio window's Module manager window: the window's one screen from the first status on. */
function TatolabWindowRoot({
  studioWindowSources,
  moduleManagerSources,
  noticeTheFirstStatusCommitted,
}: {
  studioWindowSources: StudioWindowSources;
  moduleManagerSources: ModuleManagerSources;
  noticeTheFirstStatusCommitted: () => void;
}) {
  useEffect(noticeTheFirstStatusCommitted, [noticeTheFirstStatusCommitted]);
  const poppedOutViewer = useWatchedStudioValue(studioWindowSources.model.poppedOutViewer);
  const moduleManagerWorkspace = useWatchedStudioValue(studioWindowSources.model.moduleManagerWorkspace);
  if (moduleManagerWorkspace !== null) return <ModuleManagerWindowView workspace={moduleManagerWorkspace} sources={moduleManagerSources} platform={studioWindowSources.platform} />;
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
  const projectNodeTypeReadings = new ProjectNodeTypeReadings(backend);
  projectNodeTypeReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => projectNodeTypeReadings.setPollingAllowed(isVisible));
  const projectTransactionsReadings = new ProjectTransactionsReadings(backend);
  const pythonLanguageServerConnections = new PythonLanguageServerConnections(backend);
  const portViewerConnections = new PortViewerConnections(backend);
  const studioWindowModel = new StudioWindowModel(new StudioLayoutsKeptInStorage(tatolabWindowLocalStorage()));

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
      backend.stopOpenProject().catch((rejection: unknown) => studioWindowModel.projectRunRefusal.publish({ asked_to: "stop", because: describeBackendRejection(rejection) }));
    },
    openModuleManager: () => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.openModuleManagerWindow().catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
    },
  };
  let onChosenByEntryIdOfTheMenusSent: ReadonlyMap<string, () => void> = new Map();
  backend.onSystemMenuBarEntryChosen((entryId) => onChosenByEntryIdOfTheMenusSent.get(entryId)?.());
  const viewTypeRegistry = studioViewTypeRegistry();
  listTheOpenProjectsStudioViews(backend, studioWindowModel, viewTypeRegistry);
  const studioWindowSources: StudioWindowSources = {
    model: studioWindowModel,
    viewTypeRegistry,
    viewHostServices: inWindowStudioViewHostServices(studioWindowModel.viewHostSources(), streamGraphAndCatalogReadings, {
      backend,
      projectLogReadings,
      projectNodeTypeReadings,
      projectTransactionsReadings,
      pythonLanguageServerConnections,
      portViewerConnections,
    }),
    commands: studioMenuBarCommands,
    systemMenuBar: {
      showTheMenus: (menus) => {
        const menusSent = studioMenusSentToTheSystemMenuBar(menus);
        onChosenByEntryIdOfTheMenusSent = menusSent.onChosenByEntryId;
        // The app refuses only menus out of the contract's shape, which this window never builds.
        backend.showTheMenusInTheSystemMenuBar(menusSent.menus).catch(() => {});
      },
    },
    projects: {
      projectsHomeChoices: new ProjectsHomeChoicesKeptInStorage(tatolabWindowLocalStorage()),
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
    if (studioWindowModel.moduleManagerWorkspace.readLatest() !== null) studioWindowModel.moduleManagerWorkspace.publish(reading);
    else studioWindowModel.showOpenProject(reading);
  });
  const moduleManagerSources: ModuleManagerSources = {
    readPackageCatalog: () => backend.readPackageCatalog(),
    listWorkspaceDependencies: (checkForNewer) => backend.listWorkspaceDependencies(checkForNewer),
    chooseDependencySource: (sourceKind) => backend.chooseDependencySource(sourceKind),
    addDependencyToTheWorkspace: (source) => backend.addDependencyToTheWorkspace(source),
    updateWorkspaceDependency: (project, overwriteEditedFiles) => backend.updateWorkspaceDependency(project, overwriteEditedFiles),
    importFromTheMarketplace: (name) => backend.importFromTheMarketplace(name),
    openImportToEdit: (folder) => backend.openImportToEdit(folder),
    pathOfADroppedFile: (droppedFile) => backend.pathOfADroppedFile(droppedFile),
    describeRejection: describeBackendRejection,
  };
  const readTheOpenProject = () =>
    void backend.readOpenProject().then(
      (reading) => studioWindowModel.showOpenProject(reading),
      (rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)),
    );
  const whatTheWindowShowsIsRead = Promise.all([backend.readPoppedOutViewer().catch(() => null), backend.readModuleManagerWorkspace().catch(() => null)]).then(([poppedOutViewer, moduleManagerWorkspace]) => {
    if (poppedOutViewer !== null) studioWindowModel.showAsPoppedOutViewer(poppedOutViewer);
    else if (moduleManagerWorkspace !== null) studioWindowModel.moduleManagerWorkspace.publish(moduleManagerWorkspace);
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
      case "n":
        if (studioWindowModel.newProjectSheetOpenedWith.readLatest() !== null) return false;
        studioMenuBarCommands.createAProject();
        return true;
      case ",":
        studioMenuBarCommands.openPreferences();
        return true;
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    if (statusStore === null || studioWindowModel.poppedOutViewer.readLatest() !== null || studioWindowModel.moduleManagerWorkspace.readLatest() !== null) return;
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
            <TatolabWindowRoot studioWindowSources={studioWindowSources} moduleManagerSources={moduleManagerSources} noticeTheFirstStatusCommitted={noticeTheFirstStatusCommitted} />
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
