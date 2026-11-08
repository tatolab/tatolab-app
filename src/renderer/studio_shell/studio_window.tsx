import { Play } from "lucide-react";
import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { AreaSplit } from "../design_system/area_split";
import { DocumentTabs } from "../design_system/document_tabs";
import { StudioMenuBar } from "../design_system/menu_bar";
import { MenuGroup, MenuNote, MenuSingleChoiceGroup } from "../design_system/menus";
import { StudioAreaFrame, StudioAreaHeaderMenu } from "../design_system/studio_area_frame";
import { WaitingState } from "../design_system/waiting_state";
import { WindowNotice } from "../design_system/window_notice";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { streamFailureWords } from "../presentation/stream_failure_presentation";
import { PreferencesDialogView } from "../setup_and_preferences/preferences_dialog_view";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { StudioViewFailureBoundary, useWatchedStudioValue } from "../view_host/in_window_view_host";
import type { StudioViewHostServices, StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { NewProjectSheetView, type NewProjectSources } from "./new_project_sheet_view";
import { ProjectsView, type ProjectsSources } from "./projects_view";
import { studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode } from "./studio_area_layout";
import { RUN_LIVE_KEY, studioMenuBarMenus, type StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";

/** The issue that brings users' own view types, the 3D scene among them. */
const USERS_VIEW_TYPES_ISSUE = "tatolab/tatolab-app#137";

/** What the studio window is drawn from: its model, the view types areas can show, what views are served, what its menus do, and its platform. */
export interface StudioWindowSources {
  model: StudioWindowModel;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
  commands: StudioMenuBarCommands;
  /** What the Projects window reads its projects from and opens them through. */
  projects: ProjectsSources;
  /** What the New project sheet chooses a location through and makes the project with. */
  newProject: NewProjectSources;
  platform: TatolabPlatform;
}

/** An area's view-type menu: the studio's views, each ticked when the area shows it, then the views the open project and its imports bring. */
function AreaViewTypeMenu({ area, sources, words }: { area: StudioArea; sources: StudioWindowSources; words: string }) {
  const projectViewTypes = sources.viewTypeRegistry.projectViewTypes();
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
        <MenuSingleChoiceGroup
          choices={sources.viewTypeRegistry.studioViewTypes().map((viewType) => viewTypeChoice(viewType.view_type_id, viewType.title, "built in"))}
          chosen={area.view_type_id ?? ""}
          onChosen={onChosen}
          dataAttributeOfEachChoice="data-view-type-choice"
        />
      </MenuGroup>
      <MenuGroup label="Project views">
        {projectViewTypes.length === 0 ? (
          <MenuNote>Views a project brings arrive with users' own view types.</MenuNote>
        ) : (
          <MenuSingleChoiceGroup
            choices={projectViewTypes.map((viewType) =>
              viewTypeChoice(viewType.view_type_id, viewType.title, viewType.brought_by.kind === "project" ? viewType.brought_by.project_name : "built in"),
            )}
            chosen={area.view_type_id ?? ""}
            onChosen={onChosen}
            dataAttributeOfEachChoice="data-view-type-choice"
          />
        )}
      </MenuGroup>
    </StudioAreaHeaderMenu>
  );
}

/** One area: its header with the view-type menu and the view's tools, over the view; a view that fails to draw says why there and nowhere else. */
function StudioAreaView({ area, sources }: { area: StudioArea; sources: StudioWindowSources }) {
  if (area.view_type_id === null) {
    return (
      <StudioAreaFrame label="Project view" header={<AreaViewTypeMenu area={area} sources={sources} words="Project view" />} data-studio-area={area.area_id}>
        <WaitingState
          title="A project's view shows here"
          explanation="A 3D scene, or any view the project or its imports bring, opens in this area."
          waitsOn={USERS_VIEW_TYPES_ISSUE}
        />
      </StudioAreaFrame>
    );
  }
  const viewType = sources.viewTypeRegistry.viewTypeWithId(area.view_type_id);
  if (viewType === null) {
    return (
      <StudioAreaFrame label={area.view_type_id} header={<AreaViewTypeMenu area={area} sources={sources} words={area.view_type_id} />} data-studio-area={area.area_id}>
        <WaitingState title={`This area's view, ${area.view_type_id}, isn't in this build`} explanation="Choose another view from the menu above." />
      </StudioAreaFrame>
    );
  }
  const rendering = viewType.renderInAnArea(area.settings, sources.viewHostServices, (nextSettings) => sources.model.keepAreaSettings(area.area_id, nextSettings));
  return (
    <StudioAreaFrame
      label={viewType.title}
      header={
        <>
          <AreaViewTypeMenu area={area} sources={sources} words={viewType.title} />
          {rendering.header_tools}
        </>
      }
      data-studio-area={area.area_id}
    >
      <StudioViewFailureBoundary key={viewType.view_type_id} viewTitle={viewType.title}>
        {rendering.body}
      </StudioViewFailureBoundary>
    </StudioAreaFrame>
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

/** The studio: its menus along the top, the open streams' tabs, and the chosen layout's areas; or the Projects window, with no menus, while no project is open or File › Projects shows it. */
export function StudioWindow({ sources }: { sources: StudioWindowSources }) {
  const { model, platform, commands } = sources;
  const status = useTatolabStatus();
  const openProject = useWatchedStudioValue(model.openProject);
  const studioLayouts = useWatchedStudioValue(model.studioLayouts);
  const openStreamTabs = useWatchedStudioValue(model.openStreamTabs);
  const preferencesSection = useWatchedStudioValue(model.preferencesSection);
  const projectOpeningRefusal = useWatchedStudioValue(model.projectOpeningRefusal);
  const projectRunRefusal = useWatchedStudioValue(model.projectRunRefusal);
  const appUpdateChoiceRefusal = useWatchedStudioValue(model.appUpdateChoiceRefusal);
  const openProjectStreamFailureRaised = useWatchedStudioValue(model.openProjectStreamFailureRaised);
  const newProjectSheetOpenedWith = useWatchedStudioValue(model.newProjectSheetOpenedWith);
  const isAProjectShown = openProject.kind !== "none_open" && studioLayouts !== null;
  return (
    <div className="relative flex h-full flex-col bg-studio-frame text-studio" data-studio-window="">
      {isAProjectShown ? (
        <header
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center gap-2.5 border-b border-studio-frame bg-studio-menu-bar pr-2.5 pl-(--studio-menu-bar-leading-inset)"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          <StudioMenuBar label="Studio" menus={studioMenuBarMenus(platform, studioLayouts.chosen_layout, status.app_update, commands)} />
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
