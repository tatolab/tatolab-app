import { cn } from "cn";
import { ArrowDownToLine, Ban, Copy, FileText, History, ListFilter, ScrollText } from "lucide-react";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { writeTextToClipboard } from "../clipboard";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import type { ProjectLogScope } from "../project_log_readings";
import {
  actionKeyOfTheLastFailure,
  EARLIER_RECORDS_NOT_HELD_WORDS,
  isEarlierRecordsPointerShown,
  jsonlOfStreamLogRows,
  logFolderPathOfProject,
  presentStreamLog,
  presentStreamLogRecordDetails,
  searchMatchRangesOf,
  type StreamLogLevelFilter,
  type StreamLogLevelFilterChoice,
  type StreamLogMessageLinePartKind,
  type StreamLogPresentation,
  type StreamLogRow,
} from "../presentation/log_record_presentation";
import { presentWindowShortcut } from "../presentation/platform_presentation";
import { listedStreamProjectDirectory } from "../presentation/stream_presentation";
import { EmptyState } from "../design_system/empty_state";
import { InlineLink } from "../design_system/inline_link";
import { FieldMenu, MenuCheckboxItem, MenuGroup, MenuItem, MenuSeparator, MenuSingleChoiceGroup, MoreActionsMenu } from "../design_system/menus";
import { RefusalLine } from "../design_system/refusal_line";
import { SearchField } from "../design_system/search_field";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { WorkAreaWithSidePanel } from "../design_system/side_panel";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import { Toolbar, ToolbarGroup } from "../design_system/toolbar";
import { LOG_LEVEL_WORD_TONE_CLASS_NAMES, StreamLogRecordDetailsView } from "./stream_log_record_details_view";
import { logViewAskedBy, streamPagePath } from "./stream_page_path";
import { useProjectLogReading, useStreamGraphReading, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Scrolled within this many pixels of the end, the list keeps following new records. */
const FOLLOW_TAIL_DISTANCE_PIXELS = 8;

/** The id of a record's row, which the list names as its active descendant. */
function streamLogRowElementId(position: number): string {
  return `stream-log-record-${position}`;
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
  onSelected: (position: number) => void;
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
        {row.actionDividerWords !== null && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-fg-3" aria-hidden data-stream-log-action-divider={row.record.action ?? ""}>
            <History className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{row.actionDividerWords}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
        <div
          id={streamLogRowElementId(row.record.position)}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onSelected(row.record.position)}
          data-stream-log-record={row.record.position}
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
  // Every field of a row but its step and its dividers is drawn from its record alone (`rowOfLogRecord`), so those decide whether it redraws.
  (previousProps, nextProps) =>
    previousProps.row.record === nextProps.row.record &&
    previousProps.row.step.stepName === nextProps.row.step.stepName &&
    previousProps.row.step.isAStepOfTheGraph === nextProps.row.step.isAStepOfTheGraph &&
    previousProps.row.dayDividerWords === nextProps.row.dayDividerWords &&
    previousProps.row.actionDividerWords === nextProps.row.actionDividerWords &&
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

/** The action filter's choice that shows every action's records. */
const EVERY_ACTION_CHOICE = "every_action";

/** Narrows the rows to one stream action's records, offering each action the records name. */
function StreamLogActionFilterControl({
  streamLog,
  shownActionKey,
  onShownActionKeyChosen,
}: {
  streamLog: StreamLogPresentation;
  shownActionKey: string | null;
  onShownActionKeyChosen: (shownActionKey: string | null) => void;
}) {
  const choiceOfActionKey = (actionKey: string) => `action:${actionKey}`;
  return (
    <FieldMenu
      label={`Actions shown: ${streamLog.actionFilterWords}`}
      leading={<History className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />}
      words={<span className="max-w-40 truncate">{streamLog.actionFilterWords}</span>}
      isNarrowing={shownActionKey !== null}
      menuWidth="wide"
      data-stream-log-action-filter=""
    >
      <MenuGroup label="Stream actions">
        <MenuSingleChoiceGroup
          choices={[
            { choice: EVERY_ACTION_CHOICE, label: "All actions" },
            ...streamLog.actionChoices.map((actionChoice) => ({
              choice: choiceOfActionKey(actionChoice.actionKey),
              label: <span className="min-w-0 truncate tabular">{actionChoice.actionWords}</span>,
            })),
          ]}
          chosen={shownActionKey === null ? EVERY_ACTION_CHOICE : choiceOfActionKey(shownActionKey)}
          onChosen={(choice) => onShownActionKeyChosen(choice === EVERY_ACTION_CHOICE ? null : choice.slice("action:".length))}
          dataAttributeOfEachChoice="data-stream-log-action-choice"
        />
      </MenuGroup>
    </FieldMenu>
  );
}

/** Which records the Logs tab reads: the stream's own, or every record of its project. */
type StreamLogScopeChoice = "this_stream" | "whole_project";

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

/** The quiet first row saying the window does not hold the earliest records, and where they are on disk. */
function EarlierRecordsNotHeldRow({ stream, projectDirectory }: { stream: ListedStream; projectDirectory: string }) {
  const { openStreamLogFolder, folderOpeningRefusal } = useStreamLogFolderOpening(stream.stream);
  return (
    <div className="border-b px-3 font-sans text-xs" data-stream-log-earlier-records="">
      <div className="flex h-8 items-center gap-2 text-fg-3">
        <FileText className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 truncate">
          {EARLIER_RECORDS_NOT_HELD_WORDS}{" "}
          <span className="font-mono text-fg-2 select-text" title={logFolderPathOfProject(projectDirectory)}>
            {logFolderPathOfProject(projectDirectory)}
          </span>
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

/**
 * The project log of `stream`'s project, narrowed to the stream's own records or showing the whole project's, followed
 * live, with the toolbar, the rows and the selected record's details. A failed stream opens on the records of the
 * action that failed it.
 */
function ProjectLogOfTheStreamView({ stream, projectDirectory }: { stream: ListedStream; projectDirectory: string }) {
  const { platform, projectLogReadings } = useTatolabWindowEnvironment();
  const [scopeChoice, setScopeChoice] = useState<StreamLogScopeChoice>("this_stream");
  const scope: ProjectLogScope = useMemo(
    () => ({ projectDirectory, stream: scopeChoice === "this_stream" ? stream.stream : null }),
    [projectDirectory, scopeChoice, stream.stream],
  );
  useEffect(() => {
    projectLogReadings.showProjectLog(scope);
  }, [projectLogReadings, scope]);
  useEffect(() => () => projectLogReadings.showProjectLog(null), [projectLogReadings]);
  const reading = useProjectLogReading(scope);
  const { graph } = useStreamGraphReading(stream.stream);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const recordsScroller = useRef<HTMLDivElement>(null);

  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState<StreamLogLevelFilter>("all");
  const [shownStepKeys, setShownStepKeys] = useState<ReadonlySet<string>>(new Set());
  const [shownActionKey, setShownActionKey] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [areLinesWrapped, setAreLinesWrapped] = useState(false);
  const [areTimestampsShown, setAreTimestampsShown] = useState(true);
  const [clearedThroughPosition, setClearedThroughPosition] = useState(0);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [scopeShown, setScopeShown] = useState(scope);
  const [hasOpenedOnTheFailure, setHasOpenedOnTheFailure] = useState(false);
  // Another scope numbers its records from 1 again, so what was cleared, selected or narrowed to of the last one no longer applies.
  if (scope !== scopeShown) {
    setScopeShown(scope);
    setClearedThroughPosition(0);
    setSelectedPosition(null);
    setShownActionKey(null);
  }
  if (!hasOpenedOnTheFailure && scope.stream !== null && reading.hasReadToTheNewestRecord) {
    setHasOpenedOnTheFailure(true);
    if (stream.state === "failed") setShownActionKey(actionKeyOfTheLastFailure(reading.records));
  }

  // The rows follow the search a beat behind the field, so typing stays quick over thousands of rows.
  const searchTextShown = useDeferredValue(searchText);
  const streamLogFilters = useMemo(
    () => ({ searchText: searchTextShown, levelFilter, shownStepKeys, shownActionKey, clearedThroughPosition }),
    [searchTextShown, levelFilter, shownStepKeys, shownActionKey, clearedThroughPosition],
  );
  const streamLog = useMemo(() => presentStreamLog(reading.records, graph, streamLogFilters), [reading.records, graph, streamLogFilters]);
  const selectedRecord = selectedPosition === null ? null : (reading.records.find((record) => record.position === selectedPosition) ?? null);
  const selectedRecordDetails = useMemo(() => (selectedRecord === null ? null : presentStreamLogRecordDetails(selectedRecord, graph)), [selectedRecord, graph]);
  const lastRowPosition = streamLog.rows.at(-1)?.record.position ?? null;

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
  }, [isFollowing, lastRowPosition, streamLog.rows.length, areLinesWrapped, areTimestampsShown, selectedRecordDetails !== null]);

  useEffect(() => {
    if (selectedPosition !== null) document.getElementById(streamLogRowElementId(selectedPosition))?.scrollIntoView?.({ block: "nearest" });
  }, [selectedPosition]);

  const onRecordsScrolled = () => {
    const scroller = recordsScroller.current;
    if (scroller === null) return;
    const isAtTheEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_TAIL_DISTANCE_PIXELS;
    if (isAtTheEnd !== isFollowing) setIsFollowing(isAtTheEnd);
  };

  const onRecordsKeyDown = (keyboardEvent: ReactKeyboardEvent<HTMLDivElement>) => {
    const { rows } = streamLog;
    if (rows.length === 0) return;
    const selectedIndex = rows.findIndex((row) => row.record.position === selectedPosition);
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
    setSelectedPosition(rows[nextIndex]?.record.position ?? null);
  };

  const isShowingEarlierRecordsRow = isEarlierRecordsPointerShown(reading.areEarlierRecordsNotHeld, streamLogFilters);
  const recordDetailsPanel = selectedRecordDetails !== null ? (
    <StreamLogRecordDetailsView
      details={selectedRecordDetails}
      streamDisplayName={stream.display_name}
      actions={{
        onClosed: () => setSelectedPosition(null),
        onOnlyStepShown: (stepKey) => {
          setShownStepKeys(new Set([stepKey]));
          setLevelFilter("all");
        },
        onStepShownInGraph: (stepName) => void navigate(streamPagePath(stream.stream, "graph"), { state: { selectedStep: stepName } }),
      }}
    />
  ) : null;
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-logs-page={stream.stream} data-stream-log-scope-shown={scopeChoice}>
      <WorkAreaWithSidePanel sidePanel={recordDetailsPanel}>
        <Toolbar label="Logs">
          <SegmentedChoiceControl
            label="Records shown"
            choices={[
              { choice: "this_stream", label: "This stream" },
              { choice: "whole_project", label: "Whole project" },
            ]}
            chosen={scopeChoice}
            onChosen={setScopeChoice}
            dataAttributeOfEachSegment="data-stream-log-scope"
          />
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
          <StreamLogActionFilterControl streamLog={streamLog} shownActionKey={shownActionKey} onShownActionKeyChosen={setShownActionKey} />
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
                  setClearedThroughPosition(reading.records.at(-1)?.position ?? 0);
                  setSelectedPosition(null);
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
          {isShowingEarlierRecordsRow && <EarlierRecordsNotHeldRow stream={stream} projectDirectory={projectDirectory} />}
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
              aria-activedescendant={selectedRecord === null ? undefined : streamLogRowElementId(selectedRecord.position)}
              onKeyDown={onRecordsKeyDown}
              className="py-1 font-mono text-[12px] leading-5 outline-none select-text focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
              data-stream-log-records=""
            >
              {streamLog.rows.map((row) => (
                <StreamLogRowView
                  key={row.record.position}
                  row={row}
                  isSelected={row.record.position === selectedPosition}
                  areTimestampsShown={areTimestampsShown}
                  areLinesWrapped={areLinesWrapped}
                  searchText={searchTextShown}
                  onSelected={setSelectedPosition}
                />
              ))}
            </div>
          )}
        </div>
      </WorkAreaWithSidePanel>
    </div>
  );
}

/** A stream's Logs tab: its project's log, narrowed to the stream; or, for an earlier runtime's record, which names no project folder, why there is none. */
export function StreamLogsPageView({ stream }: { stream: ListedStream }) {
  const projectDirectory = listedStreamProjectDirectory(stream);
  if (projectDirectory === null) {
    return (
      <div className="flex min-h-0 flex-1 bg-window" data-stream-logs-without-a-project={stream.stream}>
        <EmptyState
          icon={ScrollText}
          title="No project log"
          explanation="An earlier runtime recorded this stream without its project folder, so there is no project log to read."
        />
      </div>
    );
  }
  return <ProjectLogOfTheStreamView stream={stream} projectDirectory={projectDirectory} />;
}
