import { CodeXml, Copy, PanelRight, Play, Square, SquareTerminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
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
  presentStreamPrimaryAction,
  streamActionPendingWords,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import type { StreamActionUnderWay } from "../presentation/streams_list_presentation";
import { StreamActionOutcomeLine, type StreamActionOutcomeWords } from "./stream_action_controls";
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
      label={`${stream.name} views`}
      shownTab={shownTab}
      dataAttributeOfEachTab="data-stream-tab"
      tabs={STREAM_PAGE_TAB_WORDS.map(({ tab, label, shortcutKey }) => ({
        tab,
        label,
        path: streamPagePath(stream.name, tab),
        tooltip: shortcutKey === null ? label : `${label} (${shortcutHint(platform, shortcutKey)})`,
        disabledReason: !isLoaded && tab === "graph" ? "not loaded, so it has no graph" : null,
      }))}
    />
  );
}

/** The stream's actions as its page runs them: the one under way, what the runtime last said, and how to run one. */
export interface StreamPageActions {
  actionUnderWay: StreamActionUnderWay | undefined;
  outcome: StreamActionOutcomeWords | undefined;
  runPrimaryAction(chosenAction: StreamPrimaryActionPresentation): void;
  askToRemove(): void;
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
  const { backend, platform } = useTatolabWindowEnvironment();
  /** Why the project folder or a terminal in it did not open, in the words of what refused it, which name what failed. */
  const [projectOpeningRefusal, setProjectOpeningRefusal] = useState<string | null>(null);
  const { actionUnderWay, outcome, runPrimaryAction, askToRemove } = streamPageActions;
  const primaryAction = presentStreamPrimaryAction(stream);
  const openTheProject = (opening: Promise<void>) => {
    setProjectOpeningRefusal(null);
    opening.catch((rejection: unknown) => setProjectOpeningRefusal(describeBackendRejection(rejection)));
  };
  return (
    <PageHeader
      title={stream.name}
      isTitleShown={false}
      tabs={<StreamPageTabs stream={stream} shownTab={shownTab} />}
      actions={
        <>
          {actionUnderWay !== undefined ? (
            <PendingActionWords words={streamActionPendingWords(actionUnderWay.streamAction)} />
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
          <MoreActionsMenu label={`More for ${stream.name}`} data-stream-action="more">
            <MenuItem icon={CodeXml} onChosen={() => openTheProject(backend.openStreamProjectFolder(stream.name))} data-stream-action="open_stream_project_folder">
              Open project
            </MenuItem>
            <MenuItem icon={SquareTerminal} onChosen={() => openTheProject(backend.openTerminalAtStreamProject(stream.name))} data-stream-action="open_terminal_at_stream_project">
              Open a terminal in the project
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(stream.project_directory)}>
              Copy project folder path
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} isDestructive isDisabled={actionUnderWay !== undefined} onChosen={askToRemove} data-stream-action="remove_stream">
              Remove…
            </MenuItem>
          </MoreActionsMenu>
        </>
      }
      notices={
        outcome !== undefined || projectOpeningRefusal !== null ? (
          <div className="border-b py-2">
            {outcome !== undefined && <StreamActionOutcomeLine outcome={outcome} />}
            {projectOpeningRefusal !== null && <RefusalLine words={projectOpeningRefusal} />}
          </div>
        ) : undefined
      }
      windowDragRegion={windowDragRegionAttribute(platform, "deep")}
      data-stream-page-header=""
    />
  );
}
