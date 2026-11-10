import { PictureInPicture2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { AreaSplit } from "@tatolab/tato-app-view-sdk/design_system/area_split";
import { DocumentTabs } from "@tatolab/tato-app-view-sdk/design_system/document_tabs";
import { StudioMenuBar } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import { MenuGroup, MenuItem, MenuNote, MenuSeparator, MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { StudioAreaFrame, StudioAreaHeaderMenu, StudioAreaOverAViewsOwnFrame } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { WindowNotice } from "@tatolab/tato-app-view-sdk/design_system/window_notice";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { streamFailureWords } from "../presentation/stream_failure_presentation";
import { PreferencesDialogView } from "../setup_and_preferences/preferences_dialog_view";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { StudioViewFailureBoundary } from "../view_host/studio_view_failure_boundary";
import { useWatchedStudioValue, WatchedStudioValue } from "../view_host/watched_studio_value";
import type { ViewHeaderRow } from "../view_host/studio_view_contract";
import type { StudioViewHostServices } from "../view_host/studio_view_contract";
import type { StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { NewProjectSheetView, type NewProjectSources } from "./new_project_sheet_view";
import { ProjectsView, type ProjectsSources } from "./projects_view";
import { studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode } from "./studio_area_layout";
import {
  RUN_LIVE_KEY,
  studioMenuBarMenus,
  studioMenusInTheSystemMenuBar,
  type StudioMenuBarCommands,
  type StudioMenuInTheSystemMenuBar,
} from "./studio_menu_bar_model";
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
  /** Pop the view `area` shows out into a window of its own, pinned to the stream tab shown and the selection, with the area's settings. */
  popOutTheViewOfTheArea(area: StudioArea): void;
  systemMenuBar: StudioWindowSystemMenuBar;
  /** What the Projects window reads its projects from and opens them through. */
  projects: ProjectsSources;
  /** What the New project sheet chooses a location through and makes the project with. */
  newProject: NewProjectSources;
  platform: TatolabPlatform;
}

/** An area's view-type menu: the studio's views, each ticked when the area shows it, then the views the open project and its imports bring. */
function AreaViewTypeMenu({ area, sources, words }: { area: StudioArea; sources: StudioWindowSources; words: string }) {
  const projectStudioViews = useWatchedStudioValue(sources.viewTypeRegistry.projectStudioViews);
  useWatchedStudioValue(sources.viewTypeRegistry.developerMode);
  const projectViewTypes = sources.viewTypeRegistry.projectViewTypes();
  const projectViewTypesNotOpened = sources.viewTypeRegistry.projectViewTypesNotOpened();
  const viewTypeChoice = (viewTypeId: string, title: string, broughtBy: string) => ({
    choice: viewTypeId,
    label: (
      <span className="flex w-full items-center gap-2">
        <span className="flex-1">{title}</span>
        <span className="text-2xs text-fg-3">{broughtBy}</span>
      </span>
    ),
  });
  const onChosen = (viewTypeId: string) => sources.model.showViewTypeInArea(area.area_id, viewTypeId);
  const iconOfTheArea = area.view_type_id === null ? "project_view" : (sources.viewTypeRegistry.viewTypeWithId(area.view_type_id)?.icon ?? "unreadable");
  return (
    <StudioAreaHeaderMenu icon={iconOfTheArea} words={words} label={`${words}: change this area's view`} data-area-view-type-menu={area.area_id}>
      <MenuGroup label="Studio views">
        {sources.viewTypeRegistry.studioViewTypesNotOpened().map((notOpened) => (
          <MenuNote key={notOpened.view_type_id}>
            {notOpened.view_type_id} doesn't open: {notOpened.because}
          </MenuNote>
        ))}
        <MenuSingleChoiceGroup
          choices={sources.viewTypeRegistry.studioViewTypes().map((viewType) => viewTypeChoice(viewType.view_type_id, viewType.title, TATO_STUDIO_AS_A_VIEW_SOURCE))}
          chosen={area.view_type_id ?? ""}
          onChosen={onChosen}
          dataAttributeOfEachChoice="data-view-type-choice"
        />
      </MenuGroup>
      <MenuGroup label="Project views">
        {projectStudioViews.kind === "not_listed" && <MenuNote>{projectStudioViews.because}</MenuNote>}
        {projectStudioViews.kind === "listed" && projectViewTypes.length === 0 && projectViewTypesNotOpened.length === 0 && (
          <MenuNote>This project and its imports bring no views.</MenuNote>
        )}
        {projectViewTypesNotOpened.map((notOpened) => (
          <MenuNote key={notOpened.view_type_id}>
            {notOpened.view_type_id} doesn't open: {notOpened.because}
          </MenuNote>
        ))}
        {projectViewTypes.length > 0 && (
          <MenuSingleChoiceGroup
            choices={projectViewTypes.map((viewType) =>
              viewTypeChoice(viewType.view_type_id, viewType.title, viewType.brought_by.kind === "project" ? viewType.brought_by.project_name : TATO_STUDIO_AS_A_VIEW_SOURCE),
            )}
            chosen={area.view_type_id ?? ""}
            onChosen={onChosen}
            dataAttributeOfEachChoice="data-view-type-choice"
          />
        )}
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
          explanation="Turn on Developer mode in Preferences › Developer, or choose another view from the menu above."
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
      viewTypeMenu={<AreaViewTypeMenu area={area} sources={sources} words={viewType.title} />}
      onHeaderRowMeasured={(headerRow) => headerRowInTheFrame.publish(headerRow)}
      data-studio-area={area.area_id}
    >
      <StudioViewFailureBoundary key={viewType.view_type_id} viewTitle={viewType.title}>
        {viewType.renderInAnArea(
          { saved_settings: area.settings, rememberSettings: (nextSettings) => sources.model.keepAreaSettings(area.area_id, nextSettings), header_row: headerRowInTheFrame },
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

/** The studio: its menus along the top (in the system menu bar on macOS), the open streams' tabs, and the chosen layout's areas; or the Projects window, with no menus of its own on Linux, while no project is open or File › Projects shows it. */
export function StudioWindow({ sources }: { sources: StudioWindowSources }) {
  const { model, platform, commands, systemMenuBar } = sources;
  const status = useTatolabStatus();
  const openProject = useWatchedStudioValue(model.openProject);
  const studioLayouts = useWatchedStudioValue(model.studioLayouts);
  const openStreamTabs = useWatchedStudioValue(model.openStreamTabs);
  const preferencesSection = useWatchedStudioValue(model.preferencesSection);
  const projectOpeningRefusal = useWatchedStudioValue(model.projectOpeningRefusal);
  const viewPopOutRefusal = useWatchedStudioValue(model.viewPopOutRefusal);
  const projectRunRefusal = useWatchedStudioValue(model.projectRunRefusal);
  const appUpdateChoiceRefusal = useWatchedStudioValue(model.appUpdateChoiceRefusal);
  const openProjectStreamFailureRaised = useWatchedStudioValue(model.openProjectStreamFailureRaised);
  const newProjectSheetOpenedWith = useWatchedStudioValue(model.newProjectSheetOpenedWith);
  const isAProjectShown = openProject.kind !== "none_open" && studioLayouts !== null;
  const menusLiveInTheSystemMenuBar = presentPlatform(platform).menusLiveInTheSystemMenuBar;
  const chosenLayoutShown = isAProjectShown ? studioLayouts.chosen_layout : null;
  useEffect(() => {
    if (menusLiveInTheSystemMenuBar) systemMenuBar.showTheMenus(studioMenusInTheSystemMenuBar(chosenLayoutShown, status.app_update, commands));
  }, [menusLiveInTheSystemMenuBar, systemMenuBar, chosenLayoutShown, status.app_update, commands]);
  return (
    <div className="relative flex h-full flex-col bg-studio-frame text-studio" data-studio-window="">
      {isAProjectShown ? (
        <header
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center gap-2.5 border-b border-studio-frame bg-studio-menu-bar pr-2.5 pl-(--studio-menu-bar-leading-inset)"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          {!menusLiveInTheSystemMenuBar && <StudioMenuBar label="Studio" menus={studioMenuBarMenus(platform, studioLayouts.chosen_layout, status.app_update, commands)} />}
          <ActionButton
            appearance="primary"
            size="small"
            icon={Play}
            tooltip={`Run the project's streams (${RUN_LIVE_KEY})`}
            onPressed={commands.runTheProjectLive}
            className="ml-auto"
            data-studio-run-live=""
          >
            Live
          </ActionButton>
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
          <DocumentTabs
            label="Open streams"
            tabs={openStreamTabs.tabs.map((tab) => ({ tab_id: tab.stream, context_words: tab.project_name, name: tab.display_name }))}
            activeTabId={openStreamTabs.active_stream}
            onTabChosen={(stream) => model.chooseStreamTab(stream)}
            onTabClosed={(stream) => model.closeStreamTab(stream)}
            whenNoneIsOpen="Open a stream from the outliner to see it here."
          />
          <main className="flex min-h-0 flex-1 px-(--studio-area-gap) pb-(--studio-area-gap)" data-studio-layout={studioLayouts.chosen_layout}>
            <StudioAreaLayoutNodeView
              node={studioLayouts.layouts[studioLayouts.chosen_layout]}
              layoutKey={studioLayouts.chosen_layout}
              sources={sources}
            />
          </main>
        </>
      )}
      <NewProjectSheetView openedWith={newProjectSheetOpenedWith} sources={sources.newProject} onClosed={() => model.newProjectSheetOpenedWith.publish(null)} />
      <PreferencesDialogView
        shownSection={preferencesSection}
        onSectionChosen={(section) => model.preferencesSection.publish(section)}
        onClosed={() => model.preferencesSection.publish(null)}
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
