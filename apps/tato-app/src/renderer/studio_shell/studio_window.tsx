import { Combine, Frame, PictureInPicture2, Play, Plus, Redo2, Square, StickyNote, Undo2, type LucideIcon } from "lucide-react";
import type { WindowToolbarGraphTool } from "@tatolab/tato-app-view-sdk";
import { KeyboardKey } from "@tatolab/tato-app-view-sdk/design_system/keyboard_key";
import { useEffect, useState } from "react";
import type { OpenProjectReading, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { AreaSplit } from "@tatolab/tato-app-view-sdk/design_system/area_split";
import { DocumentTabs } from "@tatolab/tato-app-view-sdk/design_system/document_tabs";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { StudioMenuBar } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import { MenuGroup, MenuItem, MenuItemThatCannotBeChosen, MenuNote, MenuSeparator, MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { StudioAreaFrame, StudioAreaHeaderMenu, StudioAreaOverAViewsOwnFrame, StudioViewIconMark, type StudioAreaHeaderMenuIcon } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { WindowNotice } from "@tatolab/tato-app-view-sdk/design_system/window_notice";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { playOrStopOfferedForTheProject } from "../presentation/project_play_presentation";
import { streamsOfTheProjectNoTabShows, streamTabsDrawnInTheStrip, type StreamsToOpenAsTabs } from "../presentation/stream_tabs_presentation";
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
import type { WindowToolbarGraphToolOffers } from "./window_toolbar_graph_tool_offers";
import { StudioStatusBar } from "./studio_status_bar";
import { ProjectsView, type ProjectsSources } from "./projects_view";
import { studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode } from "./studio_area_layout";
import {
  RUN_LIVE_KEY,
  STOP_KEY_HINT,
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
            offerGraphTools: (onToolPressed) => sources.model.windowToolbarGraphToolOffers.offerFrom(area.area_id, onToolPressed),
            personWorksInTheArea: () => sources.model.windowToolbarGraphToolOffers.personWorkedInTheArea(area.area_id),
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

/** The + menu's choices: each stream of the open project no tab shows, opened as a tab when chosen. */
function StreamsOfTheProjectToOpenAsTabs({ model, offered }: { model: StudioWindowModel; offered: StreamsToOpenAsTabs }) {
  if (offered.kind === "none_to_offer") return <MenuNote>{offered.because}</MenuNote>;
  return (
    <MenuGroup label="Open a stream">
      {offered.streams.map((stream) => (
        <MenuItem key={stream.stream} onChosen={() => model.openStreamTabOfAListedStream(stream.stream)} data-stream-tab-to-open={stream.stream}>
          {stream.display_name}
        </MenuItem>
      ))}
    </MenuGroup>
  );
}

/** The open project's name as the toolbar titles the window, or its folder's when the project doesn't read. */
function openProjectTitleInTheToolbar(openProject: OpenProjectReading): string {
  if (openProject.kind === "read") return openProject.open_project.project.name;
  if (openProject.kind === "unreadable") return openProject.folder.split("/").filter((part) => part !== "").at(-1) ?? openProject.folder;
  return "";
}

/** How the toolbar draws each graph tool: its icon, its words, and the key that does the same over the graph. */
const WINDOW_TOOLBAR_GRAPH_TOOL_LOOKS: readonly { tool: WindowToolbarGraphTool; icon: LucideIcon; words: string; label: string; key: string | null }[] = [
  { tool: "add_node", icon: Plus, words: "Add node", label: "Add a node to the graph", key: "Tab" },
  { tool: "frame_selection", icon: Frame, words: "Frame", label: "Frame the selected nodes", key: "F" },
  { tool: "add_note", icon: StickyNote, words: "Note", label: "Add a note to the graph", key: null },
  { tool: "add_subgraph", icon: Combine, words: "Subgraph", label: "Collapse the selection into a subgraph", key: null },
];

/** Why the toolbar's graph tools cannot be pressed while no area offers them. */
const NO_GRAPH_OFFERS_ITS_TOOLS = "Show a stream graph to use its tools";

/** The graph tools of the stream graph the person last worked in, in the window's toolbar; disabled, saying why, while no area offers them. */
function WindowToolbarGraphTools({ offers }: { offers: WindowToolbarGraphToolOffers }) {
  const shown = useWatchedStudioValue(offers.shown);
  return (
    <div role="group" aria-label="Graph tools" className="flex items-center gap-0.5" data-studio-graph-tools={shown?.area_id ?? ""}>
      {WINDOW_TOOLBAR_GRAPH_TOOL_LOOKS.map(({ tool, icon, words, label, key }) => {
        const offered = shown?.tools.find((offeredTool) => offeredTool.tool === tool);
        const disabledReason = shown === null ? NO_GRAPH_OFFERS_ITS_TOOLS : offered === undefined ? `This graph offers no ${words} tool` : offered.disabled_reason;
        return (
          <ActionButton
            key={tool}
            appearance="quiet"
            size="small"
            icon={icon}
            label={label}
            tooltip={key === null ? label : `${label} (${key})`}
            disabledReason={disabledReason}
            onPressed={() => shown?.press(tool)}
            data-studio-graph-tool={tool}
          >
            {words}
            {key === "Tab" && <KeyboardKey isAlreadyAnnounced>{key}</KeyboardKey>}
          </ActionButton>
        );
      })}
    </div>
  );
}

/** Tells `offers` which area the person works in: one they press in, or one whose view's frame takes the focus. */
function useTheAreaThePersonWorksIn(offers: WindowToolbarGraphToolOffers) {
  useEffect(() => {
    const areaIdOf = (element: Element | null) => element?.closest<HTMLElement>("[data-studio-area]")?.dataset["studioArea"] ?? null;
    const personWorkedAt = (element: Element | null) => {
      const areaId = areaIdOf(element);
      if (areaId !== null) offers.personWorkedInTheArea(areaId);
    };
    const onPointerDown = (event: PointerEvent) => personWorkedAt(event.target instanceof Element ? event.target : null);
    const onFocusIn = (event: FocusEvent) => personWorkedAt(event.target instanceof Element ? event.target : null);
    const onWindowBlur = () => personWorkedAt(document.activeElement);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [offers]);
}

/** The studio: its menus along the top (in the system menu bar on macOS), the open streams' tabs, and the chosen layout's areas; or the Projects window, with no menus of its own on Linux, while no project is open or File › Projects shows it. */
export function StudioWindow({ sources }: { sources: StudioWindowSources }) {
  const { model, platform, commands, systemMenuBar } = sources;
  useTheAreaThePersonWorksIn(model.windowToolbarGraphToolOffers);
  const status = useTatolabStatus();
  const openProject = useWatchedStudioValue(model.openProject);
  const studioLayouts = useWatchedStudioValue(model.studioLayouts);
  const openStreamTabs = useWatchedStudioValue(model.openStreamTabs);
  const settingsSection = useWatchedStudioValue(model.settingsSection);
  const projectOpeningRefusal = useWatchedStudioValue(model.projectOpeningRefusal);
  const viewPopOutRefusal = useWatchedStudioValue(model.viewPopOutRefusal);
  const recentProjectChangeRefusal = useWatchedStudioValue(model.recentProjectChangeRefusal);
  const projectRunRefusal = useWatchedStudioValue(model.projectRunRefusal);
  const projectEditRefusal = useWatchedStudioValue(model.projectEditRefusal);
  const listedStreams = useWatchedStudioValue(model.listedStreams);
  const appUpdateChoiceRefusal = useWatchedStudioValue(model.appUpdateChoiceRefusal);
  const openProjectStreamFailureRaised = useWatchedStudioValue(model.openProjectStreamFailureRaised);
  const newProjectSheetOpenedWith = useWatchedStudioValue(model.newProjectSheetOpenedWith);
  const isAProjectShown = openProject.kind !== "none_open" && studioLayouts !== null;
  const openProjectFolder = openProject.kind === "read" ? openProject.open_project.project.folder : null;
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
          <div className="flex items-center gap-0.5">
            <IconButton icon={Undo2} label="Undo your last edit" onPressed={commands.undoYourLastEdit} data-studio-undo="" />
            <IconButton icon={Redo2} label="Redo what you undid" onPressed={commands.redoYourLastUndo} data-studio-redo="" />
          </div>
          <span aria-hidden className="h-4.5 w-px shrink-0 bg-line-strong" />
          <WindowToolbarGraphTools offers={model.windowToolbarGraphToolOffers} />
          {presentPlatform(platform).hasOverlayTitleBar && (
            // macOS's overlay title bar draws no title of its own, so the project's name fills the toolbar's free middle; Linux's window title bar shows it.
            <p className="pointer-events-none min-w-0 flex-1 truncate text-center text-xs text-fg-2" data-studio-window-title="">
              {openProjectTitleInTheToolbar(openProject)}
            </p>
          )}
          {playOrStopOfferedForTheProject(openProjectFolder, listedStreams) === "play" ? (
            <ActionButton
              appearance="positive"
              size="small"
              icon={Play}
              tooltip={`Play the project's streams (${RUN_LIVE_KEY})`}
              onPressed={commands.runTheProjectLive}
              className="ml-auto px-4"
              data-studio-play-or-stop="play"
            >
              Play
            </ActionButton>
          ) : (
            <ActionButton
              appearance="destructive"
              size="small"
              icon={Square}
              tooltip={`Stop the project's streams (${STOP_KEY_HINT})`}
              onPressed={commands.stopTheProject}
              className="ml-auto px-4 font-semibold"
              data-studio-play-or-stop="stop"
            >
              Stop
            </ActionButton>
          )}
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
            tabs={streamTabsDrawnInTheStrip(openStreamTabs)}
            activeTabId={openStreamTabs.active_stream}
            onTabChosen={(stream) => model.chooseStreamTab(stream)}
            onTabClosed={(stream) => model.closeStreamTab(stream)}
            whenNoneIsOpen="Open a stream from the outliner to see it here."
            tabsToOpen={{ label: "Open a stream of the project", choices: <StreamsOfTheProjectToOpenAsTabs model={model} offered={streamsOfTheProjectNoTabShows(openProjectFolder, listedStreams, openStreamTabs)} /> }}
          />
          <main className="flex min-h-0 flex-1 px-(--studio-area-gap) pb-(--studio-area-gap)" data-studio-layout={studioLayouts.chosen_layout}>
            <StudioAreaLayoutNodeView
              node={studioLayouts.layouts[studioLayouts.chosen_layout]}
              layoutKey={studioLayouts.chosen_layout}
              sources={sources}
            />
          </main>
          <StudioStatusBar
            viewHostServices={sources.viewHostServices}
            projectFolder={openProject.kind === "read" ? openProject.open_project.project.folder : openProject.kind === "unreadable" ? openProject.folder : null}
            activeStream={openStreamTabs.active_stream}
            platform={platform}
          />
        </>
      )}
      <NewProjectSheetView openedWith={newProjectSheetOpenedWith} sources={sources.newProject} onClosed={() => model.newProjectSheetOpenedWith.publish(null)} />
      <SettingsDialogView
        shownSection={settingsSection}
        onSectionChosen={(section) => model.settingsSection.publish(section)}
        onClosed={() => model.settingsSection.publish(null)}
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
