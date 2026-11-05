import { FolderOpen, FolderPlus, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecentProject } from "../../shared/tatolab_backend_contract";
import projectsBannerStillImageUrl from "../assets/projects_banner_still.jpg";
import { ActionButton } from "../design_system/action_button";
import { BANNER_HEADER_HEIGHT_PX, BannerHeader } from "../design_system/banner_header";
import { EmptyState } from "../design_system/empty_state";
import { ProjectCard } from "../design_system/project_card";
import { SearchField } from "../design_system/search_field";
import { WaitingState } from "../design_system/waiting_state";
import { presentProjectsWithNoCards, presentRecentProjectCards } from "../presentation/projects_presentation";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { useWatchedStudioValue } from "../view_host/in_window_view_host";
import { PROJECTS_BANNER_STILL_SECONDS, ProjectsBannerScene } from "./projects_banner_scene";
import type { StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";

/** What the Projects window reads its projects from and opens them through. */
export interface ProjectsSources {
  /** The projects opened before, recent first. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of them, in the studio. */
  openARecentProject(folder: string): void;
}

/** The recent projects, read as the Projects window shows and again each time the open project changes; `null` until the first read answers. */
function useRecentProjects(projectsSources: ProjectsSources, model: StudioWindowModel): RecentProject[] | null {
  const openProject = useWatchedStudioValue(model.openProject);
  const [recentProjects, setRecentProjects] = useState<RecentProject[] | null>(null);
  useEffect(() => {
    let isStillShown = true;
    projectsSources.readRecentProjects().then(
      (readRecentProjects) => isStillShown && setRecentProjects(readRecentProjects),
      () => isStillShown && setRecentProjects([]),
    );
    return () => {
      isStillShown = false;
    };
  }, [projectsSources, openProject]);
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

/** The Projects window, the app's project manager: the banner with Open… and New project, then the recent projects as cards, narrowed by a search. */
export function ProjectsView({ model, projectsSources, commands }: { model: StudioWindowModel; projectsSources: ProjectsSources; commands: StudioMenuBarCommands }) {
  const status = useTatolabStatus();
  const listedStreams = useWatchedStudioValue(model.listedStreams);
  const recentProjects = useRecentProjects(projectsSources, model);
  const [searchText, setSearchText] = useState("");
  const wallClockNowMs = Date.now();
  const cardsShown = presentRecentProjectCards(recentProjects ?? [], listedStreams, wallClockNowMs, searchText);
  const noCards = presentProjectsWithNoCards(searchText);
  const openTheProject = (folder: string) => {
    model.isProjectsShown.publish(false);
    projectsSources.openARecentProject(folder);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-window text-fg" data-projects="">
      <BannerHeader
        appName="Tato Studio"
        versionWords={`v${status.app_version}`}
        banner={<ProjectsBanner />}
        actions={
          <>
            <ActionButton icon={FolderOpen} onPressed={commands.openAProject} data-projects-action="open">
              Open…
            </ActionButton>
            <ActionButton appearance="primary" icon={FolderPlus} onPressed={commands.createAProject} data-projects-action="new">
              New project
            </ActionButton>
          </>
        }
      />
      <main className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-8 pt-5.5 pb-7">
        <div className="flex items-center gap-3">
          <h2 className="mr-auto text-base font-semibold">Projects</h2>
          <SearchField label="Search projects" placeholder="Search" text={searchText} onTextChanged={setSearchText} data-projects-search="" />
        </div>
        {recentProjects === null ? (
          <WaitingState title="Reading your projects…" />
        ) : cardsShown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={LayoutGrid} title={noCards.title} explanation={noCards.explanation} data-projects-empty="" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4.5" role="list" aria-label="Projects">
            {cardsShown.map((card) => (
              <div key={card.folder} role="listitem" className="flex min-w-0">
                <ProjectCard
                  name={card.name}
                  detail={`${card.folderWords} · ${card.lastOpenedWords}`}
                  isRunning={card.isRunning}
                  isUnreadable={card.isUnreadable}
                  onOpened={() => openTheProject(card.folder)}
                  data-projects-project={card.folder}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
