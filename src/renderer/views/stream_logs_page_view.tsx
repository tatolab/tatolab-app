import { cn } from "cn";
import { ArrowDownToLine, Ban, Copy, FileText, FolderOpen, ListFilter, RotateCw, ScrollText, SquareX } from "lucide-react";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { writeTextToClipboard } from "../clipboard";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import {
  earlierRecordsNotHeldWords,
  isEarlierRecordsPointerShown,
  jsonlOfStreamLogRows,
  logFolderPathOfStream,
  presentStreamLog,
  presentStreamLogRecordDetails,
  presentStreamLogsOfAStreamNotLoaded,
  searchMatchRangesOf,
  type StreamLogLevelFilter,
  type StreamLogLevelFilterChoice,
  type StreamLogMessageLinePartKind,
  type StreamLogPresentation,
  type StreamLogRow,
} from "../presentation/log_record_presentation";
import { presentWindowShortcut } from "../presentation/platform_presentation";
import { isStreamLoaded, listedStreamProjectDirectory, presentStreamPrimaryAction } from "../presentation/stream_presentation";
import { ActionButton } from "../design_system/action_button";
import { EmptyState } from "../design_system/empty_state";
import { InlineLink } from "../design_system/inline_link";
import { FieldMenu, MenuCheckboxItem, MenuGroup, MenuItem, MenuSeparator, MoreActionsMenu } from "../design_system/menus";
import { RefusalLine } from "../design_system/refusal_line";
import { SearchField } from "../design_system/search_field";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { WorkAreaWithSidePanel } from "../design_system/side_panel";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import { Toolbar, ToolbarGroup } from "../design_system/toolbar";
import { LOG_LEVEL_WORD_TONE_CLASS_NAMES, StreamLogRecordDetailsView } from "./stream_log_record_details_view";
import type { StreamPageActions } from "./stream_page_header_view";
import { logViewAskedBy, streamPagePath } from "./stream_page_path";
import { useStreamGraphReading, useStreamLogReading, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Scrolled within this many pixels of the end, the list keeps following new records. */
const FOLLOW_TAIL_DISTANCE_PIXELS = 8;

/** The id of a record's row, which the list names as its active descendant. */
function streamLogRowElementId(sequence: number): string {
  return `stream-log-record-${sequence}`;
}

/** A run of a row's text in its colour. */
interface StyledTextRun {
  text: string;
  className: string;
}

/** `styledRuns` in their colours, each match of `searchText` marked, a match that spans runs included. */
function TextWithSearchMatches({ styledRuns, searchText }: { styledRuns: readonly StyledTextRun[]; searchText: string }) {
  const matchRanges = searchMatchRangesOf(styledRuns.map((styledRun) => styledRun.text).join(""), searchText);
  const parts: ReactNode[] = [];
  let runStart = 0;
  for (const [runIndex, styledRun] of styledRuns.entries()) {
    const runEnd = runStart + styledRun.text.length;
    // Cut the run at every match edge inside it, marking the pieces a match covers.
    const cutPoints = [runStart, ...matchRanges.flat().filter((edge) => edge > runStart && edge < runEnd), runEnd];
    for (let cutIndex = 0; cutIndex < cutPoints.length - 1; cutIndex++) {
      const pieceStart = cutPoints[cutIndex] ?? runStart;
      const pieceEnd = cutPoints[cutIndex + 1] ?? runEnd;
      if (pieceEnd === pieceStart) continue;
      const pieceText = styledRun.text.slice(pieceStart - runStart, pieceEnd - runStart);
      const isMatched = matchRanges.some(([matchStart, matchEnd]) => pieceStart >= matchStart && pieceEnd <= matchEnd);
      parts.push(
        isMatched ? (
          <mark key={`${runIndex}:${pieceStart}`} className="rounded-[2px] bg-brand-soft text-fg ring-1 ring-brand/40">
            {pieceText}
          </mark>
        ) : (
          <span key={`${runIndex}:${pieceStart}`} className={styledRun.className}>
            {pieceText}
          </span>
        ),
      );
    }
    runStart = runEnd;
  }
  return <>{parts}</>;
}

const MESSAGE_LINE_PART_CLASS_NAMES: Record<StreamLogMessageLinePartKind, string> = {
  message: "text-fg",
  separator: "",
  field_key: "text-fg-3",
  field_value: "text-fg-2",
};

interface StreamLogRowViewProps {
  row: StreamLogRow;
  isSelected: boolean;
  areTimestampsShown: boolean;
  areLinesWrapped: boolean;
  searchText: string;
  onSelected: (sequence: number) => void;
}

/** One record's row: its time, level word, step, message and fields. Each poll makes new row objects, so a row redraws only when what it shows changed. */
const StreamLogRowView = memo(
  function StreamLogRowView({ row, isSelected, areTimestampsShown, areLinesWrapped, searchText, onSelected }: StreamLogRowViewProps) {
    return (
      <>
        {row.dayDividerWords !== null && (
          <div className="flex items-center gap-3 px-3 pt-2 pb-1 font-sans" aria-hidden>
            <span className="label-caps">{row.dayDividerWords}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
        <div
          id={streamLogRowElementId(row.record.sequence)}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onSelected(row.record.sequence)}
          data-stream-log-record={row.record.sequence}
          data-stream-log-level-tone={row.levelTone}
          className={cn(
            "grid cursor-default gap-x-3 px-3 hover:bg-hover",
            areTimestampsShown ? "grid-cols-[92px_44px_120px_minmax(0,1fr)]" : "grid-cols-[44px_120px_minmax(0,1fr)]",
            !areLinesWrapped && "whitespace-nowrap",
            // The quietest text falls under AA on the selected background in light, so it reads one step stronger there.
            isSelected && "bg-selected shadow-[inset_2px_0_0_var(--brand)] hover:bg-selected [&_.text-fg-3]:text-fg-2",
          )}
        >
          {areTimestampsShown && (
            <span className="text-fg-3 tabular" title={row.dateAndTimeText}>
              {row.timeText}
            </span>
          )}
          <span className={LOG_LEVEL_WORD_TONE_CLASS_NAMES[row.levelTone]}>{row.levelWord}</span>
          <span className="truncate" title={row.step.stepName}>
            <TextWithSearchMatches styledRuns={[{ text: row.step.stepName, className: row.step.isAStepOfTheGraph ? "text-fg-2" : "text-fg-3" }]} searchText={searchText} />
          </span>
          <div className={cn("min-w-0", areLinesWrapped ? "break-words whitespace-pre-wrap" : "truncate")}>
            <TextWithSearchMatches
              styledRuns={row.messageLineParts.map((part) => ({ text: part.text, className: MESSAGE_LINE_PART_CLASS_NAMES[part.kind] }))}
              searchText={searchText}
            />
          </div>
        </div>
      </>
    );
  },
  // Every field of a row but its step and day divider is drawn from its record alone (`rowOfLogRecord`), so those three decide whether it redraws.
  (previousProps, nextProps) =>
    previousProps.row.record === nextProps.row.record &&
    previousProps.row.step.stepName === nextProps.row.step.stepName &&
    previousProps.row.step.isAStepOfTheGraph === nextProps.row.step.isAStepOfTheGraph &&
    previousProps.row.dayDividerWords === nextProps.row.dayDividerWords &&
    previousProps.isSelected === nextProps.isSelected &&
    previousProps.areTimestampsShown === nextProps.areTimestampsShown &&
    previousProps.areLinesWrapped === nextProps.areLinesWrapped &&
    previousProps.searchText === nextProps.searchText &&
    previousProps.onSelected === nextProps.onSelected,
);

const LEVEL_FILTER_LABEL_TONE_CLASS_NAMES: Record<StreamLogLevelFilterChoice["labelTone"], string | undefined> = {
  plain: undefined,
  warn: "text-warn-text",
  error: "text-danger-text",
};

function StreamLogStepFilterControl({
  streamLog,
  shownStepKeys,
  onShownStepKeysChosen,
}: {
  streamLog: StreamLogPresentation;
  shownStepKeys: ReadonlySet<string>;
  onShownStepKeysChosen: (shownStepKeys: ReadonlySet<string>) => void;
}) {
  const { stepChoices, stepFilterWords } = streamLog;
  return (
    <FieldMenu
      label={`Nodes shown: ${stepFilterWords.words}`}
      leading={<ListFilter className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />}
      words={<span className={cn("max-w-36 truncate", stepFilterWords.isOneStepChosen && "font-mono text-xs")}>{stepFilterWords.words}</span>}
      isNarrowing={shownStepKeys.size > 0}
      menuWidth="wide"
      data-stream-log-step-filter=""
    >
      <MenuGroup label="Nodes">
        <MenuItem keepsTheMenuOpen isDisabled={shownStepKeys.size === 0} onChosen={() => onShownStepKeysChosen(new Set())} data-stream-log-step-choice-all="">
          Show all nodes
        </MenuItem>
        <MenuSeparator />
        {stepChoices.map((stepChoice) => (
          <MenuCheckboxItem
            key={stepChoice.stepKey}
            isChecked={shownStepKeys.has(stepChoice.stepKey)}
            onCheckedChange={(isChecked) => {
              const chosenStepKeys = new Set(shownStepKeys);
              if (isChecked) chosenStepKeys.add(stepChoice.stepKey);
              else chosenStepKeys.delete(stepChoice.stepKey);
              onShownStepKeysChosen(chosenStepKeys);
            }}
            data-stream-log-step-choice={stepChoice.stepName}
          >
            <span className="min-w-0 truncate font-mono text-xs">{stepChoice.stepName}</span>
            <span className="ml-auto min-w-0 shrink-[3] truncate pl-3 text-xs text-fg-3">{stepChoice.stepHint}</span>
          </MenuCheckboxItem>
        ))}
      </MenuGroup>
    </FieldMenu>
  );
}

/** Opens `streamId`'s log folder, keeping why the last try was refused, in the refusal's own words, until the next. */
function useStreamLogFolderOpening(streamId: string): { openStreamLogFolder: () => void; folderOpeningRefusal: string | null } {
  const { backend } = useTatolabWindowEnvironment();
  const [folderOpeningRefusal, setFolderOpeningRefusal] = useState<string | null>(null);
  return {
    openStreamLogFolder: () => {
      setFolderOpeningRefusal(null);
      backend.openStreamLogFolder(streamId).catch((rejection: unknown) => setFolderOpeningRefusal(describeBackendRejection(rejection)));
    },
    folderOpeningRefusal,
  };
}

/** The quiet first row saying how many of this load's earlier records the window does not hold, and where they are on disk. */
function EarlierRecordsNotHeldRow({ stream, earlierRecordsNotHeldCount }: { stream: ListedStream; earlierRecordsNotHeldCount: number }) {
  const { openStreamLogFolder, folderOpeningRefusal } = useStreamLogFolderOpening(stream.stream);
  const projectDirectory = listedStreamProjectDirectory(stream);
  return (
    <div className="border-b px-3 font-sans text-xs" data-stream-log-earlier-records="">
      <div className="flex h-8 items-center gap-2 text-fg-3">
        <FileText className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 truncate">
          {earlierRecordsNotHeldWords(earlierRecordsNotHeldCount)}{" "}
          {projectDirectory !== null && (
            <span className="font-mono text-fg-2 select-text" title={logFolderPathOfStream(projectDirectory)}>
              {logFolderPathOfStream(projectDirectory)}
            </span>
          )}
        </span>
        <InlineLink destination={{ onPressed: openStreamLogFolder }} data-stream-action="open_stream_log_folder">
          Open
        </InlineLink>
      </div>
      {folderOpeningRefusal !== null && (
        <div className="pb-2">
          <RefusalLine words={folderOpeningRefusal} />
        </div>
      )}
    </div>
  );
}

/** A loaded stream's records as the runtime holds them, followed live, with the toolbar, the rows and the selected record's details. */
function LoadedStreamLogsView({ stream }: { stream: ListedStream }) {
  const { platform } = useTatolabWindowEnvironment();
  const reading = useStreamLogReading(stream.stream);
  const { graph } = useStreamGraphReading(stream.stream);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const recordsScroller = useRef<HTMLDivElement>(null);

  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState<StreamLogLevelFilter>("all");
  const [shownStepKeys, setShownStepKeys] = useState<ReadonlySet<string>>(new Set());
  const [isFollowing, setIsFollowing] = useState(true);
  const [areLinesWrapped, setAreLinesWrapped] = useState(false);
  const [areTimestampsShown, setAreTimestampsShown] = useState(true);
  const [clearedThroughSequence, setClearedThroughSequence] = useState(0);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [streamInstanceShown, setStreamInstanceShown] = useState(reading.streamInstance);
  // A new load numbers its records from 1 again, so what was cleared or selected of the last one no longer applies.
  if (reading.streamInstance !== streamInstanceShown) {
    setStreamInstanceShown(reading.streamInstance);
    setClearedThroughSequence(0);
    setSelectedSequence(null);
  }

  // The rows follow the search a beat behind the field, so typing stays quick over thousands of rows.
  const searchTextShown = useDeferredValue(searchText);
  const streamLogFilters = useMemo(
    () => ({ searchText: searchTextShown, levelFilter, shownStepKeys, clearedThroughSequence }),
    [searchTextShown, levelFilter, shownStepKeys, clearedThroughSequence],
  );
  const streamLog = useMemo(() => presentStreamLog(reading.records, graph, streamLogFilters), [reading.records, graph, streamLogFilters]);
  const selectedRecord = selectedSequence === null ? null : (reading.records.find((record) => record.sequence === selectedSequence) ?? null);
  const selectedRecordDetails = useMemo(() => (selectedRecord === null ? null : presentStreamLogRecordDetails(selectedRecord, graph)), [selectedRecord, graph]);
  const lastRowSequence = streamLog.rows.at(-1)?.record.sequence ?? null;

  const askedLogView = logViewAskedBy(location.state);
  useEffect(() => {
    if (askedLogView === null) return;
    if (askedLogView === "errors_only") setLevelFilter("error");
    else {
      searchInput.current?.focus();
      searchInput.current?.select();
    }
    void navigate(location.pathname, { replace: true, state: null });
  }, [askedLogView, navigate, location.pathname]);

  useLayoutEffect(() => {
    const scroller = recordsScroller.current;
    if (isFollowing && scroller !== null) scroller.scrollTop = scroller.scrollHeight;
  }, [isFollowing, lastRowSequence, streamLog.rows.length, areLinesWrapped, areTimestampsShown, selectedRecordDetails !== null]);

  useEffect(() => {
    if (selectedSequence !== null) document.getElementById(streamLogRowElementId(selectedSequence))?.scrollIntoView?.({ block: "nearest" });
  }, [selectedSequence]);

  const onRecordsScrolled = () => {
    const scroller = recordsScroller.current;
    if (scroller === null) return;
    const isAtTheEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_TAIL_DISTANCE_PIXELS;
    if (isAtTheEnd !== isFollowing) setIsFollowing(isAtTheEnd);
  };

  const onRecordsKeyDown = (keyboardEvent: ReactKeyboardEvent<HTMLDivElement>) => {
    const { rows } = streamLog;
    if (rows.length === 0) return;
    const selectedIndex = rows.findIndex((row) => row.record.sequence === selectedSequence);
    let nextIndex: number | null = null;
    if (keyboardEvent.key === "ArrowDown") nextIndex = selectedIndex === -1 ? rows.length - 1 : Math.min(rows.length - 1, selectedIndex + 1);
    else if (keyboardEvent.key === "ArrowUp") nextIndex = selectedIndex === -1 ? rows.length - 1 : Math.max(0, selectedIndex - 1);
    else if (keyboardEvent.key === "Home") nextIndex = 0;
    else if (keyboardEvent.key === "End") {
      nextIndex = rows.length - 1;
      setIsFollowing(true);
    }
    if (nextIndex === null) return;
    keyboardEvent.preventDefault();
    setSelectedSequence(rows[nextIndex]?.record.sequence ?? null);
  };

  const isShowingEarlierRecordsRow = isEarlierRecordsPointerShown(reading.earlierRecordsNotHeldCount, streamLogFilters);
  const recordDetailsPanel = selectedRecordDetails !== null ? (
    <StreamLogRecordDetailsView
      details={selectedRecordDetails}
      streamDisplayName={stream.display_name}
      actions={{
        onClosed: () => setSelectedSequence(null),
        onOnlyStepShown: (stepKey) => {
          setShownStepKeys(new Set([stepKey]));
          setLevelFilter("all");
        },
        onStepShownInGraph: (stepName) => void navigate(streamPagePath(stream.stream, "graph"), { state: { selectedStep: stepName } }),
      }}
    />
  ) : null;
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-logs-page={stream.stream}>
      <WorkAreaWithSidePanel sidePanel={recordDetailsPanel}>
        <Toolbar label="Logs">
          <SearchField
            inputRef={searchInput}
            label={`Search ${stream.display_name} logs`}
            placeholder="Search logs"
            text={searchText}
            onTextChanged={setSearchText}
            shortcut={presentWindowShortcut(platform, "F")}
            data-stream-log-search=""
          />
          <SegmentedChoiceControl
            label="Levels shown"
            choices={streamLog.levelFilterChoices.map((levelFilterChoice) => ({
              choice: levelFilterChoice.levelFilter,
              label: <span className={LEVEL_FILTER_LABEL_TONE_CLASS_NAMES[levelFilterChoice.labelTone]}>{levelFilterChoice.label}</span>,
              count: levelFilterChoice.count,
            }))}
            chosen={levelFilter}
            onChosen={setLevelFilter}
            dataAttributeOfEachSegment="data-stream-log-level-filter"
          />
          <StreamLogStepFilterControl streamLog={streamLog} shownStepKeys={shownStepKeys} onShownStepKeysChosen={setShownStepKeys} />
          <ToolbarGroup isAtTheEnd>
            <ToggleIconButton
              icon={ArrowDownToLine}
              label="Follow new lines"
              tooltipWhileOn="Following new lines"
              isOn={isFollowing}
              onToggled={setIsFollowing}
              data-stream-log-toolbar="follow"
            />
            <MoreActionsMenu label="More for these logs" data-stream-log-toolbar="more">
              <MenuCheckboxItem isChecked={areLinesWrapped} onCheckedChange={setAreLinesWrapped} data-stream-log-toolbar="wrap">
                Wrap lines
              </MenuCheckboxItem>
              <MenuCheckboxItem isChecked={areTimestampsShown} onCheckedChange={setAreTimestampsShown} data-stream-log-toolbar="timestamps">
                Show timestamps
              </MenuCheckboxItem>
              <MenuSeparator />
              <MenuItem icon={Copy} onChosen={() => void writeTextToClipboard(jsonlOfStreamLogRows(streamLog.rows))} data-stream-log-toolbar="copy">
                Copy shown lines as JSONL
              </MenuItem>
              <MenuItem
                icon={Ban}
                onChosen={() => {
                  setClearedThroughSequence(reading.records.at(-1)?.sequence ?? 0);
                  setSelectedSequence(null);
                }}
                data-stream-log-toolbar="clear"
              >
                Clear the lines shown
              </MenuItem>
            </MoreActionsMenu>
          </ToolbarGroup>
        </Toolbar>
        {reading.readRefusal !== null && (
          <div data-stream-log-read-refusal="">
            <RefusalLine tone="warning" layout="bar" lead="Couldn't read new records, trying again:" words={reading.readRefusal} />
          </div>
        )}
        <div ref={recordsScroller} onScroll={onRecordsScrolled} className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {isShowingEarlierRecordsRow && <EarlierRecordsNotHeldRow stream={stream} earlierRecordsNotHeldCount={reading.earlierRecordsNotHeldCount} />}
          {!reading.hasReadAPage ? (
            <div className="flex h-full">
              <EmptyState title="Reading logs…" />
            </div>
          ) : streamLog.emptyWords !== null ? (
            <div className="flex h-full">
              <EmptyState title={streamLog.emptyWords} data-stream-log-empty="" />
            </div>
          ) : (
            <div
              role="listbox"
              tabIndex={0}
              aria-label="Log records, oldest first"
              aria-activedescendant={selectedRecord === null ? undefined : streamLogRowElementId(selectedRecord.sequence)}
              onKeyDown={onRecordsKeyDown}
              className="py-1 font-mono text-[12px] leading-5 outline-none select-text focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
              data-stream-log-records=""
            >
              {streamLog.rows.map((row) => (
                <StreamLogRowView
                  key={row.record.sequence}
                  row={row}
                  isSelected={row.record.sequence === selectedSequence}
                  areTimestampsShown={areTimestampsShown}
                  areLinesWrapped={areLinesWrapped}
                  searchText={searchTextShown}
                  onSelected={setSelectedSequence}
                />
              ))}
            </div>
          )}
        </div>
      </WorkAreaWithSidePanel>
    </div>
  );
}

/** A stream's Logs tab while it is not loaded: why, the folder its log is in, and Retry for a failed one. */
function StreamLogsOfAStreamNotLoadedView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  const { openStreamLogFolder, folderOpeningRefusal } = useStreamLogFolderOpening(stream.stream);
  const notLoadedWords = presentStreamLogsOfAStreamNotLoaded(stream);
  const retryAction = notLoadedWords.hasFailed ? presentStreamPrimaryAction(stream) : null;
  const projectDirectory = listedStreamProjectDirectory(stream);
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-logs-not-loaded={stream.stream}>
      <EmptyState icon={notLoadedWords.hasFailed ? SquareX : ScrollText} isFailure={notLoadedWords.hasFailed} title={notLoadedWords.title} explanation={notLoadedWords.explanation}>
        {projectDirectory !== null && (
          <div className="flex h-7 max-w-full items-center rounded-md border bg-well px-2.5 font-mono text-xs text-fg-2">
            <span className="truncate select-text" title={logFolderPathOfStream(projectDirectory)}>
              {logFolderPathOfStream(projectDirectory)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <ActionButton icon={FolderOpen} onPressed={openStreamLogFolder} data-stream-action="open_stream_log_folder">
            Open log folder
          </ActionButton>
          {retryAction !== null && (
            <ActionButton
              icon={RotateCw}
              isDisabled={streamPageActions.actionUnderWay !== undefined}
              onPressed={() => streamPageActions.runPrimaryAction(retryAction)}
              data-stream-action={`${retryAction.streamAction}_from_logs`}
            >
              {retryAction.label}
            </ActionButton>
          )}
        </div>
        {folderOpeningRefusal !== null && (
          <div className="text-left">
            <RefusalLine words={folderOpeningRefusal} />
          </div>
        )}
      </EmptyState>
    </div>
  );
}

/** A stream's Logs tab: its records while it is loaded, or why it has none and where its log is on disk. */
export function StreamLogsPageView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  if (!isStreamLoaded(stream)) return <StreamLogsOfAStreamNotLoadedView stream={stream} streamPageActions={streamPageActions} />;
  return <LoadedStreamLogsView stream={stream} />;
}
