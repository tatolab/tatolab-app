// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { ChevronRight, Copy, FolderOpen, type LucideIcon, Play, Plus, Sparkles, Square, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import mascotImageUrl from "../assets/tato_mascot_3d.png";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { ActionButton } from "../design_system/action_button";
import { EmptyState } from "../design_system/empty_state";
import { IconButton } from "../design_system/icon_button";
import { MenuItem, MenuSeparator, MoreActionsMenu } from "../design_system/menus";
import { PageHeader } from "../design_system/page_header";
import { PendingActionWords } from "../design_system/pending_action_words";
import { SearchField } from "../design_system/search_field";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { StreamRunModeWords } from "../design_system/stream_run_mode_words";
import { StreamStateWords } from "../design_system/stream_state_words";
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
import {
  CommandWithCopyButton,
  StreamActionOutcomeLine,
  useStreamActionsUnderWay,
  useStreamRemovalDialog,
  type StreamActionOutcomeWords,
} from "./stream_action_controls";
import { streamPagePath } from "./stream_page_path";
import { addStreamPagePath } from "./add_stream_page_path";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

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
  if (actionUnderWay !== undefined) return <PendingActionWords words={streamActionPendingWords(actionUnderWay.streamAction)} />;
  return (
    <div className="flex items-center justify-end gap-0.5">
      {primaryAction !== null && (
        <IconButton
          icon={primaryAction.streamAction === "stop_stream" ? Square : Play}
          isIconFilled
          label={primaryAction.meaning}
          onPressed={() => onPrimaryAction(primaryAction)}
          data-stream-action={primaryAction.streamAction}
        />
      )}
      <IconButton
        icon={Workflow}
        label="Open graph"
        disabledReason={isStreamLoaded(stream) ? null : "No graph: the stream is not loaded"}
        onPressed={() => navigate(streamPagePath(stream.name))}
        data-stream-action="open_graph"
      />
      <MoreActionsMenu label={`More for ${stream.name}`} data-stream-action="more">
        <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(stream.project_directory)}>
          Copy project folder path
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={Trash2} isDestructive onChosen={onRemoveAsked} data-stream-action="remove_stream">
          Remove…
        </MenuItem>
      </MoreActionsMenu>
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
          className={cn("block cursor-default truncate rounded-sm font-medium", isLoaded ? "text-fg" : "text-fg-2")}
        >
          {stream.name}
        </Link>
        <ProjectPathCutAtItsStart projectDirectory={stream.project_directory} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex h-[18px] items-center">
          <StreamStateWords stream={stream} isAfterAStopNotRecorded={outcome?.kind === "notice"} />
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
        <StreamRunModeWords stream={stream} />
      </td>
      <td className={cn("px-3 py-2 text-right align-top tabular", isLoaded ? "text-fg-2" : "text-fg-3")}>{streamStepCountLabel(stream)}</td>
      {/* The row navigates on click, and React carries a click in the actions' portalled menu up to it. */}
      <td className="py-1 pr-4 pl-3 align-top" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <StreamRowActions stream={stream} actionUnderWay={actionUnderWay} onPrimaryAction={onPrimaryAction} onRemoveAsked={onRemoveAsked} />
      </td>
    </tr>
  );
}

function FirstStreamChoice({ icon: ChoiceIcon, title, explanation, to }: { icon: LucideIcon; title: string; explanation: string; to: string }) {
  return (
    <Link to={to} className="flex h-16 w-full cursor-default items-center gap-3.5 border-b px-4 text-left transition-colors last:border-b-0 hover:bg-hover">
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
          <FirstStreamChoice icon={Sparkles} title="Create the sample stream" explanation="A sample stream you can edit, made with tatolab new." to={addStreamPagePath("new_project")} />
          <FirstStreamChoice icon={FolderOpen} title="Run a project folder" explanation="Any folder with a stream.py and a .venv." to={addStreamPagePath("project_folder")} />
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
    <SegmentedChoiceControl
      label="Show streams"
      choices={STREAMS_LIST_FILTERS.map(({ filter, label }) => ({
        choice: filter,
        label,
        count: listedStreams.filter((stream) => streamMatchesListFilter(stream, filter)).length,
      }))}
      chosen={chosenFilter}
      onChosen={onFilterChosen}
    />
  );
}

/** The Streams page: every stream `list_streams` reports, each with its state, run mode, steps and actions; or the ways to add a first one when there are none. */
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
      <PageHeader
        title="Streams"
        subtitle={streamsListHeadline(listedStreams, status.machine_name, platform)}
        actions={
          listedStreams.length > 0 ? (
            <>
              <StreamsListFilterControl chosenFilter={chosenFilter} onFilterChosen={setChosenFilter} listedStreams={listedStreams} />
              <SearchField label="Filter streams" placeholder="Filter" text={filterText} onTextChanged={setFilterText} />
              <ActionButton icon={Plus} onPressed={() => navigate(addStreamPagePath("project_folder"))}>
                Add stream
              </ActionButton>
            </>
          ) : undefined
        }
      />

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
          {shownStreams.length === 0 && (
            <div className="border-t">
              <EmptyState title="No streams match." />
            </div>
          )}
        </div>
      )}
      {removalDialog}
    </div>
  );
}
