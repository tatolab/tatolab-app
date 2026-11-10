import { Copy, FileArchive, FolderInput, FolderPlus, LayoutGrid, List, PanelRight, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecentProject, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import { EmptyState } from "@tatolab/tato-app-view-sdk/design_system/empty_state";
import { ExpandingSearchField } from "@tatolab/tato-app-view-sdk/design_system/expanding_search_field";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { FieldMenu, IconButtonMenu, MenuItem, MenuSeparator, MenuSingleChoiceGroup } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { NewProjectCard, ProjectCard, ProjectListHeading, ProjectListRow } from "@tatolab/tato-app-view-sdk/design_system/project_card";
import { SectionNavigationList } from "@tatolab/tato-app-view-sdk/design_system/section_navigation_list";
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
  presentRecentProjectChangePendingWords,
  type ProjectsHomeChoices,
  type RecentProjectCardPresentation,
  type RecentProjectChange,
  type RecentProjectChangeRefusal,
  type ProjectsLayout,
  type ProjectsOrder,
} from "../presentation/projects_presentation";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
import { useWatchedStudioValue } from "../view_host/watched_studio_value";
import { ProjectDetailsPanelView, type ProjectDetailsSources } from "./project_details_panel_view";
import type { ProjectsHomeChoicesKeptInStorage } from "./projects_home_choices_kept_in_storage";
import { RenameProjectDialogView, type ProjectToRename } from "./rename_project_dialog_view";
import type { StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";
import { isTatolabWindowVisible } from "../window_visibility";

/** What the Projects window reads its projects from and opens them through. */
export interface ProjectsSources extends ProjectDetailsSources {
  /** Where the chosen order and layout are kept between launches. */
  projectsHomeChoices: Pick<ProjectsHomeChoicesKeptInStorage, "readKeptChoices" | "keepChoices">;
  /** The projects opened before, recent first. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of them, in the studio. */
  openARecentProject(folder: string): void;
  /** The image `folder`, one of them, is shown by, as a URL; `null` for its plain cover. */
  readARecentProjectCover(folder: string): Promise<string | null>;
  /** Duplicate `folder`, one of them, beside itself; rejects in the runtime's own words. */
  duplicateARecentProject(folder: string): Promise<void>;
  /** Delete `folder`, one of them, its folder moved to the Trash; rejects in the runtime's own words. */
  deleteARecentProject(folder: string): Promise<void>;
  /** Say why a change asked of a project did not happen, as `because` words it; `null` clears what was said. */
  sayWhyTheChangeDidNotHappen(refusal: RecentProjectChangeRefusal | null): void;
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

/** A cover image read for a project, and the project's last edit when it was read, since choosing or removing a cover is an edit. */
interface CoverImageReadAtAnEdit {
  editedAtWallClockMs: number | null;
  coverImageUrl: string | null;
}

/**
 * The images the recent projects shown by a chosen cover are shown by, each read again only once its project has been edited since; a project whose
 * image could not be read shows its plain cover.
 */
function useRecentProjectCoverImages(recentProjects: RecentProject[] | null, projectsSources: ProjectsSources): ReadonlyMap<string, string> {
  const [coverImagesReadByFolder, setCoverImagesReadByFolder] = useState<ReadonlyMap<string, CoverImageReadAtAnEdit>>(new Map());
  const coverImagesRead = useRef(coverImagesReadByFolder);
  coverImagesRead.current = coverImagesReadByFolder;
  useEffect(() => {
    let isStillShown = true;
    const coveredProjects = (recentProjects ?? []).filter((recentProject) => recentProject.has_a_chosen_cover);
    void Promise.all(
      coveredProjects.map(async ({ folder, last_edited_at_wall_clock_ms }): Promise<[string, CoverImageReadAtAnEdit]> => {
        const readBefore = coverImagesRead.current.get(folder);
        if (readBefore !== undefined && readBefore.editedAtWallClockMs === last_edited_at_wall_clock_ms) return [folder, readBefore];
        const coverImageUrl = await projectsSources.readARecentProjectCover(folder).catch(() => null);
        return [folder, { editedAtWallClockMs: last_edited_at_wall_clock_ms, coverImageUrl }];
      }),
    ).then((coversRead) => {
      if (isStillShown) setCoverImagesReadByFolder(new Map(coversRead));
    });
    return () => {
      isStillShown = false;
    };
  }, [recentProjects, projectsSources]);
  return new Map([...coverImagesReadByFolder].flatMap(([folder, { coverImageUrl }]) => (coverImageUrl === null ? [] : [[folder, coverImageUrl] as const])));
}

/**
 * Which project the Project details panel shows: the first one shown, until the person works in the panel, which keeps it on that project, picks one
 * from its ⋯ menu, or hides the panel. One it keeps by itself stays out of a narrow window.
 */
type ProjectShownInTheDetailsPanel =
  | { kind: "the_first_project_shown" }
  | { kind: "the_project_in"; folder: string; isShownOnlyInAWideWindow: boolean }
  | { kind: "none" };

/** The one place the Projects window's sidebar leads to. */
const ALL_PROJECTS_SECTION = { section_id: "all_projects", label: "All projects", icon: LayoutGrid };

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

/**
 * The Projects window, the app's project manager: a sidebar with the app's name and Preferences; All projects as cards or rows, narrowed by a search,
 * ordered by a sort, with New project and its imports; and the Project details panel for one of them.
 */
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
  const [changesRunningByFolder, setChangesRunningByFolder] = useState<ReadonlyMap<string, Exclude<RecentProjectChange, "rename">>>(new Map());
  const readTheProjectsAgain = () => setTimesTheProjectsChanged((timesBefore) => timesBefore + 1);
  const changeAProject = (folder: string, askedTo: Exclude<RecentProjectChange, "rename">, change: () => Promise<void>) => {
    if (changesRunningByFolder.has(folder)) return;
    projectsSources.sayWhyTheChangeDidNotHappen(null);
    setChangesRunningByFolder((changesBefore) => new Map(changesBefore).set(folder, askedTo));
    const changeEnded = () => {
      setChangesRunningByFolder((changesBefore) => {
        const changesAfter = new Map(changesBefore);
        changesAfter.delete(folder);
        return changesAfter;
      });
      readTheProjectsAgain();
    };
    change().then(changeEnded, (rejection: unknown) => {
      projectsSources.sayWhyTheChangeDidNotHappen({ asked_to: askedTo, because: describeBackendRejection(rejection) });
      changeEnded();
    });
  };
  const pendingWordsOf = (card: RecentProjectCardPresentation) => {
    const changeRunning = changesRunningByFolder.get(card.folder);
    return changeRunning === undefined ? null : presentRecentProjectChangePendingWords(changeRunning);
  };
  const moreActionsOf = (card: RecentProjectCardPresentation) => (
    <>
      <MenuItem icon={PanelRight} onChosen={() => setProjectShownInTheDetailsPanel({ kind: "the_project_in", folder: card.folder, isShownOnlyInAWideWindow: false })} data-project-action="details">
        Details
      </MenuItem>
      <MenuItem icon={Pencil} onChosen={() => setProjectToRename({ folder: card.folder, name: card.name })} data-project-action="rename">
        Rename…
      </MenuItem>
      <MenuItem icon={Copy} onChosen={() => changeAProject(card.folder, "duplicate", () => projectsSources.duplicateARecentProject(card.folder))} data-project-action="duplicate">
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
  const coverImageUrlsByFolder = useRecentProjectCoverImages(recentProjects, projectsSources);
  const coverImageUrlOf = (card: RecentProjectCardPresentation) => (card.hasAChosenCover ? (coverImageUrlsByFolder.get(card.folder) ?? null) : null);
  const [projectShownInTheDetailsPanel, setProjectShownInTheDetailsPanel] = useState<ProjectShownInTheDetailsPanel>({ kind: "the_first_project_shown" });
  const cardInTheDetailsPanel =
    projectShownInTheDetailsPanel.kind === "none"
      ? undefined
      : projectShownInTheDetailsPanel.kind === "the_first_project_shown"
        ? cardsShown[0]
        : cardsShown.find((card) => card.folder === projectShownInTheDetailsPanel.folder);
  const keepTheDetailsPanelOn = (folder: string) => {
    if (projectShownInTheDetailsPanel.kind === "the_first_project_shown") setProjectShownInTheDetailsPanel({ kind: "the_project_in", folder, isShownOnlyInAWideWindow: true });
  };
  return (
    <div className="flex min-h-0 flex-1 bg-window text-fg" data-projects="" data-projects-layout={projectsHomeChoices.layout}>
      <SectionNavigationList
        label="Projects"
        sectionGroups={[{ groupLabel: "Projects", sections: [ALL_PROJECTS_SECTION] }]}
        shownSectionId={ALL_PROJECTS_SECTION.section_id}
        onSectionChosen={() => setSearchText("")}
        placement="window"
        width="sidebar"
        dataAttributeOfEachSection="data-projects-section"
        footer={
          <div className="flex items-center gap-2 pl-2">
            <span className="min-w-0 flex-1 truncate text-xs text-fg-3">
              Tato Studio <span>{`v${status.app_version}`}</span>
            </span>
            <IconButton icon={Settings} label="Preferences" tooltip={`Preferences (${shortcutHint(platform, ",")})`} onPressed={commands.openPreferences} data-projects-action="preferences" />
          </div>
        }
      />
      <main className="scrollbar-thin flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-9 pt-8 pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto shrink-0 text-2xl font-semibold whitespace-nowrap">All projects</h1>
          <ExpandingSearchField label="Search projects" placeholder="Search projects" text={searchText} onTextChanged={setSearchText} data-projects-search="" />
          <FieldMenu label={projectsHomeChoicesShown.sortButtonLabel} words={projectsHomeChoicesShown.sortWords} data-projects-sort="">
            <MenuSingleChoiceGroup<ProjectsOrder> closesTheMenuOnChoice
              choices={PROJECTS_ORDERS.map(({ order, words }) => ({ choice: order, label: words }))}
              chosen={projectsHomeChoices.order}
              onChosen={(order) => changeTheProjectsHomeChoices({ order })}
              dataAttributeOfEachChoice="data-projects-sort-choice"
            />
          </FieldMenu>
          <IconButtonMenu icon={PROJECTS_LAYOUT_ICONS[projectsHomeChoices.layout]} label={projectsHomeChoicesShown.viewButtonLabel} data-projects-view="">
            <MenuSingleChoiceGroup<ProjectsLayout> closesTheMenuOnChoice
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-7" role="list" aria-label="Projects">
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
                  coverImageUrl={coverImageUrlOf(card)}
                  isUnreadable={card.isUnreadable}
                  onOpened={() => openTheProject(card.folder)}
                  moreActions={moreActionsOf(card)}
                  moreActionsLabel={card.moreActionsLabel}
                  pendingWords={pendingWordsOf(card)}
                  data-projects-project={card.folder}
                />
              </div>
            ))}
            {searchText.trim() === "" && (
              <div role="listitem" className="flex min-w-0">
                <NewProjectCard onPressed={commands.createAProject} data-projects-action="new-card" />
              </div>
            )}
          </div>
        ) : (
          <div className="@container/projects flex flex-col">
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
                    coverImageUrl={coverImageUrlOf(card)}
                    isUnreadable={card.isUnreadable}
                    onOpened={() => openTheProject(card.folder)}
                    moreActions={moreActionsOf(card)}
                    moreActionsLabel={card.moreActionsLabel}
                    pendingWords={pendingWordsOf(card)}
                    data-projects-project={card.folder}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      {cardInTheDetailsPanel !== undefined && (
        <div className="contents" onFocus={() => keepTheDetailsPanelOn(cardInTheDetailsPanel.folder)}>
          <ProjectDetailsPanelView
            key={cardInTheDetailsPanel.folder}
            card={cardInTheDetailsPanel}
            coverImageUrl={coverImageUrlOf(cardInTheDetailsPanel)}
            projectDetailsSources={projectsSources}
            onTheProjectChanged={readTheProjectsAgain}
            onHidden={() => setProjectShownInTheDetailsPanel({ kind: "none" })}
            isShownOnlyInAWideWindow={projectShownInTheDetailsPanel.kind !== "the_project_in" || projectShownInTheDetailsPanel.isShownOnlyInAWideWindow}
          />
        </div>
      )}
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
            changeAProject(folderToDelete, "delete", () => projectsSources.deleteARecentProject(folderToDelete));
          }
        }}
        confirmDataAttributes={{ "data-project-deletion-action": "confirm" }}
        data-project-deletion-question=""
      />
    </div>
  );
}
