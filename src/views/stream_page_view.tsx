// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, CodeXml, Copy, Ellipsis, LoaderCircle, Play, Square, SquareTerminal, SquareX, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import type { StreamActionUnderWay } from "../presentation/streams_list_presentation";
import { writeTextToClipboard } from "../clipboard";
import { shortcutHint } from "../presentation/platform_presentation";
import {
  abbreviateHomeDirectory,
  isStreamLoaded,
  presentStreamPrimaryAction,
  streamActionPendingWords,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./shadcn/dropdown_menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import {
  StreamActionOutcomeLine,
  StreamRunModeWord,
  StreamStateWord,
  useStreamActionsUnderWay,
  useStreamRemovalDialog,
  type StreamActionOutcomeWords,
} from "./stream_action_controls";
import { StreamInspectPageView } from "./stream_inspect_page_view";
import { StreamOverviewPageView } from "./stream_overview_page_view";
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
    <nav aria-label={`${stream.name} views`} className="mt-2 -mb-px flex gap-4">
      {STREAM_PAGE_TAB_WORDS.map(({ tab, label, shortcutKey }) => {
        const tabClassName = "flex h-9 items-center border-b-2 border-transparent";
        if (!isLoaded && (tab === "graph" || tab === "logs")) {
          return (
            <span key={tab} aria-disabled title={`${label}: not loaded, so it has no ${tab === "graph" ? "graph" : "logs"}`} className={joinClassNames(tabClassName, "cursor-default text-fg-4")}>
              {label}
            </span>
          );
        }
        return (
          <Link
            key={tab}
            to={streamPagePath(stream.name, tab)}
            data-stream-tab={tab}
            aria-current={tab === shownTab ? "page" : undefined}
            title={shortcutKey === null ? label : `${label} (${shortcutHint(platform, shortcutKey)})`}
            className={joinClassNames(tabClassName, "cursor-default transition-colors", tab === shownTab ? "border-fg text-fg" : "text-fg-3 hover:text-fg")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The stream's actions as its page runs them: the one under way, what the runtime last said, and how to run one. */
export interface StreamPageActions {
  actionUnderWay: StreamActionUnderWay | undefined;
  outcome: StreamActionOutcomeWords | undefined;
  runPrimaryAction(chosenAction: StreamPrimaryActionPresentation): void;
  askToRemove(): void;
}

function StreamPageHeaderView({ stream, shownTab, streamPageActions }: { stream: ListedStream; shownTab: StreamPageTab; streamPageActions: StreamPageActions }) {
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
    <header className="shrink-0 border-b px-5 pt-3" data-stream-page-header="">
      <div className="flex items-center gap-1 text-xs text-fg-3">
        <Link to="/" className="cursor-default hover:text-fg">
          Streams
        </Link>
        <ChevronRight className="size-3" strokeWidth={1.75} aria-hidden />
        <span className="truncate text-fg-2">{stream.name}</span>
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-4">
        <h1 className="title-lg min-w-0 shrink truncate select-text">{stream.name}</h1>
        <div className="flex min-w-0 items-center gap-4">
          <StreamStateWord stream={stream} isAfterAStopNotRecorded={outcome?.kind === "notice"} />
          <StreamRunModeWord stream={stream} />
          <span className="truncate font-mono text-xs text-fg-3 select-text" title={stream.project_directory}>
            {abbreviateHomeDirectory(stream.project_directory)}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button variant="outline" data-stream-action="open_stream_project_folder" onClick={() => openTheProject(backend.openStreamProjectFolder(stream.name))}>
            <CodeXml aria-hidden /> Open project
          </Button>
          <Button variant="outline" data-stream-action="open_terminal_at_stream_project" onClick={() => openTheProject(backend.openTerminalAtStreamProject(stream.name))}>
            <SquareTerminal aria-hidden /> Terminal
          </Button>
          {actionUnderWay !== undefined ? (
            <span className="inline-flex h-7 items-center gap-1.5 px-1 text-fg-3" role="status">
              <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
              {streamActionPendingWords(actionUnderWay.streamAction)}
            </span>
          ) : (
            primaryAction !== null && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={primaryAction.streamAction === "stop_stream" ? "outline" : "default"}
                      data-stream-action={primaryAction.streamAction}
                      onClick={() => runPrimaryAction(primaryAction)}
                    />
                  }
                >
                  {primaryAction.streamAction === "stop_stream" ? <Square aria-hidden /> : <Play aria-hidden />} {primaryAction.label}
                </TooltipTrigger>
                <TooltipContent className="max-w-60">{primaryAction.meaning}</TooltipContent>
              </Tooltip>
            )
          )}
          <Button variant="ghost" data-stream-action="remove_stream" onClick={askToRemove} disabled={actionUnderWay !== undefined}>
            <Trash2 aria-hidden /> Remove
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More for ${stream.name}`}
              className="grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-selected data-popup-open:text-fg"
            >
              <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => void writeTextToClipboard(stream.project_directory)}>
                <Copy /> Copy project folder path
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {outcome !== undefined && <StreamActionOutcomeLine outcome={outcome} />}
      {projectOpeningRefusal !== null && (
        <p role="alert" className="mt-1 flex max-w-[640px] gap-1.5 text-xs text-fg-2">
          <SquareX className="mt-px size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
          <span className="select-text">{projectOpeningRefusal}</span>
        </p>
      )}
      <StreamPageTabs stream={stream} shownTab={shownTab} />
    </header>
  );
}

/**
 * One stream's page: its header and tabs over the tab shown. Overview and Inspect are drawn here; Graph and Logs are
 * the hosted DOM workspace, kept mounted while another tab shows so its log follower keeps naming the stream's load.
 */
export function StreamPageView({ stream, shownTab }: { stream: ListedStream; shownTab: StreamPageTab }) {
  const { hostedPages, streamGraphReadings } = useTatolabWindowEnvironment();
  const isLoaded = isStreamLoaded(stream);
  const isWorkspaceTab = shownTab === "graph" || shownTab === "logs";
  const thisStreamsListing = useMemo(() => [stream], [stream]);
  const { actionsUnderWay, outcomeWords, runStreamAction } = useStreamActionsUnderWay(thisStreamsListing);
  const { askToRemove, removalDialog } = useStreamRemovalDialog((streamToRemove) => runStreamAction("remove_stream", "Remove", streamToRemove));
  const streamPageActions: StreamPageActions = {
    actionUnderWay: actionsUnderWay.get(stream.name),
    outcome: outcomeWords.get(stream.name),
    runPrimaryAction: (chosenAction) => runStreamAction(chosenAction.streamAction, chosenAction.label, stream),
    askToRemove: () => askToRemove(stream),
  };

  useEffect(() => {
    hostedPages.streamsPage.chooseStream(stream.name);
  }, [hostedPages, stream]);
  useEffect(() => {
    if (shownTab === "graph" || shownTab === "logs") hostedPages.streamsPage.showTab(shownTab);
  }, [hostedPages, shownTab, isLoaded]);
  useEffect(() => {
    streamGraphReadings.showStream(stream.name, isLoaded);
  }, [streamGraphReadings, stream.name, isLoaded]);
  useEffect(() => () => streamGraphReadings.showStream(null, false), [streamGraphReadings]);

  if (isWorkspaceTab && !isLoaded) return <Navigate to={streamPagePath(stream.name)} replace />;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stream-page={stream.name}>
      <StreamPageHeaderView stream={stream} shownTab={shownTab} streamPageActions={streamPageActions} />
      <div className={joinClassNames("min-h-0 flex-1 flex-col", isWorkspaceTab ? "flex" : "hidden")}>
        <HostedDomPageView hostedPage={hostedPages.streamsPage} />
      </div>
      {shownTab === "overview" && <StreamOverviewPageView stream={stream} streamPageActions={streamPageActions} />}
      {shownTab === "inspect" && <StreamInspectPageView stream={stream} />}
      {removalDialog}
    </div>
  );
}
