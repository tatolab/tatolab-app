import { FolderOpen, FolderPlus } from "lucide-react";
import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { AreaSplit } from "../design_system/area_split";
import { DocumentTabs } from "../design_system/document_tabs";
import { EmptyState } from "../design_system/empty_state";
import { StudioMenuBar } from "../design_system/menu_bar";
import { MenuGroup, MenuNote, MenuSingleChoiceGroup } from "../design_system/menus";
import { StudioAreaFrame, StudioAreaHeaderMenu } from "../design_system/studio_area_frame";
import { WaitingState } from "../design_system/waiting_state";
import { WindowNotice } from "../design_system/window_notice";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import { FirstRunFinishingRefusalNoticeView } from "../setup_and_preferences/first_run_finishing_refusal_notice_view";
import { PreferencesDialogView } from "../setup_and_preferences/preferences_dialog_view";
import { StudioViewFailureBoundary, useWatchedStudioValue } from "../view_host/in_window_view_host";
import type { StudioViewHostServices, StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode } from "./studio_area_layout";
import { studioMenuBarMenus, type StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";

/** The issue that brings users' own view types, the 3D scene among them. */
const USERS_VIEW_TYPES_ISSUE = "tatolab/tatolab-app#137";

/** What the studio window is drawn from: its model, the view types areas can show, what views are served, what its menus do, and its platform. */
export interface StudioWindowSources {
  model: StudioWindowModel;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
  commands: StudioMenuBarCommands;
  platform: TatolabPlatform;
}

/** An area's view-type menu: the studio's views, each ticked when the area shows it, then the views the workspace's projects bring. */
function AreaViewTypeMenu({ area, sources, words }: { area: StudioArea; sources: StudioWindowSources; words: string }) {
  const workspaceViewTypes = sources.viewTypeRegistry.workspaceViewTypes();
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
  const iconOfTheArea = area.view_type_id === null ? "workspace_view" : (sources.viewTypeRegistry.viewTypeWithId(area.view_type_id)?.icon ?? "unreadable");
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
      <MenuGroup label="Workspace views">
        {workspaceViewTypes.length === 0 ? (
          <MenuNote>Views a workspace project brings arrive with users' own view types.</MenuNote>
        ) : (
          <MenuSingleChoiceGroup
            choices={workspaceViewTypes.map((viewType) =>
              viewTypeChoice(viewType.view_type_id, viewType.title, viewType.brought_by.kind === "workspace_project" ? viewType.brought_by.project_name : "built in"),
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
      <StudioAreaFrame label="Workspace view" header={<AreaViewTypeMenu area={area} sources={sources} words="Workspace view" />} data-studio-area={area.area_id}>
        <WaitingState
          title="A workspace project's view shows here"
          explanation="A 3D scene, or any view a project in the workspace brings, opens in this area."
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

/** What the studio shows with no workspace open: what a workspace is, and the two ways to have one. */
function StudioWelcome({ commands }: { commands: StudioMenuBarCommands }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-1" data-studio-welcome="">
      <EmptyState
        icon={FolderOpen}
        title="Open a workspace"
        explanation="A workspace is a folder holding a project: its pyproject.toml, its streams, and the projects it imports."
      >
        <div className="flex gap-2">
          <ActionButton appearance="primary" icon={FolderOpen} onPressed={commands.openAWorkspace} data-studio-welcome-action="open">
            Open a workspace…
          </ActionButton>
          <ActionButton appearance="secondary" icon={FolderPlus} onPressed={commands.createAWorkspace} data-studio-welcome-action="new">
            New workspace…
          </ActionButton>
        </div>
      </EmptyState>
    </div>
  );
}

/** The studio: its menus along the top, the open streams' tabs, and the chosen layout's areas, or a welcome while no workspace is open. */
export function StudioWindow({ sources }: { sources: StudioWindowSources }) {
  const { model, platform, commands } = sources;
  const openWorkspace = useWatchedStudioValue(model.openWorkspace);
  const workspaceLayouts = useWatchedStudioValue(model.workspaceLayouts);
  const openStreamTabs = useWatchedStudioValue(model.openStreamTabs);
  const preferencesSection = useWatchedStudioValue(model.preferencesSection);
  const workspaceOpeningRefusal = useWatchedStudioValue(model.workspaceOpeningRefusal);
  return (
    <div className="relative flex h-full flex-col bg-studio-frame text-studio" data-studio-window="">
      <header
        className="flex h-(--studio-menu-bar-height) shrink-0 items-center gap-2.5 border-b border-studio-frame bg-studio-menu-bar pr-2.5 pl-(--studio-menu-bar-leading-inset)"
        data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
      >
        <StudioMenuBar label="Studio" menus={studioMenuBarMenus(platform, workspaceLayouts?.chosen_layout ?? null, commands)} />
      </header>
      {openWorkspace.kind === "none_open" || workspaceLayouts === null ? (
        <StudioWelcome commands={commands} />
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
          <main className="flex min-h-0 flex-1 px-(--studio-area-gap) pb-(--studio-area-gap)" data-workspace-layout={workspaceLayouts.chosen_layout}>
            <StudioAreaLayoutNodeView
              node={workspaceLayouts.layouts[workspaceLayouts.chosen_layout]}
              layoutKey={workspaceLayouts.chosen_layout}
              sources={sources}
            />
          </main>
        </>
      )}
      <PreferencesDialogView
        shownSection={preferencesSection}
        onSectionChosen={(section) => model.preferencesSection.publish(section)}
        onClosed={() => model.preferencesSection.publish(null)}
      />
      <div className="pointer-events-none absolute right-4 bottom-4 z-40 flex flex-col-reverse gap-2">
        <div aria-live="assertive" aria-atomic="true">
          {workspaceOpeningRefusal !== null && (
            <WindowNotice
              tone="failure"
              title="The workspace didn't open"
              detail={workspaceOpeningRefusal}
              onDismissed={() => model.workspaceOpeningRefusal.publish(null)}
              data-workspace-opening-refusal=""
            />
          )}
        </div>
        <FirstRunFinishingRefusalNoticeView />
      </div>
    </div>
  );
}
