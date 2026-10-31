import { CodeXml, Copy, FolderOpen, PanelRight, Pencil, Play, Square, SquareTerminal, X } from "lucide-react";
import { useNavigate } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { ActionButton } from "../design_system/action_button";
import { MenuItem, MenuSeparator, MoreActionsMenu } from "../design_system/menus";
import { PageHeader } from "../design_system/page_header";
import { PageTabs } from "../design_system/page_tabs";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import { shortcutHint, windowDragRegionAttribute } from "../presentation/platform_presentation";
import {
  isStreamLoaded,
  listedStreamProjectDirectory,
  presentStreamActionCancel,
  presentStreamPrimaryAction,
  streamActionInTheListingWords,
  streamActionPendingWords,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import type { StreamActionUnderWay } from "../presentation/streams_list_presentation";
import { StreamActionRefusalLine, useStreamProjectFolderOpening, type StreamActionRefusalWords } from "./stream_action_controls";
import { projectPagePath } from "./project_page_path";
import { streamPagePath, type StreamPageTab } from "./stream_page_path";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Each tab's word, and the key held with ⌘ or Ctrl that shows it. */
const STREAM_PAGE_TAB_WORDS: { tab: StreamPageTab; label: string; shortcutKey: string | null }[] = [
  { tab: "overview", label: "Overview", shortcutKey: "3" },
  { tab: "graph", label: "Graph", shortcutKey: "1" },
  { tab: "logs", label: "Logs", shortcutKey: "2" },
  { tab: "inspect", label: "Inspect", shortcutKey: null },
];

function StreamPageTabs({ stream, shownTab }: { stream: ListedStream; shownTab: StreamPageTab }) {
  const { platform } = useTatolabWindowEnvironment();
  const isLoaded = isStreamLoaded(stream);
  return (
    <PageTabs
      label={`${stream.display_name} views`}
      shownTab={shownTab}
      dataAttributeOfEachTab="data-stream-tab"
      tabs={STREAM_PAGE_TAB_WORDS.map(({ tab, label, shortcutKey }) => ({
        tab,
        label,
        path: streamPagePath(stream.stream, tab),
        tooltip: shortcutKey === null ? label : `${label} (${shortcutHint(platform, shortcutKey)})`,
        disabledReason: !isLoaded && tab === "graph" ? "not loaded, so it has no graph" : null,
      }))}
    />
  );
}

/** The stream's actions as its page runs them: the one being asked for, the runtime's last refusal, and how to ask for one. */
export interface StreamPageActions {
  actionUnderWay: StreamActionUnderWay | undefined;
  refusal: StreamActionRefusalWords | undefined;
  runPrimaryAction(chosenAction: StreamPrimaryActionPresentation): void;
  cancelTheListedAction(): void;
  askToRename(): void;
}

/** A stream's bar on every tab: its tabs, Start or Stop, and every other action in its menu; the sidebar shows its name and state. */
export function StreamPageHeaderView({
  stream,
  shownTab,
  streamPageActions,
  overviewDetailsPanel,
}: {
  stream: ListedStream;
  shownTab: StreamPageTab;
  streamPageActions: StreamPageActions;
  /** Whether Overview's Details slide-out is open, and how its toggle opens or closes it. */
  overviewDetailsPanel: { isOpen: boolean; onToggled: (isOpen: boolean) => void };
}) {
  const { platform } = useTatolabWindowEnvironment();
  const { openProjectFolder, openTerminalAtProject, projectOpeningRefusal } = useStreamProjectFolderOpening(stream.stream);
  const navigate = useNavigate();
  const { actionUnderWay, refusal, runPrimaryAction, cancelTheListedAction, askToRename } = streamPageActions;
  const primaryAction = presentStreamPrimaryAction(stream);
  const cancel = presentStreamActionCancel(stream);
  const listedActionWords = streamActionInTheListingWords(stream);
  const projectDirectory = listedStreamProjectDirectory(stream);
  return (
    <PageHeader
      title={stream.display_name}
      isTitleShown={false}
      tabs={<StreamPageTabs stream={stream} shownTab={shownTab} />}
      actions={
        <>
          {actionUnderWay !== undefined ? (
            <PendingActionWords words={streamActionPendingWords(actionUnderWay.streamAction)} />
          ) : listedActionWords !== null ? (
            <>
              <PendingActionWords words={listedActionWords} />
              {cancel !== null && (
                <ActionButton icon={X} tooltip={cancel.meaning} onPressed={cancelTheListedAction} data-stream-action="cancel_stream_action">
                  Cancel
                </ActionButton>
              )}
            </>
          ) : (
            primaryAction !== null && (
              <ActionButton
                appearance={primaryAction.streamAction === "stop_stream" ? "secondary" : "primary"}
                icon={primaryAction.streamAction === "stop_stream" ? Square : Play}
                tooltip={primaryAction.meaning}
                onPressed={() => runPrimaryAction(primaryAction)}
                data-stream-action={primaryAction.streamAction}
              >
                {primaryAction.label}
              </ActionButton>
            )
          )}
          {shownTab === "overview" && (
            <ToggleIconButton
              icon={PanelRight}
              label="Details"
              tooltipWhileOn="Hide details"
              tooltipWhileOff="Show details"
              isOn={overviewDetailsPanel.isOpen}
              onToggled={overviewDetailsPanel.onToggled}
              data-stream-action="details"
            />
          )}
          <MoreActionsMenu label={`More for ${stream.display_name}`} data-stream-action="more">
            <MenuItem icon={Pencil} onChosen={askToRename} data-stream-action="rename_stream">
              Rename…
            </MenuItem>
            {projectDirectory !== null && (
              <>
                <MenuSeparator />
                <MenuItem icon={FolderOpen} onChosen={() => void navigate(projectPagePath(projectDirectory))} data-stream-action="show_project">
                  Show project
                </MenuItem>
                <MenuItem icon={CodeXml} onChosen={openProjectFolder} data-stream-action="open_stream_project_folder">
                  Open project
                </MenuItem>
                <MenuItem icon={SquareTerminal} onChosen={openTerminalAtProject} data-stream-action="open_terminal_at_stream_project">
                  Open a terminal in the project
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(projectDirectory)}>
                  Copy project folder path
                </MenuItem>
              </>
            )}
          </MoreActionsMenu>
        </>
      }
      notices={
        refusal !== undefined || projectOpeningRefusal !== null ? (
          <div className="border-b py-2">
            {refusal !== undefined && <StreamActionRefusalLine refusal={refusal} />}
            {projectOpeningRefusal !== null && <RefusalLine words={projectOpeningRefusal} />}
          </div>
        ) : undefined
      }
      windowDragRegion={windowDragRegionAttribute(platform, "deep")}
      data-stream-page-header=""
    />
  );
}
