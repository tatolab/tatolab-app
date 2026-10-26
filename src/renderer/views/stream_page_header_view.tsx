import { CodeXml, Copy, Play, Square, SquareTerminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { ActionButton } from "../design_system/action_button";
import { MenuItem, MoreActionsMenu } from "../design_system/menus";
import { PageHeader } from "../design_system/page_header";
import { PageTabs } from "../design_system/page_tabs";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { StreamRunModeWords } from "../design_system/stream_run_mode_words";
import { StreamStateWords } from "../design_system/stream_state_words";
import { shortcutHint } from "../presentation/platform_presentation";
import {
  abbreviateHomeDirectory,
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

/** A stream's header on every tab: where it sits, its name, state, run mode and project, its actions, and its tabs. */
export function StreamPageHeaderView({ stream, shownTab, streamPageActions }: { stream: ListedStream; shownTab: StreamPageTab; streamPageActions: StreamPageActions }) {
  const { backend } = useTatolabWindowEnvironment();
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
      breadcrumb={{ parentLabel: "Streams", parentPath: "/", currentLabel: stream.name }}
      title={stream.name}
      facts={
        <>
          <StreamStateWords stream={stream} isAfterAStopNotRecorded={outcome?.kind === "notice"} />
          <StreamRunModeWords stream={stream} />
          <span className="max-w-[280px] truncate font-mono text-xs text-fg-3 select-text" title={stream.project_directory}>
            {abbreviateHomeDirectory(stream.project_directory)}
          </span>
        </>
      }
      actions={
        <>
          <ActionButton icon={CodeXml} onPressed={() => openTheProject(backend.openStreamProjectFolder(stream.name))} data-stream-action="open_stream_project_folder">
            Open project
          </ActionButton>
          <ActionButton icon={SquareTerminal} onPressed={() => openTheProject(backend.openTerminalAtStreamProject(stream.name))} data-stream-action="open_terminal_at_stream_project">
            Terminal
          </ActionButton>
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
          <ActionButton appearance="quiet" icon={Trash2} isDisabled={actionUnderWay !== undefined} onPressed={askToRemove} data-stream-action="remove_stream">
            Remove
          </ActionButton>
          <MoreActionsMenu label={`More for ${stream.name}`}>
            <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(stream.project_directory)}>
              Copy project folder path
            </MenuItem>
          </MoreActionsMenu>
        </>
      }
      notices={
        <>
          {outcome !== undefined && <StreamActionOutcomeLine outcome={outcome} />}
          {projectOpeningRefusal !== null && <RefusalLine words={projectOpeningRefusal} />}
        </>
      }
      tabs={<StreamPageTabs stream={stream} shownTab={shownTab} />}
      data-stream-page-header=""
    />
  );
}
