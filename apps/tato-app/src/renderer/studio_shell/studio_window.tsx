import { cn } from "cn";
import { PictureInPicture2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OpenProjectReading, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { AreaSplit } from "@tatolab/tato-app-view-sdk/design_system/area_split";
import { DocumentTabs } from "@tatolab/tato-app-view-sdk/design_system/document_tabs";
import { StudioMenuBar } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import { MenuGroup, MenuItem, MenuItemThatCannotBeChosen, MenuNote, MenuSeparator, MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { StudioAreaFrame, StudioAreaHeaderMenu, StudioAreaOverAViewsOwnFrame, StudioViewIconMark, type StudioAreaHeaderMenuIcon } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { WindowNotice } from "@tatolab/tato-app-view-sdk/design_system/window_notice";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { streamTabsDrawnInTheTitleRow } from "../presentation/stream_tabs_presentation";
import { streamFailureWords } from "../presentation/stream_failure_presentation";
import { presentRecentProjectChangeRefusalTitle } from "../presentation/projects_presentation";
import { AppUpdateAnnouncementDialogView } from "./app_update_announcement_dialog_view";
import { SettingsDialogView } from "../setup_and_settings/settings_dialog_view";
import { useTatolabStatus } from "../setup_and_settings/tatolab_window_context";
import { StudioViewFailureBoundary } from "../view_host/studio_view_failure_boundary";
import { useWatchedStudioValue, WatchedStudioValue } from "../view_host/watched_studio_value";
import type { ViewHeaderRow } from "../view_host/studio_view_contract";
import type { StudioViewHostServices, StudioViewTypeSource } from "../view_host/studio_view_contract";
import type { RegisteredStudioViewType, StudioViewNotOpened, StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { NewProjectSheetView, type NewProjectSources } from "./new_project_sheet_view";
import { StudioStatusBar } from "./studio_status_bar";
import { ProjectsView, type ProjectsSources } from "./projects_view";
import { studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode } from "./studio_area_layout";
import { studioMenuBarMenus, studioMenusInTheSystemMenuBar, type StreamTabsInTheMenus, type StudioMenuBarCommands, type StudioMenuInTheSystemMenuBar } from "./studio_menu_bar_model";
import { StreamMenuDialogsView, type StreamEditsOfTheStreamMenu } from "./stream_menu_dialogs_view";
import type { StudioWindowModel } from "./studio_window_model";

/** Who the view-type menu says brings the views the app ships with itself. */
const TATO_STUDIO_AS_A_VIEW_SOURCE = "Tato Studio";

/** Where the studio window's menus go on macOS: the system menu bar, while this window is in focus. */
export interface StudioWindowSystemMenuBar {
  showTheMenus(menus: readonly StudioMenuInTheSystemMenuBar[]): void;
}

/** What the studio window is drawn from: its model, the view types areas can show, what views are served, what its menus do, where they show on macOS, and its platform. */
export interface StudioWindowSources {
  model: StudioWindowModel;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
  commands: StudioMenuBarCommands;
  /** What the Stream menu's dialogs make, rename and delete streams through. */
  streamEdits: StreamEditsOfTheStreamMenu;
  /** Pop the view `area` shows out into a window of its own, pinned to the stream tab shown and the selection, with the area's settings. */
  popOutTheViewOfTheArea(area: StudioArea): void;
  systemMenuBar: StudioWindowSystemMenuBar;
  /** What the Projects window reads its projects from and opens them through. */
  projects: ProjectsSources;
  /** What the New project sheet chooses a location through and makes the project with. */
  newProject: NewProjectSources;
  platform: TatolabPlatform;
}

/** Who brought a view, in the words its menu row ends with. */
function wordsOfWhoBroughtTheView(broughtBy: StudioViewTypeSource): string {
  return broughtBy.kind === "project" ? broughtBy.project_name : TATO_STUDIO_AS_A_VIEW_SOURCE;
}

/** A view-type menu's row: the view's icon and title, and who brought it. */
function ViewTypeMenuRowIconTitleAndWhoBroughtIt({ icon, title, broughtBy }: { icon: StudioAreaHeaderMenuIcon; title: string; broughtBy: StudioViewTypeSource }) {
  return (
    <span className="flex w-full items-center gap-2">
      <StudioViewIconMark icon={icon} />
      <span className="flex-1">{title}</span>
      <span className="text-2xs text-fg-3">{wordsOfWhoBroughtTheView(broughtBy)}</span>
    </span>
  );
}

/** Views that do not open, each a row that cannot be chosen, described by why it does not open. */
function ViewTypesNotOpenedInTheMenu({ viewTypesNotOpened }: { viewTypesNotOpened: readonly StudioViewNotOpened[] }) {
  return viewTypesNotOpened.map((notOpened) => (
    <MenuItemThatCannotBeChosen
      key={notOpened.view_type_id}
      whyItCannotBeChosen={`${notOpened.title} doesn't open: ${notOpened.because}`}
      data-view-type-not-opened={notOpened.view_type_id}
    >
      <ViewTypeMenuRowIconTitleAndWhoBroughtIt icon="project_view" title={notOpened.title} broughtBy={notOpened.brought_by} />
    </MenuItemThatCannotBeChosen>
  ));
}

/** An area's view-type menu: the studio's views, each ticked when the area shows it, then the views the open project and its imports bring. */
function AreaViewTypeMenu({ area, sources, words }: { area: StudioArea; sources: StudioWindowSources; words: string }) {
  const projectStudioViews = useWatchedStudioValue(sources.viewTypeRegistry.projectStudioViews);
  useWatchedStudioValue(sources.viewTypeRegistry.developerMode);
  const projectViewTypes = sources.viewTypeRegistry.projectViewTypes();
  const projectViewTypesNotOpened = sources.viewTypeRegistry.projectViewTypesNotOpened();
  const viewTypeChoice = (viewType: RegisteredStudioViewType) => ({
    choice: viewType.view_type_id,
    label: <ViewTypeMenuRowIconTitleAndWhoBroughtIt icon={viewType.icon} title={viewType.title} broughtBy={viewType.brought_by} />,
  });
  const onChosen = (viewTypeId: string) => sources.model.showViewTypeInArea(area.area_id, viewTypeId);
  const iconOfTheArea = area.view_type_id === null ? "project_view" : (sources.viewTypeRegistry.viewTypeWithId(area.view_type_id)?.icon ?? "unreadable");
  return (
    <StudioAreaHeaderMenu icon={iconOfTheArea} words={words} label={`${words}: change this area's view`} data-area-view-type-menu={area.area_id}>
      <MenuGroup label="Studio views">
        <MenuSingleChoiceGroup closesTheMenuOnChoice
          choices={sources.viewTypeRegistry.studioViewTypes().map(viewTypeChoice)}
          chosen={area.view_type_id ?? ""}
          onChosen={onChosen}
          dataAttributeOfEachChoice="data-view-type-choice"
        />
        <ViewTypesNotOpenedInTheMenu viewTypesNotOpened={sources.viewTypeRegistry.studioViewTypesNotOpened()} />
      </MenuGroup>
      <MenuGroup label="Project views">
        {projectStudioViews.kind === "not_listed" && <MenuNote>{projectStudioViews.because}</MenuNote>}
        {projectStudioViews.kind === "listed" && projectViewTypes.length === 0 && projectViewTypesNotOpened.length === 0 && (
          <MenuNote>This project and its imports bring no views.</MenuNote>
        )}
        {projectViewTypes.length > 0 && (
          <MenuSingleChoiceGroup closesTheMenuOnChoice choices={projectViewTypes.map(viewTypeChoice)} chosen={area.view_type_id ?? ""} onChosen={onChosen} dataAttributeOfEachChoice="data-view-type-choice" />
        )}
        <ViewTypesNotOpenedInTheMenu viewTypesNotOpened={projectViewTypesNotOpened} />
      </MenuGroup>
      {area.view_type_id !== null && sources.viewTypeRegistry.viewTypeWithId(area.view_type_id) !== null && (
        <>
          <MenuSeparator />
          <MenuItem icon={PictureInPicture2} onChosen={() => sources.popOutTheViewOfTheArea(area)} data-area-pop-out={area.area_id}>
            Pop out into a window
          </MenuItem>
        </>
      )}
    </StudioAreaHeaderMenu>
  );
}

/** Where a frame's header row starts before the view-type menu is measured: an area header's height, with no inset. */
const HEADER_ROW_BEFORE_IT_IS_MEASURED: ViewHeaderRow = { leading_inset_px: 0, height_px: 30 };

/** One area: the view's own frame under the view-type menu, or why it shows none; a view that fails to draw says why there and nowhere else. */
function StudioAreaView({ area, sources }: { area: StudioArea; sources: StudioWindowSources }) {
  const projectStudioViews = useWatchedStudioValue(sources.viewTypeRegistry.projectStudioViews);
  useWatchedStudioValue(sources.viewTypeRegistry.developerMode);
  const [headerRowInTheFrame] = useState(() => new WatchedStudioValue<ViewHeaderRow>(HEADER_ROW_BEFORE_IT_IS_MEASURED));
  if (area.view_type_id === null) {
    return (
      <StudioAreaFrame label="Project view" header={<AreaViewTypeMenu area={area} sources={sources} words="Project view" />} data-studio-area={area.area_id}>
        <WaitingState
          title="A project's view shows here"
          explanation={
            projectStudioViews.kind === "not_listed"
              ? projectStudioViews.because
              : "Choose a view the project or its imports bring, such as a 3D scene, from the menu above."
          }
        />
      </StudioAreaFrame>
    );
  }
  const viewType = sources.viewTypeRegistry.viewTypeWithId(area.view_type_id);
  const viewTypeHeldForDeveloperMode = viewType === null ? sources.viewTypeRegistry.viewTypeHeldForDeveloperMode(area.view_type_id) : null;
  if (viewTypeHeldForDeveloperMode !== null) {
    return (
      <StudioAreaFrame label={viewTypeHeldForDeveloperMode.title} header={<AreaViewTypeMenu area={area} sources={sources} words={viewTypeHeldForDeveloperMode.title} />} data-studio-area={area.area_id}>
        <WaitingState
          title={`${viewTypeHeldForDeveloperMode.title} shows only in Developer mode`}
          explanation="Turn on Developer mode in Settings › Developer, or choose another view from the menu above."
          data-studio-area-held-for-developer-mode=""
        />
      </StudioAreaFrame>
    );
  }
  if (viewType === null) {
    return (
      <StudioAreaFrame label={area.view_type_id} header={<AreaViewTypeMenu area={area} sources={sources} words={area.view_type_id} />} data-studio-area={area.area_id}>
        <WaitingState title={`This area's view, ${area.view_type_id}, isn't in this build`} explanation="Choose another view from the menu above." />
      </StudioAreaFrame>
    );
  }
  return (
    <StudioAreaOverAViewsOwnFrame
      label={viewType.title}
      viewTypeMenu={
        <>
          <AreaViewTypeMenu area={area} sources={sources} words={viewType.title} />
          {viewType.renderWordsAfterTheViewTypeMenu?.(sources.viewHostServices)}
        </>
      }
      onHeaderRowMeasured={(headerRow) => headerRowInTheFrame.publish(headerRow)}
      data-studio-area={area.area_id}
    >
      <StudioViewFailureBoundary key={viewType.view_type_id} viewTitle={viewType.title}>
        {viewType.renderInAnArea(
          {
            area_id: area.area_id,
            saved_settings: area.settings,
            rememberSettings: (nextSettings) => sources.model.keepAreaSettings(area.area_id, nextSettings),
            header_row: headerRowInTheFrame,
          },
          sources.viewHostServices,
        )}
      </StudioViewFailureBoundary>
    </StudioAreaOverAViewsOwnFrame>
  );
}

/** A node of the chosen layout: a split of its parts, or an area. */
function StudioAreaLayoutNodeView({ node, layoutKey, sources }: { node: StudioAreaLayoutNode; layoutKey: string; sources: StudioWindowSources }) {
  if (node.kind === "area") return <StudioAreaView area={node} sources={sources} />;
  return (
    <AreaSplit
      key={`${layoutKey}:${node.split_id}`}
      label={node.direction === "row" ? "Areas side by side" : "Areas one above another"}
      direction={node.direction}
      parts={node.parts.map(({ size_percent, part }) => ({
        part_id: studioAreaLayoutNodeId(part),
        size_percent,
        content: <StudioAreaLayoutNodeView node={part} layoutKey={layoutKey} sources={sources} />,
      }))}
      onSizesChanged={(sizePercentByPartId) => sources.model.keepSplitSizes(node.split_id, sizePercentByPartId)}
    />
  );
}

/** The open project's name as the title row shows it, or its folder's when the project doesn't read. */
function openProjectTitleInTheTitleRow(openProject: OpenProjectReading): string {
  if (openProject.kind === "read") return openProject.open_project.project.name;
  if (openProject.kind === "unreadable") return openProject.folder.split("/").filter((part) => part !== "").at(-1) ?? openProject.folder;
  return "";
}

/** The studio: its menus in a row of their own on Linux (in the system menu bar on macOS), the open streams' tabs in the title row under them, which names the project on macOS, then the chosen layout's areas; or the Projects window, with no menus of its own on Linux, while no project is open or File › Projects shows it. */
export function StudioWindow({ sources }: { sources: StudioWindowSources }) {
  const { model, platform, commands, systemMenuBar } = sources;
  const status = useTatolabStatus();
  const openProject = useWatchedStudioValue(model.openProject);
  const studioLayouts = useWatchedStudioValue(model.studioLayouts);
  const openStreamTabs = useWatchedStudioValue(model.openStreamTabs);
  const activeStreamTab = useWatchedStudioValue(model.activeStreamTab);
  const closedStreamTabs = useWatchedStudioValue(model.closedStreamTabs);
  const streamMenuQuestion = useWatchedStudioValue(model.streamMenuQuestion);
  const streamDeletionRefusal = useWatchedStudioValue(model.streamDeletionRefusal);
  const settingsSection = useWatchedStudioValue(model.settingsSection);
  const projectOpeningRefusal = useWatchedStudioValue(model.projectOpeningRefusal);
  const viewPopOutRefusal = useWatchedStudioValue(model.viewPopOutRefusal);
  const recentProjectChangeRefusal = useWatchedStudioValue(model.recentProjectChangeRefusal);
  const projectRunRefusal = useWatchedStudioValue(model.projectRunRefusal);
  const projectEditRefusal = useWatchedStudioValue(model.projectEditRefusal);
  const appUpdateChoiceRefusal = useWatchedStudioValue(model.appUpdateChoiceRefusal);
  const openProjectStreamFailureRaised = useWatchedStudioValue(model.openProjectStreamFailureRaised);
  const newProjectSheetOpenedWith = useWatchedStudioValue(model.newProjectSheetOpenedWith);
  const isAProjectShown = openProject.kind !== "none_open" && studioLayouts !== null;
  const menusLiveInTheSystemMenuBar = presentPlatform(platform).menusLiveInTheSystemMenuBar;
  const chosenLayoutShown = isAProjectShown ? studioLayouts.chosen_layout : null;
  const shownStreamDisplayName = isAProjectShown ? (activeStreamTab?.display_name ?? null) : null;
  const openStreamTabCount = isAProjectShown ? openStreamTabs.tabs.length : 0;
  const hasAClosedStreamTabToReopen = isAProjectShown && closedStreamTabs.length > 0;
  const streamTabsInTheMenus = useMemo<StreamTabsInTheMenus>(
    () => ({ shown_stream_display_name: shownStreamDisplayName, open_tab_count: openStreamTabCount, has_a_closed_tab_to_reopen: hasAClosedStreamTabToReopen }),
    [shownStreamDisplayName, openStreamTabCount, hasAClosedStreamTabToReopen],
  );
  useEffect(() => {
    if (menusLiveInTheSystemMenuBar) systemMenuBar.showTheMenus(studioMenusInTheSystemMenuBar(chosenLayoutShown, streamTabsInTheMenus, status.app_update, commands));
  }, [menusLiveInTheSystemMenuBar, systemMenuBar, chosenLayoutShown, streamTabsInTheMenus, status.app_update, commands]);
  return (
    <div className="relative flex h-full flex-col bg-studio-frame text-studio" data-studio-window="">
      {isAProjectShown ? (
        <header className="flex shrink-0 flex-col bg-studio-menu-bar">
          {!menusLiveInTheSystemMenuBar && (
            <div className="flex h-8 items-center pr-2.5 pl-(--studio-menu-bar-leading-inset)" data-studio-menu-row="">
              <StudioMenuBar label="Studio" menus={studioMenuBarMenus(platform, studioLayouts.chosen_layout, streamTabsInTheMenus, status.app_update, commands)} />
            </div>
          )}
          <div
            className={cn("flex items-stretch pr-2.5 pl-(--studio-menu-bar-leading-inset)", menusLiveInTheSystemMenuBar ? "h-(--studio-menu-bar-height)" : "h-9")}
            data-window-drag-region={windowDragRegionAttribute(platform, "deep") ?? undefined}
            data-studio-title-row=""
          >
            {presentPlatform(platform).hasOverlayTitleBar && (
              // macOS's overlay title bar draws no title of its own, so the row names the project; Linux's window title bar shows it.
              <p className="flex max-w-60 shrink-0 items-center pr-6 text-2xs text-fg-3" data-studio-window-title="">
                <span className="truncate">{openProjectTitleInTheTitleRow(openProject)}</span>
              </p>
            )}
            <DocumentTabs
              label="Open streams"
              icon="stream"
              tabs={streamTabsDrawnInTheTitleRow(openStreamTabs)}
              activeTabId={openStreamTabs.active_stream}
              onTabChosen={(stream) => model.chooseStreamTab(stream)}
              onTabClosed={(stream) => model.closeStreamTab(stream)}
              whenNoneIsOpen="Open a stream from the outliner to see it here."
            />
            <div className="min-w-6 flex-1" />
          </div>
        </header>
      ) : (
        // macOS draws the window buttons over the content, so the Projects window keeps a bare strip for them to sit in and to drag the window by.
        presentPlatform(platform).hasOverlayTitleBar && (
          <div
            className="h-(--studio-menu-bar-height) shrink-0 border-b border-studio-frame bg-studio-menu-bar"
            data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
            data-projects-title-bar=""
          />
        )
      )}
      {!isAProjectShown ? (
        <ProjectsView model={model} projectsSources={sources.projects} commands={commands} platform={platform} />
      ) : (
        <>
          <main className="flex min-h-0 flex-1 p-(--studio-area-gap)" data-studio-layout={studioLayouts.chosen_layout}>
            <StudioAreaLayoutNodeView
              node={studioLayouts.layouts[studioLayouts.chosen_layout]}
              layoutKey={studioLayouts.chosen_layout}
              sources={sources}
            />
          </main>
          <StudioStatusBar
            viewHostServices={sources.viewHostServices}
            projectFolder={openProject.kind === "read" ? openProject.open_project.project.folder : openProject.kind === "unreadable" ? openProject.folder : null}
            platform={platform}
          />
        </>
      )}
      {isAProjectShown && <StreamMenuDialogsView question={streamMenuQuestion} streamEdits={sources.streamEdits} onClosed={() => model.streamMenuQuestion.publish(null)} />}
      <NewProjectSheetView openedWith={newProjectSheetOpenedWith} sources={sources.newProject} onClosed={() => model.newProjectSheetOpenedWith.publish(null)} />
      <SettingsDialogView
        shownSection={settingsSection}
        onSectionChosen={(section) => model.settingsSection.publish(section)}
        onClosed={() => model.settingsSection.publish(null)}
        openProjectInSettings={{
          openProjectFolder: isAProjectShown && openProject.kind === "read" ? openProject.open_project.project.folder : null,
          projectSettingsSources: sources.projects,
        }}
      />
      <AppUpdateAnnouncementDialogView
        onUpdateInstallChosen={() => {
          model.appUpdateChoiceRefusal.publish(null);
          model.settingsSection.publish("about");
        }}
        onAnswerRefused={(because) => model.appUpdateChoiceRefusal.publish(because)}
      />
      <div className="pointer-events-none absolute right-4 bottom-4 z-40 flex flex-col-reverse gap-2">
        <div aria-live="assertive" aria-atomic="true">
          {projectOpeningRefusal !== null && (
            <WindowNotice
              tone="failure"
              title="The project didn't open"
              detail={projectOpeningRefusal}
              onDismissed={() => model.projectOpeningRefusal.publish(null)}
              data-project-opening-refusal=""
            />
          )}
          {recentProjectChangeRefusal !== null && (
            <WindowNotice
              tone="failure"
              title={presentRecentProjectChangeRefusalTitle(recentProjectChangeRefusal.asked_to)}
              detail={recentProjectChangeRefusal.because}
              onDismissed={() => model.recentProjectChangeRefusal.publish(null)}
              data-recent-project-change-refusal={recentProjectChangeRefusal.asked_to}
            />
          )}
          {viewPopOutRefusal !== null && (
            <WindowNotice
              tone="failure"
              title="The view didn't pop out"
              detail={viewPopOutRefusal}
              onDismissed={() => model.viewPopOutRefusal.publish(null)}
              data-view-pop-out-refusal=""
            />
          )}
          {projectRunRefusal !== null && (
            <WindowNotice
              tone="failure"
              title={projectRunRefusal.asked_to === "run" ? "The project didn't run" : "The project didn't stop"}
              detail={projectRunRefusal.because}
              onDismissed={() => model.projectRunRefusal.publish(null)}
              data-project-run-refusal=""
            />
          )}
          {projectEditRefusal !== null && (
            <WindowNotice
              tone="failure"
              title={projectEditRefusal.asked_to === "undo" ? "Nothing was undone" : "Nothing was redone"}
              detail={projectEditRefusal.because}
              onDismissed={() => model.projectEditRefusal.publish(null)}
              data-project-edit-refusal=""
            />
          )}
          {streamDeletionRefusal !== null && (
            <WindowNotice
              tone="failure"
              title="The stream wasn't deleted"
              detail={streamDeletionRefusal}
              onDismissed={() => model.streamDeletionRefusal.publish(null)}
              data-stream-deletion-refusal=""
            />
          )}
          {appUpdateChoiceRefusal !== null && (
            <WindowNotice
              tone="failure"
              title="Tato Studio couldn't update"
              detail={appUpdateChoiceRefusal}
              onDismissed={() => model.appUpdateChoiceRefusal.publish(null)}
              data-app-update-choice-refusal=""
            />
          )}
          {openProjectStreamFailureRaised !== null && isAProjectShown && (
            <WindowNotice
              tone="failure"
              title={`${openProjectStreamFailureRaised.display_name} failed`}
              detail={streamFailureWords(openProjectStreamFailureRaised.failed_because)}
              actions={
                <ActionButton
                  size="small"
                  onPressed={() => {
                    model.openStreamTabOfAListedStream(openProjectStreamFailureRaised.stream);
                    model.openProjectStreamFailureRaised.publish(null);
                  }}
                  data-open-project-stream-failure-action="show_stream"
                >
                  Show stream
                </ActionButton>
              }
              onDismissed={() => model.openProjectStreamFailureRaised.publish(null)}
              data-open-project-stream-failure={openProjectStreamFailureRaised.stream}
            />
          )}
        </div>
      </div>
    </div>
  );
}
