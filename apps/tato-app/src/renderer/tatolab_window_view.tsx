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
} from "./setup_and_settings/tatolab_window_context";
import { RUN_LIVE_KEY, studioMenusSentToTheSystemMenuBar, type StudioMenuBarCommands } from "./studio_shell/studio_menu_bar_model";
import { ModuleManagerWindowView, type ModuleManagerSources } from "./studio_shell/module_manager_window_view";
import { PoppedOutViewWindowView } from "./studio_shell/popped_out_view_window_view";
import { poppedOutViewOfTheArea } from "./studio_shell/popped_out_view_pin";
import { StudioWindow, type StudioWindowSources } from "./studio_shell/studio_window";
import { StudioWindowModel } from "./studio_shell/studio_window_model";
import { STUDIO_LAYOUTS, StudioLayoutsKeptInStorage } from "./studio_shell/studio_layouts";

import { studioViewHostServicesOf } from "./view_host/studio_view_host_services";
import { useWatchedStudioValue } from "./view_host/watched_studio_value";
import { StreamGraphAndCatalogReadings } from "./view_host/stream_graph_and_catalog_readings";
import { StudioViewTypeRegistry, studioViewTypeTitlesOf } from "./view_host/studio_view_type_registry";
import { tatolabFrameViewType } from "./view_host/tatolab_frame_view_type";
import { coreViewTypesOf, servedCoreViewFolderUrl } from "./view_host/core_view_types";
import { CORE_VIEWS } from "@tatolab/tato-app-core-views";
import { ProjectLogReadings } from "./view_host/project_log_readings";
import { ProjectTransactionsReadings } from "./view_host/project_transactions_readings";
import { ProjectListingReadingsPolledWhileWatched } from "./view_host/project_listing_readings_polled_while_watched";
import { PythonLanguageServerConnections } from "./view_host/python_language_server_connections";
import { PortViewerConnections } from "./view_host/port_viewer_connections";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "./window_visibility";
import { ProjectsHomeChoicesKeptInStorage } from "./studio_shell/projects_home_choices_kept_in_storage";
import { tatolabWindowLocalStorage } from "./tatolab_window_local_storage";

/** The `<input>` types a person types text into, each with an undo of its own. */
const TEXT_ENTRY_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

/** Whether `keyTarget` is a field taking typed text, whose own undo ⌘Z keeps; checked by shape, since a key in a view's frame comes from that frame's document. */
function isTextBeingEditedIn(keyTarget: EventTarget | null): boolean {
  if (keyTarget === null || !("tagName" in keyTarget) || typeof keyTarget.tagName !== "string") return false;
  if ("isContentEditable" in keyTarget && keyTarget.isContentEditable === true) return true;
  if (keyTarget.tagName === "TEXTAREA") return true;
  return keyTarget.tagName === "INPUT" && "type" in keyTarget && typeof keyTarget.type === "string" && TEXT_ENTRY_INPUT_TYPES.has(keyTarget.type);
}

/** The view types every studio area can show, in the view-type menu's order, Transactions only in Developer mode. */
function studioViewTypeRegistry(): StudioViewTypeRegistry {
  const coreViewTypes = coreViewTypesOf(CORE_VIEWS, (folder) => servedCoreViewFolderUrl(folder, document.baseURI));
  const coreViewTypeIn = (folder: string) => {
    const coreViewType = coreViewTypes.view_types_by_folder.get(folder);
    return coreViewType === undefined ? [] : [coreViewType];
  };
  return new StudioViewTypeRegistry(
    [
      ...coreViewTypeIn("stream_graph"),
      ...coreViewTypeIn("outliner"),
      ...coreViewTypeIn("library"),
      ...coreViewTypeIn("properties"),
      ...coreViewTypeIn("history"),
      ...coreViewTypeIn("viewer"),
      ...coreViewTypeIn("code"),
      ...coreViewTypeIn("files"),
      ...coreViewTypeIn("controls"),
    ],
    (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }),
    coreViewTypes.not_opened,
    coreViewTypeIn("transactions"),
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
    backend.listStudioViewsOfTheOpenProject().then(
      (studioViews) => {
        if (thisListing === listingsAsked) viewTypeRegistry.projectStudioViews.publish({ kind: "listed", studio_views: studioViews });
      },
      (rejection: unknown) => {
        if (thisListing === listingsAsked) viewTypeRegistry.projectStudioViews.publish({ kind: "not_listed", because: describeBackendRejection(rejection) });
      },
    );
  });
}

/** The studio, one view alone in a window popped out of one, or a studio window's Module manager window: the window's one screen from the first status on. */
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
  const poppedOutView = useWatchedStudioValue(studioWindowSources.model.poppedOutView);
  const projectOpeningRefusal = useWatchedStudioValue(studioWindowSources.model.projectOpeningRefusal);
  const moduleManagerWorkspace = useWatchedStudioValue(studioWindowSources.model.moduleManagerWorkspace);
  const moduleManagerSectionAsked = useWatchedStudioValue(studioWindowSources.model.moduleManagerSectionAsked);
  if (moduleManagerWorkspace !== null) {
    return <ModuleManagerWindowView workspace={moduleManagerWorkspace} sectionAsked={moduleManagerSectionAsked} sources={moduleManagerSources} platform={studioWindowSources.platform} />;
  }
  if (poppedOutView !== null) {
    return (
      <PoppedOutViewWindowView
        target={poppedOutView}
        viewTypeRegistry={studioWindowSources.viewTypeRegistry}
        viewHostServices={studioWindowSources.viewHostServices}
        projectReadingRefusal={projectOpeningRefusal}
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
  const projectNodeTypeReadings = new ProjectListingReadingsPolledWhileWatched((projectFolder) => backend.listProjectNodeTypes(projectFolder));
  projectNodeTypeReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => projectNodeTypeReadings.setPollingAllowed(isVisible));
  const projectAssetReadings = new ProjectListingReadingsPolledWhileWatched((projectFolder) => backend.listProjectAssets(projectFolder));
  projectAssetReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => projectAssetReadings.setPollingAllowed(isVisible));
  const pythonLanguageServerConnections = new PythonLanguageServerConnections(backend);
  const portViewerConnections = new PortViewerConnections(backend);
  const studioWindowModel = new StudioWindowModel(new StudioLayoutsKeptInStorage(tatolabWindowLocalStorage()));
  const projectTransactionsReadings = new ProjectTransactionsReadings(backend, () => {
    const openProject = studioWindowModel.openProject.readLatest();
    return openProject.kind === "read" ? openProject.open_project.project.folder : null;
  });

  const chooseProjectFolder = (chosenFor: ProjectFolderChosenFor) => {
    studioWindowModel.projectOpeningRefusal.publish(null);
    backend.chooseProjectFolder(chosenFor).catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
  };
  const undoOrRedoTheOpenProject = (askedTo: "undo" | "redo") => {
    studioWindowModel.projectEditRefusal.publish(null);
    const openProject = studioWindowModel.openProject.readLatest();
    if (openProject.kind !== "read") return;
    const openProjectFolder = openProject.open_project.project.folder;
    void projectTransactionsReadings.readThePersonEditing().then(async (thePersonEditing) => {
      if (thePersonEditing.kind === "not_read") return studioWindowModel.projectEditRefusal.publish({ asked_to: askedTo, because: thePersonEditing.because });
      const applying = await (askedTo === "undo" ? projectTransactionsReadings.undoInTheProject : projectTransactionsReadings.redoInTheProject)(openProjectFolder, thePersonEditing.author);
      if (applying.kind === "not_applied") studioWindowModel.projectEditRefusal.publish({ asked_to: askedTo, because: applying.because });
    });
  };
  const studioMenuBarCommands: StudioMenuBarCommands = {
    showProjects: () => {
      backend.showTheProjectsWindow().catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
    },
    openAProject: () => chooseProjectFolder("project_to_open"),
    createAProject: () => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.readNewProjectDefaults().then(
        (newProjectDefaults) => studioWindowModel.newProjectSheetOpenedWith.publish({ kind: "new_project", defaults: newProjectDefaults }),
        (rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)),
      );
    },
    importAProjectArchive: () => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.chooseProjectArchiveToImport().then(
        (chosenArchive) => chosenArchive !== null && studioWindowModel.newProjectSheetOpenedWith.publish({ kind: "project_archive", chosen: chosenArchive }),
        (rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)),
      );
    },
    openSettings: () => studioWindowModel.settingsSection.publish("general"),
    openAbout: () => studioWindowModel.settingsSection.publish("about"),
    checkForAppUpdates: () => {
      studioWindowModel.appUpdateChoiceRefusal.publish(null);
      studioWindowModel.settingsSection.publish("about");
      backend.checkForTatolabAppUpdates().catch((rejection: unknown) => studioWindowModel.appUpdateChoiceRefusal.publish(describeBackendRejection(rejection)));
    },
    takeTheNewerAppVersion: () => {
      studioWindowModel.appUpdateChoiceRefusal.publish(null);
      studioWindowModel.settingsSection.publish("about");
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
    undoYourLastEdit: () => undoOrRedoTheOpenProject("undo"),
    redoYourLastUndo: () => undoOrRedoTheOpenProject("redo"),
    openModuleManager: (shows) => {
      studioWindowModel.projectOpeningRefusal.publish(null);
      backend.openModuleManagerWindow(shows).catch((rejection: unknown) => studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection)));
    },
  };
  let onChosenByEntryIdOfTheMenusSent: ReadonlyMap<string, () => void> = new Map();
  backend.onSystemMenuBarEntryChosen((entryId) => onChosenByEntryIdOfTheMenusSent.get(entryId)?.());
  const viewTypeRegistry = studioViewTypeRegistry();
  listTheOpenProjectsStudioViews(backend, studioWindowModel, viewTypeRegistry);
  const studioWindowSources: StudioWindowSources = {
    model: studioWindowModel,
    viewTypeRegistry,
    viewHostServices: studioViewHostServicesOf(studioWindowModel.viewHostSources(studioViewTypeTitlesOf(viewTypeRegistry)), streamGraphAndCatalogReadings, {
      backend,
      projectLogReadings,
      projectNodeTypeReadings,
      projectAssetReadings,
      projectTransactionsReadings,
      pythonLanguageServerConnections,
      portViewerConnections,
    }),
    commands: studioMenuBarCommands,
    popOutTheViewOfTheArea: (area) => {
      const viewType = area.view_type_id === null ? null : viewTypeRegistry.viewTypeWithId(area.view_type_id);
      if (viewType === null) return;
      const openProject = studioWindowModel.openProject.readLatest();
      studioWindowModel.viewPopOutRefusal.publish(null);
      const poppedOutView = poppedOutViewOfTheArea({
        view_type_id: viewType.view_type_id,
        view_title: viewType.title,
        settings: area.settings,
        stream_tab: studioWindowModel.activeStreamTab.readLatest(),
        selection: studioWindowModel.selection.readLatest(),
        project_name: openProject.kind === "read" ? openProject.open_project.project.name : null,
      });
      backend.popOutView(poppedOutView).catch((rejection: unknown) => studioWindowModel.viewPopOutRefusal.publish(describeBackendRejection(rejection)));
    },
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
      renameARecentProject: (folder, name) => backend.renameRecentProject(folder, name),
      readARecentProjectCover: (folder) => backend.readRecentProjectCover(folder),
      setARecentProjectDescription: (folder, description) => backend.setRecentProjectDescription(folder, description),
      chooseAProjectCoverImage: () => backend.chooseProjectCoverImage(),
      setARecentProjectCover: (folder, image) => backend.setRecentProjectCover(folder, image),
      duplicateARecentProject: async (folder) => {
        await backend.duplicateRecentProject(folder);
      },
      deleteARecentProject: (folder) => backend.deleteRecentProject(folder),
      sayWhyTheChangeDidNotHappen: (refusal) => studioWindowModel.recentProjectChangeRefusal.publish(refusal),
    },
    newProject: {
      chooseNewProjectLocation: (startingAt) => backend.chooseNewProjectLocation(startingAt),
      createNewProject: async (name, location) => {
        const created = await backend.createNewProject(name, location);
        if (created.project_creation !== null) studioWindowModel.openTheNewProjectsStream(created.folder, created.project_creation.stream);
        return created;
      },
      importProjectArchive: (archive, name, location) => backend.importProjectArchive(archive, name, location),
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
  const readTheOpenProject = (onceRead: () => void = () => undefined) =>
    void backend.readOpenProject().then(
      (reading) => {
        studioWindowModel.showOpenProject(reading);
        onceRead();
      },
      (rejection: unknown) => {
        studioWindowModel.projectOpeningRefusal.publish(describeBackendRejection(rejection));
        onceRead();
      },
    );
  backend.onModuleManagerSectionAsked((shows) => studioWindowModel.askTheModuleManagerToShow(shows));
  const whatTheWindowShowsIsRead = Promise.all([
    backend.readPoppedOutView().catch(() => null),
    backend.readModuleManagerWorkspace().catch(() => null),
    backend.readModuleManagerSectionLastAsked().catch(() => null),
  ]).then(([poppedOutView, moduleManagerWorkspace, moduleManagerSectionLastAsked]) => {
    if (poppedOutView !== null) {
      studioWindowModel.showAsPoppedOutView(poppedOutView);
      readTheOpenProject(() => studioWindowModel.pinThePoppedOutView());
    } else if (moduleManagerWorkspace !== null) {
      if (moduleManagerSectionLastAsked !== null && studioWindowModel.moduleManagerSectionAsked.readLatest() === null) studioWindowModel.askTheModuleManagerToShow(moduleManagerSectionLastAsked);
      studioWindowModel.moduleManagerWorkspace.publish(moduleManagerWorkspace);
    } else readTheOpenProject();
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
        studioMenuBarCommands.openSettings();
        return true;
      default:
        return false;
    }
  }

  const runTheStudioShortcutOfTheKey = (keyboardEvent: KeyboardEvent) => {
    if (statusStore === null || studioWindowModel.poppedOutView.readLatest() !== null || studioWindowModel.moduleManagerWorkspace.readLatest() !== null) return;
    if (keyboardEvent.key === RUN_LIVE_KEY && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey) {
      if (studioWindowModel.studioLayouts.readLatest() === null) return;
      keyboardEvent.preventDefault();
      if (keyboardEvent.shiftKey) studioMenuBarCommands.stopTheProject();
      else studioMenuBarCommands.runTheProjectLive();
      return;
    }
    if (!holdsWindowShortcutModifier(platform, keyboardEvent)) return;
    const key = keyboardEvent.key.length === 1 ? keyboardEvent.key.toLowerCase() : keyboardEvent.key;
    if (key === "z" && !keyboardEvent.altKey && !isTextBeingEditedIn(keyboardEvent.target)) {
      if (studioWindowModel.studioLayouts.readLatest() === null) return;
      keyboardEvent.preventDefault();
      if (keyboardEvent.shiftKey) studioMenuBarCommands.redoYourLastUndo();
      else studioMenuBarCommands.undoYourLastEdit();
      return;
    }
    if (runStudioShortcut(key)) keyboardEvent.preventDefault();
  };
  document.addEventListener("keydown", runTheStudioShortcutOfTheKey);
  // A key pressed while a view's frame holds the focus reaches only the frame's own document; every
  // view's frame is on the window's origin, so Studio listens there too, as each page loads.
  document.addEventListener(
    "load",
    (loadEvent) => {
      const viewFrame = loadEvent.target;
      if (!(viewFrame instanceof HTMLIFrameElement) || viewFrame.dataset.tatolabView === undefined) return;
      viewFrame.contentWindow?.addEventListener("keydown", runTheStudioShortcutOfTheKey);
    },
    true,
  );

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
    viewTypeRegistry.developerMode.publish(status.developer_mode);
    if (statusStore === null) {
      const firstStatusStore = new TatolabWindowStatusStore(status);
      statusStore = firstStatusStore;
      void whatTheWindowShowsIsRead.then(() => renderTheWindowOn(firstStatusStore));
    } else {
      statusStore.publishStatus(status);
    }
  };
}
