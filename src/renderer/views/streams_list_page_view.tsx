import { ChevronRight, Copy, FolderOpen, type LucideIcon, Pencil, Play, Sparkles, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import mascotImageUrl from "../assets/tato_mascot_3d.png";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { EmptyState } from "../design_system/empty_state";
import { IconButton } from "../design_system/icon_button";
import { ListRowButton } from "../design_system/list_row_button";
import { FieldMenu, MenuItem, MenuSeparator, MenuSingleChoiceGroup, MoreActionsMenu } from "../design_system/menus";
import { PageBody, PageFrame } from "../design_system/page_frame";
import { PageHeader } from "../design_system/page_header";
import { PendingActionWords } from "../design_system/pending_action_words";
import { SearchField } from "../design_system/search_field";
import { StreamStateIcon } from "../design_system/stream_state_words";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import {
  abbreviateHomeDirectory,
  listedStreamProjectDirectory,
  presentStreamPrimaryAction,
  presentStreamStateAfterTheLastAction,
  streamActionPendingWords,
  type StreamPrimaryActionPresentation,
} from "../presentation/stream_presentation";
import {
  STREAMS_LIST_FILTERS,
  streamMatchesFilterText,
  streamMatchesListFilter,
  streamProjectFoldersOf,
  streamsListFilterWords,
  type StreamActionUnderWay,
  type StreamsListFilter,
} from "../presentation/streams_list_presentation";
import {
  StreamActionOutcomeLine,
  useStreamActionsUnderWay,
  useStreamRemovalDialog,
  type StreamActionOutcomeWords,
} from "./stream_action_controls";
import { useStreamRenameDialog } from "./stream_rename_dialog_view";
import { StreamRowRightClickMenu } from "./stream_row_right_click_menu";
import { streamPagePath } from "./stream_page_path";
import type { AddStreamSource } from "../presentation/add_stream_flow";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

function StreamRowActions({
  stream,
  actionUnderWay,
  onPrimaryAction,
  onRemoveAsked,
  onRenameAsked,
}: {
  stream: ListedStream;
  actionUnderWay: StreamActionUnderWay | undefined;
  onPrimaryAction: (primaryAction: StreamPrimaryActionPresentation) => void;
  onRemoveAsked: () => void;
  onRenameAsked: () => void;
}) {
  const primaryAction = presentStreamPrimaryAction(stream);
  const projectDirectory = listedStreamProjectDirectory(stream);
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
      <MoreActionsMenu label={`More for ${stream.display_name}`} data-stream-action="more">
        <MenuItem icon={Pencil} onChosen={onRenameAsked} data-stream-action="rename_stream">
          Rename…
        </MenuItem>
        <MenuSeparator />
        {projectDirectory !== null && (
          <>
            <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(projectDirectory)}>
              Copy project folder path
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem icon={Trash2} isDestructive onChosen={onRemoveAsked} data-stream-action="remove_stream">
          Remove…
        </MenuItem>
      </MoreActionsMenu>
    </div>
  );
}

function StreamsListRow({
  stream,
  actionUnderWay,
  outcome,
  onPrimaryAction,
  onRemoveAsked,
  onRenameAsked,
}: {
  stream: ListedStream;
  actionUnderWay: StreamActionUnderWay | undefined;
  outcome: StreamActionOutcomeWords | undefined;
  onPrimaryAction: (primaryAction: StreamPrimaryActionPresentation) => void;
  onRemoveAsked: () => void;
  onRenameAsked: () => void;
}) {
  const navigate = useNavigate();
  const statePresentation = presentStreamStateAfterTheLastAction(stream, outcome?.kind === "notice");
  return (
    <StreamRowRightClickMenu stream={stream} onRenameAsked={onRenameAsked}>
      <li
        data-stream-row={stream.stream}
        onClick={() => {
          // A drag that selects the runtime's words to copy them ends in a click too; it stays on the list.
          if (window.getSelection()?.isCollapsed === false) return;
          navigate(streamPagePath(stream.stream));
        }}
        className="group cursor-default rounded-md py-1.5 pr-1 pl-8 transition-colors hover:bg-hover"
      >
        <div className="flex h-7 min-w-0 items-center gap-3">
          <StreamStateIcon stream={stream} />
          <Link
            to={streamPagePath(stream.stream)}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            aria-label={`${stream.display_name}, ${statePresentation.label}`}
            title={statePresentation.meaning}
            className="min-w-0 shrink truncate rounded-sm text-fg"
          >
            {stream.display_name}
          </Link>
          <span className="flex-1" />
          {/* The row navigates on click, and React carries a click in the actions' portalled menu up to it. */}
          <div className="shrink-0" onClick={(clickEvent) => clickEvent.stopPropagation()}>
            <StreamRowActions stream={stream} actionUnderWay={actionUnderWay} onPrimaryAction={onPrimaryAction} onRemoveAsked={onRemoveAsked} onRenameAsked={onRenameAsked} />
          </div>
        </div>
        {stream.state === "failed" && stream.failed_because !== null && (
          <p className="truncate pl-7 text-xs text-fg-2 select-text" title={stream.failed_because}>
            {stream.failed_because}
          </p>
        )}
        {outcome !== undefined && (
          <div className="pl-7">
            <StreamActionOutcomeLine outcome={outcome} />
          </div>
        )}
      </li>
    </StreamRowRightClickMenu>
  );
}

function FirstStreamChoice({ icon: ChoiceIcon, title, explanation, source }: { icon: LucideIcon; title: string; explanation: string; source: AddStreamSource }) {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  return (
    <ListRowButton
      onPressed={() => addStreamFlow.openDialog(source, false)}
      trailing={<ChevronRight className="size-4 shrink-0 text-fg-4" strokeWidth={1.75} aria-hidden />}
      className="h-16 gap-3.5 rounded-none border-b px-4 text-fg last:border-b-0"
      data-first-stream-choice={source}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-raised">
        <ChoiceIcon className="size-4 text-fg-2" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-fg">{title}</span>
        <span className="block truncate text-xs text-fg-3">{explanation}</span>
      </span>
    </ListRowButton>
  );
}

function NoStreamsYet({ machineWords }: { machineWords: string }) {
  return (
    <div className="flex justify-center pt-[9vh]" data-streams-list-empty="">
      <div className="flex w-[480px] flex-col items-center text-center">
        <img src={mascotImageUrl} alt="" draggable={false} className="size-[120px] object-contain select-none" />
        <h2 className="mt-4 text-lg font-semibold">No streams on {machineWords} yet</h2>
        <p className="mt-1 max-w-md text-fg-3">Projects contain streams. Create one or import your own.</p>
        <div className="mt-6 w-full overflow-hidden rounded-lg border text-left">
          <FirstStreamChoice icon={Sparkles} title="Create the sample stream" explanation="A sample stream you can edit, made with tatolab new." source="new_project" />
          <FirstStreamChoice icon={FolderOpen} title="Import a project" explanation="A project folder of yours." source="project_folder" />
        </div>
      </div>
    </div>
  );
}

function StreamsListStateFilterMenu({
  chosenFilter,
  onFilterChosen,
  listedStreams,
}: {
  chosenFilter: StreamsListFilter;
  onFilterChosen: (filter: StreamsListFilter) => void;
  listedStreams: readonly ListedStream[];
}) {
  const chosenWords = streamsListFilterWords(chosenFilter);
  return (
    <FieldMenu label={`States shown: ${chosenWords}`} words={chosenWords} isNarrowing={chosenFilter !== "all"} data-streams-list-state-filter="">
      <MenuSingleChoiceGroup
        choices={STREAMS_LIST_FILTERS.map(({ filter }) => ({
          choice: filter,
          label: (
            <span className="flex w-full items-center gap-6">
              {streamsListFilterWords(filter)}
              <span className="ml-auto text-fg-3 tabular">{listedStreams.filter((stream) => streamMatchesListFilter(stream, filter)).length}</span>
            </span>
          ),
        }))}
        chosen={chosenFilter}
        onChosen={onFilterChosen}
        dataAttributeOfEachChoice="data-streams-list-state-choice"
      />
    </FieldMenu>
  );
}

/** The All streams page: every stream `list_streams` reports under the project folder it came from, one line each with its state and actions; or the ways to add a first one when there are none. */
export function StreamsListPageView({ listedStreams }: { listedStreams: readonly ListedStream[] }) {
  const { platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const [chosenFilter, setChosenFilter] = useState<StreamsListFilter>("all");
  const [filterText, setFilterText] = useState("");
  const { actionsUnderWay, outcomeWords, runStreamAction } = useStreamActionsUnderWay(listedStreams);
  const { askToRemove, removalDialog } = useStreamRemovalDialog((stream) => runStreamAction("remove_stream", "Remove", stream));
  const { askToRename, renameDialog } = useStreamRenameDialog();
  const shownStreams = listedStreams.filter((stream) => streamMatchesListFilter(stream, chosenFilter) && streamMatchesFilterText(stream, filterText));
  const machineWords = status.machine_name ?? presentPlatform(platform).thisMachineMidSentence;

  return (
    <PageFrame
      header={
        <PageHeader
          title="All streams"
          actions={
            listedStreams.length > 0 ? (
              <>
                <StreamsListStateFilterMenu chosenFilter={chosenFilter} onFilterChosen={setChosenFilter} listedStreams={listedStreams} />
                <SearchField label="Filter streams" placeholder="Filter" text={filterText} onTextChanged={setFilterText} />
              </>
            ) : undefined
          }
          windowDragRegion={windowDragRegionAttribute(platform, "deep")}
        />
      }
      data-streams-list-page=""
    >
      <PageBody>
        {listedStreams.length === 0 ? (
          <NoStreamsYet machineWords={machineWords} />
        ) : (
          <div className="flex flex-col gap-6">
            {streamProjectFoldersOf(shownStreams).map((projectFolder) => (
              <section key={projectFolder.projectDirectory ?? ""} aria-label={projectFolder.folderName} data-streams-list-project-folder={projectFolder.projectDirectory ?? ""}>
                <h2 className="flex h-8 items-center gap-2 px-2 font-normal">
                  <FolderOpen className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
                  <span className="truncate text-fg-2">{projectFolder.folderName}</span>
                  {projectFolder.projectDirectory !== null && (
                    <span className="min-w-0 truncate font-mono text-xs text-fg-3 select-text">{abbreviateHomeDirectory(projectFolder.projectDirectory)}</span>
                  )}
                </h2>
                <ul aria-label={`Streams added from ${projectFolder.folderName}`} className="flex flex-col gap-0.5">
                  {projectFolder.streams.map((stream) => (
                    <StreamsListRow
                      key={stream.stream}
                      stream={stream}
                      actionUnderWay={actionsUnderWay.get(stream.stream)}
                      outcome={outcomeWords.get(stream.stream)}
                      onPrimaryAction={(primaryAction) => runStreamAction(primaryAction.streamAction, primaryAction.label, stream)}
                      onRemoveAsked={() => askToRemove(stream)}
                      onRenameAsked={() => askToRename(stream)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {shownStreams.length === 0 && <EmptyState title="No streams match." />}
          </div>
        )}
      </PageBody>
      {removalDialog}
      {renameDialog}
    </PageFrame>
  );
}
