// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, Copy, Ellipsis, FolderOpen, LoaderCircle, type LucideIcon, Play, Plus, Search, Sparkles, Square, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import mascotImageUrl from "../assets/tato_mascot_3d.png";
import type { ListedStream, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { presentPlatform } from "../presentation/platform_presentation";
import {
  abbreviateHomeDirectory,
  isStreamLoaded,
  presentStreamPrimaryAction,
  streamActionPendingWords,
  streamStepCountLabel,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import {
  STREAMS_LIST_FILTERS,
  streamMatchesFilterText,
  streamMatchesListFilter,
  streamsListHeadline,
  type StreamActionUnderWay,
  type StreamsListFilter,
} from "../presentation/streams_list_presentation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./shadcn/dropdown_menu";
import { joinClassNames } from "./shadcn/class_names";
import { Button } from "./shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import {
  CommandWithCopyButton,
  StreamActionOutcomeLine,
  StreamRunModeWord,
  StreamStateWord,
  useStreamActionsUnderWay,
  useStreamRemovalDialog,
  type StreamActionOutcomeWords,
} from "./stream_action_controls";
import { streamPagePath } from "./stream_page_path";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

function StreamRowIconButton({
  icon: ButtonIcon,
  label,
  onPress,
  disabledReason,
  isFilled,
  streamActionName,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabledReason: string | null;
  isFilled?: boolean;
  streamActionName: TatolabStreamActionName | "open_graph";
}) {
  const isDisabled = disabledReason !== null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={isDisabled ? `${label}: ${disabledReason}` : label}
            aria-disabled={isDisabled}
            data-stream-action={streamActionName}
            onClick={() => {
              if (!isDisabled) onPress();
            }}
            className={joinClassNames(
              "grid size-7 place-items-center rounded-md transition-colors",
              isDisabled ? "cursor-default text-fg-4" : "text-fg-3 hover:bg-hover hover:text-fg",
            )}
          />
        }
      >
        <ButtonIcon className={isFilled ? "size-3 fill-current" : "size-4"} strokeWidth={1.75} aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{disabledReason ?? label}</TooltipContent>
    </Tooltip>
  );
}

function StreamRowActions({
  stream,
  actionUnderWay,
  onPrimaryAction,
  onRemoveAsked,
}: {
  stream: ListedStream;
  actionUnderWay: StreamActionUnderWay | undefined;
  onPrimaryAction: (primaryAction: StreamPrimaryActionPresentation) => void;
  onRemoveAsked: () => void;
}) {
  const navigate = useNavigate();
  const primaryAction = presentStreamPrimaryAction(stream);
  if (actionUnderWay !== undefined) {
    return (
      <span className="inline-flex h-7 items-center justify-end gap-1.5 pr-1 text-fg-3" role="status">
        <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
        {streamActionPendingWords(actionUnderWay.streamAction)}
      </span>
    );
  }
  return (
    <div className="flex items-center justify-end gap-0.5">
      {primaryAction !== null && (
        <StreamRowIconButton
          icon={primaryAction.streamAction === "stop_stream" ? Square : Play}
          isFilled
          label={primaryAction.meaning}
          disabledReason={null}
          streamActionName={primaryAction.streamAction}
          onPress={() => onPrimaryAction(primaryAction)}
        />
      )}
      <StreamRowIconButton
        icon={Workflow}
        label="Open graph"
        disabledReason={isStreamLoaded(stream) ? null : "No graph: the stream is not loaded"}
        streamActionName="open_graph"
        onPress={() => navigate(streamPagePath(stream.name))}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More for ${stream.name}`}
          data-stream-action="more"
          className="grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-selected data-popup-open:text-fg"
        >
          <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => void writeTextToClipboard(stream.project_directory)}>
            <Copy /> Copy project folder path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" data-stream-action="remove_stream" onClick={onRemoveAsked}>
            <Trash2 /> Remove…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A project path cut at its start, so the folder that tells streams apart stays in view. */
function ProjectPathCutAtItsStart({ projectDirectory }: { projectDirectory: string }) {
  return (
    <div className="truncate text-left font-mono text-xs text-fg-3 [direction:rtl]" title={projectDirectory}>
      <bdi>{abbreviateHomeDirectory(projectDirectory)}</bdi>
    </div>
  );
}

function StreamsListRow({
  stream,
  actionUnderWay,
  outcome,
  onPrimaryAction,
  onRemoveAsked,
}: {
  stream: ListedStream;
  actionUnderWay: StreamActionUnderWay | undefined;
  outcome: StreamActionOutcomeWords | undefined;
  onPrimaryAction: (primaryAction: StreamPrimaryActionPresentation) => void;
  onRemoveAsked: () => void;
}) {
  const navigate = useNavigate();
  const isLoaded = isStreamLoaded(stream);
  return (
    <tr
      data-stream-row={stream.name}
      onClick={() => {
        // A drag that selects the runtime's words to copy them ends in a click too; it stays on the list.
        if (window.getSelection()?.isCollapsed === false) return;
        navigate(streamPagePath(stream.name));
      }}
      className="group cursor-default border-b transition-colors last:border-b-0 hover:bg-hover"
    >
      <td className="py-2 pr-3 pl-5 align-top">
        <Link
          to={streamPagePath(stream.name)}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
          className={joinClassNames("block cursor-default truncate rounded-sm font-medium", isLoaded ? "text-fg" : "text-fg-2")}
        >
          {stream.name}
        </Link>
        <ProjectPathCutAtItsStart projectDirectory={stream.project_directory} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex h-[18px] items-center">
          <StreamStateWord stream={stream} isAfterAStopNotRecorded={outcome?.kind === "notice"} />
        </div>
        {stream.state === "failed" && stream.failed_because !== null && (
          <p className="line-clamp-2 max-w-[440px] pl-5 text-xs text-fg-2 select-text" title={stream.failed_because}>
            {stream.failed_because}
          </p>
        )}
        {outcome !== undefined && <StreamActionOutcomeLine outcome={outcome} />}
      </td>
      {/* The run mode's tooltip button takes Enter and Space, which click it; the click stays out of the row's. */}
      <td className="px-3 py-2 align-top" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <StreamRunModeWord stream={stream} />
      </td>
      <td className={joinClassNames("px-3 py-2 text-right align-top tabular", isLoaded ? "text-fg-2" : "text-fg-3")}>{streamStepCountLabel(stream)}</td>
      {/* The row navigates on click, and React carries a click in the actions' portalled menu up to it. */}
      <td className="py-1 pr-4 pl-3 align-top" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <StreamRowActions stream={stream} actionUnderWay={actionUnderWay} onPrimaryAction={onPrimaryAction} onRemoveAsked={onRemoveAsked} />
      </td>
    </tr>
  );
}

function FirstStreamChoice({ icon: ChoiceIcon, title, explanation }: { icon: LucideIcon; title: string; explanation: string }) {
  return (
    <Link to="/add-stream" className="flex h-16 w-full cursor-default items-center gap-3.5 border-b px-4 text-left transition-colors last:border-b-0 hover:bg-hover">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-raised">
        <ChoiceIcon className="size-4 text-fg-2" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-fg">{title}</span>
        <span className="block truncate text-xs text-fg-3">{explanation}</span>
      </span>
      <ChevronRight className="size-4 text-fg-4" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

function NoStreamsYet({ machineWords }: { machineWords: string }) {
  return (
    <div className="flex flex-1 items-start justify-center border-t px-5 pt-[9vh] pb-16" data-streams-list-empty="">
      <div className="flex w-[480px] flex-col items-center text-center">
        <img src={mascotImageUrl} alt="" draggable={false} className="size-[120px] object-contain select-none" />
        <h2 className="mt-4 text-lg font-semibold">No streams on {machineWords} yet</h2>
        <p className="mt-1 max-w-md text-fg-3">A stream is a Python project with a stream.py. The runtime compiles it, loads its graph and keeps it running.</p>
        <div className="mt-6 w-full overflow-hidden rounded-lg border text-left">
          <FirstStreamChoice icon={Sparkles} title="Create the sample stream" explanation="A sample stream you can edit, made with tatolab new." />
          <FirstStreamChoice icon={FolderOpen} title="Run a project folder" explanation="Any folder with a stream.py and a .venv." />
        </div>
        <div className="mt-6 w-full text-left">
          <div className="mb-1.5 text-xs text-fg-3">Or in a terminal, from a project folder, to reload on every save:</div>
          <CommandWithCopyButton command="tatolab dev" />
        </div>
      </div>
    </div>
  );
}

function StreamsListFilterControl({
  chosenFilter,
  onFilterChosen,
  listedStreams,
}: {
  chosenFilter: StreamsListFilter;
  onFilterChosen: (filter: StreamsListFilter) => void;
  listedStreams: readonly ListedStream[];
}) {
  return (
    <div className="flex h-7 shrink-0 items-center rounded-md bg-well p-0.5" role="radiogroup" aria-label="Show streams">
      {STREAMS_LIST_FILTERS.map(({ filter, label }) => (
        <button
          key={filter}
          type="button"
          role="radio"
          aria-checked={chosenFilter === filter}
          onClick={() => onFilterChosen(filter)}
          className={joinClassNames(
            "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap text-fg-2 transition-colors hover:text-fg",
            chosenFilter === filter && "bg-raised text-fg shadow-(--shadow-segment)",
          )}
        >
          {label}
          <span className="text-fg-2 tabular">{listedStreams.filter((stream) => streamMatchesListFilter(stream, filter)).length}</span>
        </button>
      ))}
    </div>
  );
}

/** The Streams page: every stream `list_streams` reports, each with its state, run mode, steps and actions; or the first-stream guide when there are none. */
export function StreamsListPageView({ listedStreams }: { listedStreams: readonly ListedStream[] }) {
  const { platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const navigate = useNavigate();
  const [chosenFilter, setChosenFilter] = useState<StreamsListFilter>("all");
  const [filterText, setFilterText] = useState("");
  const { actionsUnderWay, outcomeWords, runStreamAction } = useStreamActionsUnderWay(listedStreams);
  const { askToRemove, removalDialog } = useStreamRemovalDialog((stream) => runStreamAction("remove_stream", "Remove", stream));
  const shownStreams = listedStreams.filter((stream) => streamMatchesListFilter(stream, chosenFilter) && streamMatchesFilterText(stream, filterText));
  const machineWords = status.machine_name ?? presentPlatform(platform).thisMachineMidSentence;

  return (
    <div className="flex min-h-full flex-col" data-streams-list-page="">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="shrink-0">
          <h1 className="title-lg">Streams</h1>
          <p className="text-fg-3">{streamsListHeadline(listedStreams, status.machine_name, platform)}</p>
        </div>
        {listedStreams.length > 0 && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <StreamsListFilterControl chosenFilter={chosenFilter} onFilterChosen={setChosenFilter} listedStreams={listedStreams} />
            <label className="flex h-7 w-52 min-w-24 shrink items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
              <Search className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
              <input
                value={filterText}
                onChange={(changeEvent) => setFilterText(changeEvent.target.value)}
                placeholder="Filter"
                aria-label="Filter streams"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
              />
            </label>
            <Button variant="outline" onClick={() => navigate("/add-stream")}>
              <Plus aria-hidden /> Add stream
            </Button>
          </div>
        )}
      </div>

      {listedStreams.length === 0 ? (
        <NoStreamsYet machineWords={machineWords} />
      ) : (
        <div className="border-t">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-8 w-[34%] pr-3 pl-5 font-normal">Name</th>
                <th className="px-3 font-normal">Status</th>
                <th className="w-[150px] px-3 font-normal">Run mode</th>
                <th className="w-[72px] px-3 text-right font-normal">Steps</th>
                <th className="w-[132px] pr-4 pl-3 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shownStreams.map((stream) => (
                <StreamsListRow
                  key={stream.name}
                  stream={stream}
                  actionUnderWay={actionsUnderWay.get(stream.name)}
                  outcome={outcomeWords.get(stream.name)}
                  onPrimaryAction={(primaryAction) => runStreamAction(primaryAction.streamAction, primaryAction.label, stream)}
                  onRemoveAsked={() => askToRemove(stream)}
                />
              ))}
            </tbody>
          </table>
          {shownStreams.length === 0 && <div className="border-t px-5 py-10 text-center text-fg-3">No streams match.</div>}
        </div>
      )}
      {removalDialog}
    </div>
  );
}
