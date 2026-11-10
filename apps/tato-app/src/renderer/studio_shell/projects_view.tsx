import { Copy, FileArchive, FolderInput, FolderPlus, LayoutGrid, List, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecentProject, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import projectsBannerStillImageUrl from "../assets/projects_banner_still.jpg";
import { BANNER_HEADER_HEIGHT_PX, BannerHeader } from "@tatolab/tato-app-view-sdk/design_system/banner_header";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import { EmptyState } from "@tatolab/tato-app-view-sdk/design_system/empty_state";
import { ExpandingSearchField } from "@tatolab/tato-app-view-sdk/design_system/expanding_search_field";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { FieldMenu, IconButtonMenu, MenuItem, MenuSeparator, MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { ProjectCard, ProjectListHeading, ProjectListRow } from "@tatolab/tato-app-view-sdk/design_system/project_card";
import { SplitActionButton } from "@tatolab/tato-app-view-sdk/design_system/split_action_button";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { shortcutHint } from "../presentation/platform_presentation";
import {
  PROJECTS_LAYOUTS,
  PROJECTS_ORDERS,
  presentProjectDeletionQuestion,
  presentProjectsHomeChoices,
  presentProjectsWithNoCards,
  presentRecentProjectCards,
  type ProjectsHomeChoices,
  type RecentProjectCardPresentation,
  type RecentProjectChange,
  type ProjectsLayout,
  type ProjectsOrder,
} from "../presentation/projects_presentation";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { useWatchedStudioValue } from "../view_host/watched_studio_value";
import { PROJECTS_BANNER_STILL_SECONDS, ProjectsBannerScene } from "./projects_banner_scene";
import type { ProjectsHomeChoicesKeptInStorage } from "./projects_home_choices_kept_in_storage";
import { RenameProjectDialogView, type ProjectToRename } from "./rename_project_dialog_view";
import type { StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";
import { isTatolabWindowVisible } from "../window_visibility";

/** What the Projects window reads its projects from and opens them through. */
export interface ProjectsSources {
  /** Where the chosen order and layout are kept between launches. */
  projectsHomeChoices: Pick<ProjectsHomeChoicesKeptInStorage, "readKeptChoices" | "keepChoices">;
  /** The projects opened before, recent first. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of them, in the studio. */
  openARecentProject(folder: string): void;
  /** Name `folder`, one of them, `name` through the runtime; rejects in the runtime's own words. */
  renameARecentProject(folder: string, name: string): Promise<void>;
  /** Duplicate `folder`, one of them, beside itself; rejects in the runtime's own words. */
  duplicateARecentProject(folder: string): Promise<void>;
  /** Delete `folder`, one of them, its folder moved to the Trash; rejects in the runtime's own words. */
  deleteARecentProject(folder: string): Promise<void>;
  /** Say why a change asked of a project did not happen, as `because` words it; `null` clears what was said. */
  sayWhyTheChangeDidNotHappen(refusal: { asked_to: RecentProjectChange; because: string } | null): void;
}

/** How many times the window has come back to the person, focused or shown again, since it opened. */
function useTimesTheWindowCameBack(): number {
  const [timesTheWindowCameBack, setTimesTheWindowCameBack] = useState(0);
  useEffect(() => {
    const countTheWindowComingBack = () => setTimesTheWindowCameBack((timesBefore) => timesBefore + 1);
    const countTheWindowShownAgain = () => {
      if (isTatolabWindowVisible()) countTheWindowComingBack();
    };
    window.addEventListener("focus", countTheWindowComingBack);
    document.addEventListener("visibilitychange", countTheWindowShownAgain);
    return () => {
      window.removeEventListener("focus", countTheWindowComingBack);
      document.removeEventListener("visibilitychange", countTheWindowShownAgain);
    };
  }, []);
  return timesTheWindowCameBack;
}

/**
 * The recent projects, read as the Projects window shows, each time it is focused or shown again, each time the open project changes, and each time
 * one is renamed, duplicated or deleted from here; `null` until the first read answers. A project opens in its own studio window, so coming back to this window is when one opened since shows.
 */
function useRecentProjects(projectsSources: ProjectsSources, model: StudioWindowModel, timesTheProjectsChanged: number): RecentProject[] | null {
  const openProject = useWatchedStudioValue(model.openProject);
  const timesTheWindowCameBack = useTimesTheWindowCameBack();
  const [recentProjects, setRecentProjects] = useState<RecentProject[] | null>(null);
  useEffect(() => {
    let isStillShown = true;
    projectsSources.readRecentProjects().then(
      (readRecentProjects) => isStillShown && setRecentProjects(readRecentProjects),
      () => isStillShown && setRecentProjects((recentProjectsBefore) => recentProjectsBefore ?? []),
    );
    return () => {
      isStillShown = false;
    };
  }, [projectsSources, openProject, timesTheWindowCameBack, timesTheProjectsChanged]);
  return recentProjects;
}

/** The banner's live scene at the width of the window, playing while it shows; one still frame under reduced motion, and the still picture where WebGL is not offered. */
function ProjectsBanner() {
  const sceneHostElement = useRef<HTMLDivElement>(null);
  const [isTheSceneDrawn, setIsTheSceneDrawn] = useState(false);
  useEffect(() => {
    const sceneHost = sceneHostElement.current;
    if (sceneHost === null) return;
    const scene = ProjectsBannerScene.create(sceneHost.clientWidth, BANNER_HEADER_HEIGHT_PX);
    if (scene === null) return;
    scene.canvas.className = "block size-full";
    sceneHost.append(scene.canvas);
    const isMotionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isMotionReduced) scene.drawAt(PROJECTS_BANNER_STILL_SECONDS);
    else scene.play(() => performance.now());
    const resizeObserver = new ResizeObserver(() => {
      scene.resize(sceneHost.clientWidth, BANNER_HEADER_HEIGHT_PX);
      if (isMotionReduced) scene.drawAt(PROJECTS_BANNER_STILL_SECONDS);
    });
    resizeObserver.observe(sceneHost);
    setIsTheSceneDrawn(true);
    return () => {
      resizeObserver.disconnect();
      scene.stop();
      scene.canvas.remove();
    };
  }, []);
  return (
    <div ref={sceneHostElement} className="absolute inset-0" data-projects-banner={isTheSceneDrawn ? "live" : "still"}>
      {!isTheSceneDrawn && <img src={projectsBannerStillImageUrl} alt="" draggable={false} className="size-full object-cover select-none" />}
    </div>
  );
}

/** The icon each layout is shown by, on the View button and in its menu. */
const PROJECTS_LAYOUT_ICONS = { grid: LayoutGrid, list: List } as const;

/** The order and layout chosen, read from where they are kept as the window opens and kept again each time one changes. */
function useProjectsHomeChoices(projectsSources: ProjectsSources): [ProjectsHomeChoices, (changedProjectsHomeChoices: Partial<ProjectsHomeChoices>) => void] {
  const [projectsHomeChoices, setProjectsHomeChoices] = useState<ProjectsHomeChoices>(() => projectsSources.projectsHomeChoices.readKeptChoices());
  const changeTheProjectsHomeChoices = (changedProjectsHomeChoices: Partial<ProjectsHomeChoices>) => {
    const projectsHomeChoicesNow = { ...projectsHomeChoices, ...changedProjectsHomeChoices };
    setProjectsHomeChoices(projectsHomeChoicesNow);
    projectsSources.projectsHomeChoices.keepChoices(projectsHomeChoicesNow);
  };
  return [projectsHomeChoices, changeTheProjectsHomeChoices];
}

/** The Projects window, the app's project manager: the banner with Preferences, then the projects as cards or rows, narrowed by a search, ordered by a sort, and New project with Import project…. */
export function ProjectsView({
  model,
  projectsSources,
  commands,
  platform,
}: {
  model: StudioWindowModel;
  projectsSources: ProjectsSources;
  commands: StudioMenuBarCommands;
  platform: TatolabPlatform;
}) {
  const status = useTatolabStatus();
  const [timesTheProjectsChanged, setTimesTheProjectsChanged] = useState(0);
  const recentProjects = useRecentProjects(projectsSources, model, timesTheProjectsChanged);
  const [projectToRename, setProjectToRename] = useState<ProjectToRename | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<RecentProjectCardPresentation | null>(null);
  const [isTheDeletionQuestionOpen, setIsTheDeletionQuestionOpen] = useState(false);
  const readTheProjectsAgain = () => setTimesTheProjectsChanged((timesBefore) => timesBefore + 1);
  const changeAProject = (askedTo: RecentProjectChange, change: () => Promise<void>) => {
    projectsSources.sayWhyTheChangeDidNotHappen(null);
    change().then(readTheProjectsAgain, (rejection: unknown) => {
      projectsSources.sayWhyTheChangeDidNotHappen({ asked_to: askedTo, because: describeBackendRejection(rejection) });
      readTheProjectsAgain();
    });
  };
  const moreActionsOf = (card: RecentProjectCardPresentation) => (
    <>
      <MenuItem icon={Pencil} onChosen={() => setProjectToRename({ folder: card.folder, name: card.name })} data-project-action="rename">
        Rename…
      </MenuItem>
      <MenuItem icon={Copy} onChosen={() => changeAProject("duplicate", () => projectsSources.duplicateARecentProject(card.folder))} data-project-action="duplicate">
        Duplicate
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={Trash2}
        isDestructive
        onChosen={() => {
          setProjectToDelete(card);
          setIsTheDeletionQuestionOpen(true);
        }}
        data-project-action="delete"
      >
        Delete…
      </MenuItem>
    </>
  );
  const [searchText, setSearchText] = useState("");
  const [projectsHomeChoices, changeTheProjectsHomeChoices] = useProjectsHomeChoices(projectsSources);
  const projectsHomeChoicesShown = presentProjectsHomeChoices(projectsHomeChoices);
  const wallClockNowMs = Date.now();
  const cardsShown = presentRecentProjectCards(recentProjects ?? [], wallClockNowMs, searchText, projectsHomeChoices.order);
  const noCards = presentProjectsWithNoCards(searchText);
  const openTheProject = (folder: string) => {
    projectsSources.openARecentProject(folder);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-window text-fg" data-projects="" data-projects-layout={projectsHomeChoices.layout}>
      <BannerHeader
        appName="Tato Studio"
        versionWords={`v${status.app_version}`}
        banner={<ProjectsBanner />}
        actions={<IconButton icon={Settings} label="Preferences" tooltip={`Preferences (${shortcutHint(platform, ",")})`} onPressed={commands.openPreferences} data-projects-action="preferences" />}
      />
      <main className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-8 pt-5.5 pb-7">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">Projects</h2>
          <ExpandingSearchField label="Search projects" placeholder="Search projects" text={searchText} onTextChanged={setSearchText} data-projects-search="" />
          <FieldMenu label={projectsHomeChoicesShown.sortButtonLabel} words={projectsHomeChoicesShown.sortWords} data-projects-sort="">
            <MenuSingleChoiceGroup<ProjectsOrder>
              choices={PROJECTS_ORDERS.map(({ order, words }) => ({ choice: order, label: words }))}
              chosen={projectsHomeChoices.order}
              onChosen={(order) => changeTheProjectsHomeChoices({ order })}
              dataAttributeOfEachChoice="data-projects-sort-choice"
            />
          </FieldMenu>
          <IconButtonMenu icon={PROJECTS_LAYOUT_ICONS[projectsHomeChoices.layout]} label={projectsHomeChoicesShown.viewButtonLabel} data-projects-view="">
            <MenuSingleChoiceGroup<ProjectsLayout>
              choices={PROJECTS_LAYOUTS.map(({ layout, words }) => {
                const LayoutIcon = PROJECTS_LAYOUT_ICONS[layout];
                return {
                  choice: layout,
                  label: (
                    <span className="flex items-center gap-2">
                      <LayoutIcon className="size-4 text-fg-3" strokeWidth={1.75} aria-hidden />
                      {words}
                    </span>
                  ),
                };
              })}
              chosen={projectsHomeChoices.layout}
              onChosen={(layout) => changeTheProjectsHomeChoices({ layout })}
              dataAttributeOfEachChoice="data-projects-view-choice"
            />
          </IconButtonMenu>
          <SplitActionButton
            icon={Plus}
            onPressed={commands.createAProject}
            menuLabel="More ways to start a project"
            menuDataAttributes={{ "data-projects-action": "new-menu" }}
            menuChoices={
              <>
                <MenuItem icon={FolderPlus} shortcutHint={shortcutHint(platform, "N")} onChosen={commands.createAProject} data-projects-new-menu-choice="new">
                  New project
                </MenuItem>
                <MenuItem icon={FolderInput} onChosen={commands.openAProject} data-projects-new-menu-choice="import">
                  Import project folder…
                </MenuItem>
                <MenuItem icon={FileArchive} onChosen={commands.importAProjectArchive} data-projects-new-menu-choice="import-archive">
                  Import project .zip…
                </MenuItem>
              </>
            }
            data-projects-action="new"
          >
            New project
          </SplitActionButton>
        </div>
        {recentProjects === null ? (
          <WaitingState title="Reading your projects…" />
        ) : cardsShown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={LayoutGrid} title={noCards.title} explanation={noCards.explanation} data-projects-empty="" />
          </div>
        ) : projectsHomeChoices.layout === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-7" role="list" aria-label="Projects">
            {cardsShown.map((card) => (
              <div key={card.folder} role="listitem" className="flex min-w-0">
                <ProjectCard
                  name={card.name}
                  description={card.descriptionWords}
                  hasADescription={card.hasADescription}
                  folderWords={card.folderWords}
                  when={card.whenWords}
                  coverNumber={card.coverNumber}
                  coverInitial={card.coverInitial}
                  isUnreadable={card.isUnreadable}
                  onOpened={() => openTheProject(card.folder)}
                  moreActions={moreActionsOf(card)}
                  moreActionsLabel={`Actions for ${card.name}`}
                  data-projects-project={card.folder}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            <ProjectListHeading />
            <div className="flex flex-col" role="list" aria-label="Projects">
              {cardsShown.map((card) => (
                <div key={card.folder} role="listitem" className="flex min-w-0 border-b border-line">
                  <ProjectListRow
                    name={card.name}
                    description={card.descriptionWords}
                    hasADescription={card.hasADescription}
                    folderWords={card.folderWords}
                    when={card.whenWordsInTheList}
                    coverNumber={card.coverNumber}
                    coverInitial={card.coverInitial}
                    isUnreadable={card.isUnreadable}
                    onOpened={() => openTheProject(card.folder)}
                    moreActions={moreActionsOf(card)}
                    moreActionsLabel={`Actions for ${card.name}`}
                    data-projects-project={card.folder}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <RenameProjectDialogView
        projectToRename={projectToRename}
        renameTheProject={async (folder, name) => {
          await projectsSources.renameARecentProject(folder, name);
          readTheProjectsAgain();
        }}
        onClosed={() => setProjectToRename(null)}
      />
      <ConfirmationDialog
        isOpen={isTheDeletionQuestionOpen}
        onOpenChange={setIsTheDeletionQuestionOpen}
        onClosedCompletely={() => setProjectToDelete(null)}
        question={projectToDelete === null ? null : presentProjectDeletionQuestion(projectToDelete.name)}
        isDestructive
        onConfirmed={() => {
          setIsTheDeletionQuestionOpen(false);
          if (projectToDelete !== null) {
            const folderToDelete = projectToDelete.folder;
            changeAProject("delete", () => projectsSources.deleteARecentProject(folderToDelete));
          }
        }}
        confirmDataAttributes={{ "data-project-deletion-action": "confirm" }}
        data-project-deletion-question=""
      />
    </div>
  );
}
