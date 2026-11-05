import { FolderOpen, FolderPlus, LayoutGrid, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecentProject } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { EmptyState } from "../design_system/empty_state";
import { ProjectCard } from "../design_system/project_card";
import { SearchField } from "../design_system/search_field";
import { SectionNavigationList } from "../design_system/section_navigation_list";
import { WaitingState } from "../design_system/waiting_state";
import { presentHomeWithNoCards, presentRecentProjectCards, type HomeProjectFilter } from "../presentation/home_presentation";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { useWatchedStudioValue } from "../view_host/in_window_view_host";
import type { StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";
import { WelcomeSplashView } from "./welcome_splash_view";

/** What Home reads its projects from and opens them through. */
export interface HomeSources {
  /** The projects opened before, recent first. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of them, in the studio. */
  openARecentProject(folder: string): void;
}

const HOME_FILTER_TITLES: Record<HomeProjectFilter, string> = { all_projects: "All projects", running_now: "Running now" };

/** The recent projects, read as Home shows and again each time the open project changes; `null` until the first read answers. */
function useRecentProjects(homeSources: HomeSources, model: StudioWindowModel): RecentProject[] | null {
  const openProject = useWatchedStudioValue(model.openProject);
  const [recentProjects, setRecentProjects] = useState<RecentProject[] | null>(null);
  useEffect(() => {
    let isStillShown = true;
    homeSources.readRecentProjects().then(
      (readRecentProjects) => isStillShown && setRecentProjects(readRecentProjects),
      () => isStillShown && setRecentProjects([]),
    );
    return () => {
      isStillShown = false;
    };
  }, [homeSources, openProject]);
  return recentProjects;
}

/** Home, the app's project manager: the recent projects as cards, narrowed by running and by a search, with New project and Open a project folder…; on first run, the Welcome splash over it. */
export function HomeView({ model, homeSources, commands }: { model: StudioWindowModel; homeSources: HomeSources; commands: StudioMenuBarCommands }) {
  const status = useTatolabStatus();
  const listedStreams = useWatchedStudioValue(model.listedStreams);
  const recentProjects = useRecentProjects(homeSources, model);
  const [filter, setFilter] = useState<HomeProjectFilter>("all_projects");
  const [searchText, setSearchText] = useState("");
  const [isTheWelcomeDismissed, setIsTheWelcomeDismissed] = useState(false);
  const wallClockNowMs = Date.now();
  const allCards = presentRecentProjectCards(recentProjects ?? [], listedStreams, wallClockNowMs, "all_projects", "");
  const cardsShown = presentRecentProjectCards(recentProjects ?? [], listedStreams, wallClockNowMs, filter, searchText);
  const openTheProject = (folder: string) => {
    model.isHomeShown.publish(false);
    homeSources.openARecentProject(folder);
  };
  const noCards = presentHomeWithNoCards(filter, searchText);
  return (
    <div className="flex min-h-0 flex-1 bg-window text-fg" data-home="">
      <SectionNavigationList
        label="Projects"
        sectionGroups={[
          {
            groupLabel: "Projects",
            sections: [
              { section_id: "all_projects", label: HOME_FILTER_TITLES.all_projects, icon: LayoutGrid },
              { section_id: "running_now", label: HOME_FILTER_TITLES.running_now, icon: Play },
            ],
          },
        ]}
        shownSectionId={filter}
        onSectionChosen={(sectionId) => setFilter(sectionId === "running_now" ? "running_now" : "all_projects")}
        dataAttributeOfEachSection="data-home-filter"
      />
      <main className="scrollbar-thin flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-8 pt-7 pb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="mr-auto title-lg">{HOME_FILTER_TITLES[filter]}</h1>
          <SearchField label="Search projects" placeholder="Search projects" text={searchText} onTextChanged={setSearchText} data-home-search="" />
          <ActionButton icon={FolderOpen} onPressed={commands.openAProject} data-home-action="open">
            Open a project folder…
          </ActionButton>
          <ActionButton appearance="primary" icon={FolderPlus} onPressed={commands.createAProject} data-home-action="new">
            New project
          </ActionButton>
        </div>
        {recentProjects === null ? (
          <WaitingState title="Reading your projects…" />
        ) : cardsShown.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={LayoutGrid} title={noCards.title} explanation={noCards.explanation} data-home-empty="" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5" role="list" aria-label="Projects">
            {cardsShown.map((card) => (
              <div key={card.folder} role="listitem" className="flex min-w-0">
                <ProjectCard
                  name={card.name}
                  detail={`${card.folderWords} · ${card.lastOpenedWords}`}
                  isRunning={card.isRunning}
                  isUnreadable={card.isUnreadable}
                  onOpened={() => openTheProject(card.folder)}
                  data-home-project={card.folder}
                />
              </div>
            ))}
          </div>
        )}
      </main>
      <WelcomeSplashView
        isOpen={recentProjects !== null && recentProjects.length === 0 && !isTheWelcomeDismissed}
        onClosed={() => setIsTheWelcomeDismissed(true)}
        appVersion={status.app_version}
        recentProjects={allCards}
        onNewProject={commands.createAProject}
        onOpenAProjectFolder={commands.openAProject}
        onAllProjects={() => setFilter("all_projects")}
        onRecentProjectOpened={openTheProject}
      />
    </div>
  );
}
