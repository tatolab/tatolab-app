import { useEffect, useState } from "react";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SettingsSectionExplanation } from "@tatolab/tato-app-view-sdk/design_system/settings_rows";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { presentRecentProjectCards, type RecentProjectCardPresentation } from "../presentation/projects_presentation";
import { ProjectDetailsFieldsView } from "../studio_shell/project_details_panel_view";
import type { ProjectsSources } from "../studio_shell/projects_view";

/** What Settings' Project section reads the open project from and changes it through, each rejecting in the runtime's own words. */
export type ProjectSettingsSources = Pick<
  ProjectsSources,
  "readRecentProjects" | "readARecentProjectCover" | "renameARecentProject" | "setARecentProjectDescription" | "chooseAProjectCoverImage" | "setARecentProjectCover"
>;

/** The open project as Settings reads it: its card and the image it is shown by, or why it could not be read. */
type OpenProjectSettingsReading =
  | { kind: "reading" }
  | { kind: "read"; card: RecentProjectCardPresentation; coverImageUrl: string | null }
  | { kind: "not_among_the_recent_projects" }
  | { kind: "unread"; because: string };

/** The open project at `projectFolder` read again each time `timesTheProjectChanged` moves on. */
function useOpenProjectSettingsReading(projectFolder: string, projectSettingsSources: ProjectSettingsSources, timesTheProjectChanged: number): OpenProjectSettingsReading {
  const [reading, setReading] = useState<OpenProjectSettingsReading>({ kind: "reading" });
  useEffect(() => {
    let isStillShown = true;
    const readTheOpenProject = async (): Promise<OpenProjectSettingsReading> => {
      const recentProjects = await projectSettingsSources.readRecentProjects();
      const openRecentProject = recentProjects.filter((recentProject) => recentProject.folder === projectFolder);
      const card = presentRecentProjectCards(openRecentProject, Date.now(), "")[0];
      if (card === undefined) return { kind: "not_among_the_recent_projects" };
      const coverImageUrl = card.hasAChosenCover ? await projectSettingsSources.readARecentProjectCover(projectFolder).catch(() => null) : null;
      return { kind: "read", card, coverImageUrl };
    };
    readTheOpenProject().then(
      (readingNow) => isStillShown && setReading(readingNow),
      (rejection: unknown) => isStillShown && setReading({ kind: "unread", because: describeBackendRejection(rejection) }),
    );
    return () => {
      isStillShown = false;
    };
  }, [projectFolder, projectSettingsSources, timesTheProjectChanged]);
  return reading;
}

function OpenProjectSettings({ projectFolder, projectSettingsSources }: { projectFolder: string; projectSettingsSources: ProjectSettingsSources }) {
  const [timesTheProjectChanged, setTimesTheProjectChanged] = useState(0);
  const reading = useOpenProjectSettingsReading(projectFolder, projectSettingsSources, timesTheProjectChanged);
  switch (reading.kind) {
    case "reading":
      return null;
    case "unread":
      return <RefusalLine lead="The project couldn't be read:" words={reading.because} />;
    case "not_among_the_recent_projects":
      return <SettingsSectionExplanation>Studio has no record of the open project among its projects, so it has no details to change.</SettingsSectionExplanation>;
    case "read":
      return (
        <ProjectDetailsFieldsView
          card={reading.card}
          coverImageUrl={reading.coverImageUrl}
          projectDetailsSources={projectSettingsSources}
          onTheProjectChanged={() => setTimesTheProjectChanged((timesBefore) => timesBefore + 1)}
        />
      );
  }
}

/** Settings' Project section: the open project's cover, name and description, as the Projects window's Project details changes them. */
export function ProjectSettingsSectionView({ openProjectFolder, projectSettingsSources }: { openProjectFolder: string | null; projectSettingsSources: ProjectSettingsSources }) {
  if (openProjectFolder === null) return <SettingsSectionExplanation>Open a project to change its name, description and cover.</SettingsSectionExplanation>;
  return (
    <>
      <SettingsSectionExplanation>The name, description and cover the Projects window shows the open project by.</SettingsSectionExplanation>
      <div className="max-w-md" data-project-settings={openProjectFolder}>
        <OpenProjectSettings key={openProjectFolder} projectFolder={openProjectFolder} projectSettingsSources={projectSettingsSources} />
      </div>
    </>
  );
}
