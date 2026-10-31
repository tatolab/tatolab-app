import { CodeXml, Copy, RotateCw, SquareTerminal, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { ActionButton } from "../design_system/action_button";
import { InlineLink } from "../design_system/inline_link";
import { MenuItem, MenuSeparator, MoreActionsMenu } from "../design_system/menus";
import { PageBody, PageFrame } from "../design_system/page_frame";
import { PageHeader } from "../design_system/page_header";
import { PageTabs } from "../design_system/page_tabs";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { folderBaseName } from "../presentation/add_stream_flow";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import { presentProjectReload, type ProjectReloadPresentation } from "../presentation/project_page_presentation";
import { abbreviateHomeDirectory } from "../presentation/stream_presentation";
import { isProjectReloadUnderWay } from "../project_reloads_of_the_window";
import { PROJECT_PAGE_TABS, projectPagePath, type ProjectPageTab } from "./project_page_path";
import { StreamActionRefusalLine, useProjectRemovalDialog, useStreamActionsUnderWay, useStreamProjectFolderOpening } from "./stream_action_controls";
import { ProjectLogsPageView } from "./stream_logs_page_view";
import { useStreamRenameDialog } from "./stream_rename_dialog_view";
import { StreamsListRow } from "./streams_list_page_view";
import { useProjectReload, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

const PROJECT_PAGE_TAB_LABELS: Record<ProjectPageTab, string> = { streams: "Streams", logs: "Logs" };

/** The folder a project sits in, home shortened, which its header shows before the project's name. */
function parentFolderWords(projectDirectory: string): string {
  const projectDirectoryWithoutATrailingSlash = projectDirectory.replace(/\/+$/, "");
  const parentDirectory = projectDirectoryWithoutATrailingSlash.slice(0, projectDirectoryWithoutATrailingSlash.lastIndexOf("/"));
  return abbreviateHomeDirectory(parentDirectory === "" ? "/" : parentDirectory);
}

/** What the project's last Reload came to, under its header, with Dismiss; nothing while it is under way. */
function ProjectReloadOutcomeLine({ presentation, onDismissed }: { presentation: ProjectReloadPresentation; onDismissed: () => void }) {
  if (presentation.kind === "under_way") return null;
  const dismissLink = (
    <InlineLink destination={{ onPressed: onDismissed }} tone="quiet" data-project-action="dismiss_reload">
      Dismiss
    </InlineLink>
  );
  if (presentation.kind === "refused") {
    return (
      <div className="flex items-start gap-3" data-project-reload-outcome="refused">
        <RefusalLine lead={presentation.lead} words={presentation.words} />
        <span className="mt-1 text-xs">{dismissLink}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3" data-project-reload-outcome={presentation.tone}>
      {presentation.tone === "warning" ? (
        <RefusalLine tone="warning" lead={`${presentation.heading}.`} words={presentation.detail} />
      ) : (
        <p role="status" className="mt-1 text-xs text-fg-2 select-text">
          {presentation.heading}. {presentation.detail}
        </p>
      )}
      <span className="mt-1 text-xs">{dismissLink}</span>
    </div>
  );
}

/**
 * A project's page: its folder and path, Reload and its other actions in the bar, over its Streams or its whole log.
 * `streamsOfTheProject` are the listing's streams from `projectDirectory`, never none.
 */
export function ProjectPageView({
  projectDirectory,
  streamsOfTheProject,
  shownTab,
}: {
  projectDirectory: string;
  streamsOfTheProject: readonly [ListedStream, ...ListedStream[]];
  shownTab: ProjectPageTab;
}) {
  const { platform, projectReloads } = useTatolabWindowEnvironment();
  const listedStreams = useTatolabStatus().streams;
  const reload = useProjectReload(projectDirectory);
  const { actionsUnderWay, refusalWords, runStreamAction, removeProject } = useStreamActionsUnderWay(streamsOfTheProject);
  const { askToRemoveTheProjectAt, removalDialog } = useProjectRemovalDialog(streamsOfTheProject, removeProject);
  const { askToRename, renameDialog } = useStreamRenameDialog();
  const [firstStream] = streamsOfTheProject;
  const { openProjectFolder, openTerminalAtProject, projectOpeningRefusal } = useStreamProjectFolderOpening(firstStream.stream);
  const projectName = folderBaseName(projectDirectory);
  const reloadPresentation = reload === null ? null : presentProjectReload(projectDirectory, reload, listedStreams);
  const isRemovalUnderWay = streamsOfTheProject.some((stream) => actionsUnderWay.get(stream.stream)?.streamAction === "remove_project");
  const removalRefusal = streamsOfTheProject.map((stream) => refusalWords.get(stream.stream)).find((refusal) => refusal?.chosenActionLabel === "Remove project");

  useEffect(() => () => projectReloads.putAwayTheEndedReloadOf(projectDirectory), [projectReloads, projectDirectory]);

  const hasNotices = (reloadPresentation !== null && reloadPresentation.kind !== "under_way") || projectOpeningRefusal !== null || removalRefusal !== undefined;

  return (
    <PageFrame
      header={
        <PageHeader
          breadcrumb={{ parentLabel: parentFolderWords(projectDirectory) }}
          title={projectName}
          tabs={
            <PageTabs
              label={`${projectName} views`}
              shownTab={shownTab}
              dataAttributeOfEachTab="data-project-tab"
              tabs={PROJECT_PAGE_TABS.map((tab) => ({ tab, label: PROJECT_PAGE_TAB_LABELS[tab], path: projectPagePath(projectDirectory, tab) }))}
            />
          }
          actions={
            <>
              {isRemovalUnderWay ? (
                <PendingActionWords words="Removing…" />
              ) : reloadPresentation?.kind === "under_way" ? (
                <PendingActionWords words={reloadPresentation.words} />
              ) : (
                <ActionButton icon={RotateCw} tooltip={`Load every stream of ${projectName} again`} onPressed={() => projectReloads.reload(projectDirectory)} data-project-action="reload">
                  Reload
                </ActionButton>
              )}
              <MoreActionsMenu label={`More for ${projectName}`} data-project-action="more">
                <MenuItem icon={CodeXml} onChosen={openProjectFolder} data-project-action="open_project_folder">
                  Open project
                </MenuItem>
                <MenuItem icon={SquareTerminal} onChosen={openTerminalAtProject} data-project-action="open_terminal_at_project">
                  Open a terminal in the project
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(projectDirectory)}>
                  Copy project folder path
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Trash2}
                  isDestructive
                  isDisabled={isRemovalUnderWay || isProjectReloadUnderWay(reload)}
                  onChosen={() => askToRemoveTheProjectAt(projectDirectory)}
                  data-project-action="remove_project"
                >
                  Remove project…
                </MenuItem>
              </MoreActionsMenu>
            </>
          }
          notices={
            hasNotices ? (
              <div className="flex flex-col gap-1 border-b py-2">
                {reloadPresentation !== null && <ProjectReloadOutcomeLine presentation={reloadPresentation} onDismissed={() => projectReloads.putAwayTheEndedReloadOf(projectDirectory)} />}
                {removalRefusal !== undefined && <StreamActionRefusalLine refusal={removalRefusal} />}
                {projectOpeningRefusal !== null && <RefusalLine words={projectOpeningRefusal} />}
              </div>
            ) : undefined
          }
          windowDragRegion={windowDragRegionAttribute(platform, "deep")}
          data-project-page-header=""
        />
      }
      data-project-page={projectDirectory}
    >
      {shownTab === "streams" && (
        <PageBody>
          <p className="mb-3 truncate px-2 font-mono text-xs text-fg-3 select-text" title={projectDirectory} data-project-path="">
            {abbreviateHomeDirectory(projectDirectory)}
          </p>
          <ul aria-label={`Streams added from ${projectName}`} className="flex flex-col gap-0.5">
            {streamsOfTheProject.map((stream) => (
              <StreamsListRow
                key={stream.stream}
                stream={stream}
                actionUnderWay={actionsUnderWay.get(stream.stream)}
                refusal={refusalWords.get(stream.stream)}
                onPrimaryAction={(primaryAction) => runStreamAction(primaryAction.streamAction, primaryAction.label, stream)}
                onRemoveProjectAsked={() => askToRemoveTheProjectAt(projectDirectory)}
                onRenameAsked={() => askToRename(stream)}
              />
            ))}
          </ul>
        </PageBody>
      )}
      {shownTab === "logs" && <ProjectLogsPageView projectDirectory={projectDirectory} aStreamOfTheProject={firstStream.stream} />}
      {removalDialog}
      {renameDialog}
    </PageFrame>
  );
}
