// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowDownToLine, Ban, ChevronDown, Clock, FileText, FolderOpen, PanelRight, RotateCw, ScrollText, Search, SquareX, TriangleAlert, WrapText, X } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import {
  earlierRecordsNotHeldWords,
  jsonlOfStreamLogRows,
  logFolderPathOfStream,
  presentStreamLog,
  presentStreamLogRecordDetails,
  presentStreamLogsOfAStreamNotLoaded,
  STREAM_LOG_LEVEL_FILTERS,
  streamLoadWords,
  type StreamLogLevelFilter,
  type StreamLogRow,
  type StreamLogStepChoice,
} from "../presentation/log_record_presentation";
import { shortcutHint } from "../presentation/platform_presentation";
import { isStreamLoaded, presentStreamPrimaryAction } from "../presentation/stream_presentation";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuTrigger } from "./shadcn/dropdown_menu";
import { Kbd } from "./shadcn/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";
import { CopyTextButton, LOG_LEVEL_WORD_TONE_CLASS_NAMES, StreamLogRecordDetailsView } from "./stream_log_record_details_view";
import type { StreamPageActions } from "./stream_page_header_view";
import { logViewAskedBy, streamPagePath } from "./stream_page_path";
import { useStreamGraphReading, useStreamLogReading, useTatolabWindowEnvironment } from "./tatolab_window_context";
import { ToolbarDivider, ToolbarIconButton } from "./toolbar_icon_button";

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

/** `styledRuns` in their colours, each case-insensitive match of `searchText` marked, a match that spans runs included. */
function TextWithSearchMatches({ styledRuns, searchText }: { styledRuns: readonly StyledTextRun[]; searchText: string }) {
  const lowercaseSearchText = searchText.trim().toLowerCase();
  const lowercaseText = styledRuns.map((styledRun) => styledRun.text).join("").toLowerCase();
  const matchRanges: [number, number][] = [];
  if (lowercaseSearchText !== "") {
    for (let matchAt = lowercaseText.indexOf(lowercaseSearchText); matchAt !== -1; matchAt = lowercaseText.indexOf(lowercaseSearchText, matchAt + lowercaseSearchText.length)) {
      matchRanges.push([matchAt, matchAt + lowercaseSearchText.length]);
    }
  }
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
          className={joinClassNames(
            "grid cursor-default gap-x-3 px-3 hover:bg-hover",
            areTimestampsShown ? "grid-cols-[92px_44px_120px_minmax(0,1fr)]" : "grid-cols-[44px_120px_minmax(0,1fr)]",
            !areLinesWrapped && "whitespace-nowrap",
            isSelected && "bg-selected shadow-[inset_2px_0_0_var(--brand)] hover:bg-selected",
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
          <div className={joinClassNames("min-w-0", areLinesWrapped ? "break-words whitespace-pre-wrap" : "truncate")}>
            <TextWithSearchMatches styledRuns={[{ text: row.record.message, className: "text-fg" }]} searchText={searchText} />
            {row.fields.map((field) => (
              <span key={field.key}>
                {"  "}
                <TextWithSearchMatches
                  styledRuns={[
                    { text: `${field.key}=`, className: "text-fg-3" },
                    { text: field.valueText, className: "text-fg-2" },
                  ]}
                  searchText={searchText}
                />
              </span>
            ))}
          </div>
        </div>
      </>
    );
  },
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

function StreamLogLevelFilterControl({
  chosenLevelFilter,
  countsByLevelFilter,
  onLevelFilterChosen,
}: {
  chosenLevelFilter: StreamLogLevelFilter;
  countsByLevelFilter: Record<StreamLogLevelFilter, number>;
  onLevelFilterChosen: (levelFilter: StreamLogLevelFilter) => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center rounded-md bg-well p-0.5" role="radiogroup" aria-label="Levels shown">
      {STREAM_LOG_LEVEL_FILTERS.map(({ levelFilter, label }) => {
        const count = countsByLevelFilter[levelFilter];
        return (
          <button
            key={levelFilter}
            type="button"
            role="radio"
            aria-checked={chosenLevelFilter === levelFilter}
            onClick={() => onLevelFilterChosen(levelFilter)}
            data-stream-log-level-filter={levelFilter}
            className={joinClassNames(
              "flex h-6 items-center gap-1.5 rounded-[5px] px-2 whitespace-nowrap text-fg-2 transition-colors hover:text-fg",
              chosenLevelFilter === levelFilter && "bg-raised text-fg shadow-(--shadow-segment)",
            )}
          >
            <span className={joinClassNames(count > 0 && levelFilter === "warn" && "text-warn-text", count > 0 && levelFilter === "error" && "text-danger-text")}>{label}</span>
            <span className="text-fg-2 tabular">{count.toLocaleString("en-US")}</span>
          </button>
        );
      })}
    </div>
  );
}

function StreamLogStepFilterControl({
  stepChoices,
  shownStepKeys,
  onShownStepKeysChosen,
}: {
  stepChoices: readonly StreamLogStepChoice[];
  shownStepKeys: ReadonlySet<string>;
  onShownStepKeysChosen: (shownStepKeys: ReadonlySet<string>) => void;
}) {
  const onlyStepChosen = shownStepKeys.size === 1 ? stepChoices.find((stepChoice) => shownStepKeys.has(stepChoice.stepKey)) : undefined;
  const stepsChosenWords = shownStepKeys.size === 0 ? "All steps" : onlyStepChosen !== undefined ? onlyStepChosen.stepName : `${shownStepKeys.size} of ${stepChoices.length}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Steps shown: ${stepsChosenWords}`}
        data-stream-log-step-filter=""
        className={joinClassNames(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-fg-2 transition-colors hover:border-line-strong hover:text-fg data-popup-open:border-line-strong",
          shownStepKeys.size > 0 && "border-line-strong text-fg",
        )}
      >
        <span className="text-fg-3">Step</span>
        <span className={joinClassNames("max-w-36 truncate", onlyStepChosen !== undefined && "font-mono text-xs")}>{stepsChosenWords}</span>
        <ChevronDown className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-72">
        <DropdownMenuGroup>
          <div className="flex h-7 items-center px-2">
            <DropdownMenuGroupLabel className="px-0 py-0 font-medium">Steps</DropdownMenuGroupLabel>
            <button
              type="button"
              disabled={shownStepKeys.size === 0}
              onClick={() => onShownStepKeysChosen(new Set())}
              className="ml-auto rounded px-1 text-xs text-fg-3 hover:text-fg disabled:opacity-40 disabled:hover:text-fg-3"
            >
              Show all
            </button>
          </div>
          {stepChoices.map((stepChoice) => (
            <DropdownMenuCheckboxItem
              key={stepChoice.stepKey}
              checked={shownStepKeys.has(stepChoice.stepKey)}
              onCheckedChange={(isChecked) => {
                const chosenStepKeys = new Set(shownStepKeys);
                if (isChecked) chosenStepKeys.add(stepChoice.stepKey);
                else chosenStepKeys.delete(stepChoice.stepKey);
                onShownStepKeysChosen(chosenStepKeys);
              }}
              data-stream-log-step-choice={stepChoice.stepName}
            >
              <span className="min-w-0 truncate font-mono text-xs">{stepChoice.stepName}</span>
              <span className="ml-auto truncate pl-3 text-xs text-fg-3">{stepChoice.stepHint}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The quiet first row saying how many of this load's earlier records the window does not hold, and where they are on disk. */
function EarlierRecordsNotHeldRow({ stream, earlierRecordsNotHeldCount }: { stream: ListedStream; earlierRecordsNotHeldCount: number }) {
  const { backend } = useTatolabWindowEnvironment();
  const [folderOpeningRefusal, setFolderOpeningRefusal] = useState<string | null>(null);
  return (
    <div className="border-b px-3 font-sans text-xs" data-stream-log-earlier-records="">
      <div className="flex h-8 items-center gap-2 text-fg-3">
        <FileText className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 truncate">
          {earlierRecordsNotHeldWords(earlierRecordsNotHeldCount)} <span className="font-mono text-fg-2 select-text">{logFolderPathOfStream(stream.project_directory)}</span>
        </span>
        <button
          type="button"
          className="shrink-0 rounded text-brand-text hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => {
            setFolderOpeningRefusal(null);
            backend.openStreamLogFolder(stream.name).catch((rejection: unknown) => setFolderOpeningRefusal(describeBackendRejection(rejection)));
          }}
          data-stream-action="open_stream_log_folder"
        >
          Open
        </button>
      </div>
      {folderOpeningRefusal !== null && (
        <p role="alert" className="flex gap-1.5 pb-2 text-fg-2">
          <SquareX className="mt-px size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
          <span className="select-text">{folderOpeningRefusal}</span>
        </p>
      )}
    </div>
  );
}

/** A loaded stream's records as the runtime holds them, followed live, with the toolbar, the rows and the selected record's details. */
function LoadedStreamLogsView({ stream }: { stream: ListedStream }) {
  const { platform } = useTatolabWindowEnvironment();
  const reading = useStreamLogReading(stream.name);
  const { graph } = useStreamGraphReading(stream.name);
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
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);
  const [clearedThroughSequence, setClearedThroughSequence] = useState(0);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [streamInstanceShown, setStreamInstanceShown] = useState(reading.streamInstance);
  // A new load numbers its records from 1 again, so what was cleared or selected of the last one no longer applies.
  if (reading.streamInstance !== streamInstanceShown) {
    setStreamInstanceShown(reading.streamInstance);
    setClearedThroughSequence(0);
    setSelectedSequence(null);
  }

  const streamLog = useMemo(
    () => presentStreamLog(reading.records, graph, { searchText, levelFilter, shownStepKeys, clearedThroughSequence }),
    [reading.records, graph, searchText, levelFilter, shownStepKeys, clearedThroughSequence],
  );
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
  }, [isFollowing, lastRowSequence, streamLog.rows.length, areLinesWrapped, areTimestampsShown, isDetailsPanelOpen]);

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

  const isShowingEarlierRecordsRow = reading.earlierRecordsNotHeldCount > 0 && clearedThroughSequence === 0 && searchText.trim() === "";
  return (
    <div className="flex min-h-0 flex-1 bg-window" data-stream-logs-page={stream.name}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3" role="toolbar" aria-label="Logs">
          <label className="flex h-7 w-60 min-w-36 shrink items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
            <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
            <input
              ref={searchInput}
              value={searchText}
              onChange={(changeEvent) => setSearchText(changeEvent.target.value)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key !== "Escape") return;
                keyboardEvent.preventDefault();
                if (searchText !== "") setSearchText("");
                else keyboardEvent.currentTarget.blur();
              }}
              placeholder="Search logs"
              aria-label={`Search ${stream.name} logs`}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
              data-stream-log-search=""
            />
            {searchText !== "" ? (
              <button type="button" onClick={() => setSearchText("")} className="text-fg-3 hover:text-fg" aria-label="Clear search">
                <X className="size-3.5" aria-hidden />
              </button>
            ) : (
              <Kbd>{shortcutHint(platform, "F")}</Kbd>
            )}
          </label>
          <StreamLogLevelFilterControl chosenLevelFilter={levelFilter} countsByLevelFilter={streamLog.countsByLevelFilter} onLevelFilterChosen={setLevelFilter} />
          <StreamLogStepFilterControl stepChoices={streamLog.stepChoices} shownStepKeys={shownStepKeys} onShownStepKeysChosen={setShownStepKeys} />
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {reading.streamInstance !== null && (
              <Tooltip>
                <TooltipTrigger render={<span className="mr-3 cursor-default text-xs whitespace-nowrap text-fg-3" data-stream-log-load="" />}>
                  {streamLoadWords(reading.streamInstance)}
                </TooltipTrigger>
                <TooltipContent>
                  Records since this load are held in memory.
                  <span className="mt-1 block font-mono text-[10px] opacity-80">stream_instance: {reading.streamInstance}</span>
                </TooltipContent>
              </Tooltip>
            )}
            <span className="mr-2 text-xs whitespace-nowrap text-fg-3 tabular" data-stream-log-line-count="">
              {streamLog.lineCountWords}
            </span>
            <ToolbarIconButton
              icon={ArrowDownToLine}
              label="Follow new lines"
              tooltip={isFollowing ? "Following new lines" : "Follow new lines"}
              isPressed={isFollowing}
              onClick={() => setIsFollowing((wasFollowing) => !wasFollowing)}
              controlAttribute={{ "data-stream-log-toolbar": "follow" }}
            />
            <ToolbarIconButton
              icon={WrapText}
              label="Wrap lines"
              tooltip={areLinesWrapped ? "Don't wrap lines" : "Wrap lines"}
              isPressed={areLinesWrapped}
              onClick={() => setAreLinesWrapped((wereWrapped) => !wereWrapped)}
              controlAttribute={{ "data-stream-log-toolbar": "wrap" }}
            />
            <ToolbarIconButton
              icon={Clock}
              label="Timestamps"
              tooltip={areTimestampsShown ? "Hide timestamps" : "Show timestamps"}
              isPressed={areTimestampsShown}
              onClick={() => setAreTimestampsShown((wereShown) => !wereShown)}
              controlAttribute={{ "data-stream-log-toolbar": "timestamps" }}
            />
            <CopyTextButton textToCopy={jsonlOfStreamLogRows(streamLog.rows)} label="Copy shown lines as JSONL" controlAttribute={{ "data-stream-log-toolbar": "copy" }} />
            <ToolbarIconButton
              icon={Ban}
              label="Clear"
              tooltip="Clear the lines shown; new ones still arrive"
              onClick={() => {
                setClearedThroughSequence(reading.records.at(-1)?.sequence ?? 0);
                setSelectedSequence(null);
              }}
              controlAttribute={{ "data-stream-log-toolbar": "clear" }}
            />
            <ToolbarDivider />
            <ToolbarIconButton
              icon={PanelRight}
              label="Details"
              tooltip={isDetailsPanelOpen ? "Hide details" : "Show details"}
              isPressed={isDetailsPanelOpen}
              onClick={() => setIsDetailsPanelOpen((wasOpen) => !wasOpen)}
              controlAttribute={{ "data-stream-log-toolbar": "details" }}
            />
          </div>
        </div>
        {reading.readRefusal !== null && (
          <div role="status" className="flex min-h-8 items-center gap-2 border-b px-3 py-1 text-xs" data-stream-log-read-refusal="">
            <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
            <span className="shrink-0 text-fg-2">Couldn't read new records, trying again:</span>
            <span className="min-w-0 truncate text-fg select-text" title={reading.readRefusal}>
              {reading.readRefusal}
            </span>
          </div>
        )}
        <div ref={recordsScroller} onScroll={onRecordsScrolled} className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {isShowingEarlierRecordsRow && <EarlierRecordsNotHeldRow stream={stream} earlierRecordsNotHeldCount={reading.earlierRecordsNotHeldCount} />}
          {!reading.hasReadAPage ? (
            <div className="grid h-full place-items-center font-sans text-fg-3">Reading logs…</div>
          ) : streamLog.emptyWords !== null ? (
            <div className="grid h-full place-items-center px-6 text-center font-sans text-fg-3" data-stream-log-empty="">
              {streamLog.emptyWords}
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
                  searchText={searchText}
                  onSelected={setSelectedSequence}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {isDetailsPanelOpen && (
        <StreamLogRecordDetailsView
          details={selectedRecordDetails}
          streamName={stream.name}
          actions={{
            onClosed: () => setIsDetailsPanelOpen(false),
            onOnlyStepShown: (stepKey) => {
              setShownStepKeys(new Set([stepKey]));
              setLevelFilter("all");
            },
            onStepShownInGraph: (stepName) => void navigate(streamPagePath(stream.name, "graph"), { state: { selectedStep: stepName } }),
          }}
        />
      )}
    </div>
  );
}

/** A stream's Logs tab while it is not loaded: why, the folder its log is in, and Retry for a failed one. */
function StreamLogsOfAStreamNotLoadedView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  const { backend } = useTatolabWindowEnvironment();
  const [folderOpeningRefusal, setFolderOpeningRefusal] = useState<string | null>(null);
  const notLoadedWords = presentStreamLogsOfAStreamNotLoaded(stream);
  const retryAction = notLoadedWords.hasFailed ? presentStreamPrimaryAction(stream) : null;
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-window px-8" data-stream-logs-not-loaded={stream.name}>
      <div className="flex max-w-lg flex-col items-center text-center">
        {notLoadedWords.hasFailed ? (
          <SquareX className="size-5 text-danger" strokeWidth={1.5} aria-hidden />
        ) : (
          <ScrollText className="size-5 text-fg-3" strokeWidth={1.5} aria-hidden />
        )}
        <div className="mt-2.5 text-fg">{notLoadedWords.title}</div>
        <p className="mt-1 text-fg-3 select-text">{notLoadedWords.explanation}</p>
        <div className="mt-4 flex h-7 max-w-full items-center rounded-md border bg-well px-2.5 font-mono text-xs text-fg-2">
          <span className="truncate select-text">{logFolderPathOfStream(stream.project_directory)}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Button
            variant="outline"
            onClick={() => {
              setFolderOpeningRefusal(null);
              backend.openStreamLogFolder(stream.name).catch((rejection: unknown) => setFolderOpeningRefusal(describeBackendRejection(rejection)));
            }}
            data-stream-action="open_stream_log_folder"
          >
            <FolderOpen aria-hidden /> Open log folder
          </Button>
          {retryAction !== null && (
            <Button
              variant="outline"
              disabled={streamPageActions.actionUnderWay !== undefined}
              onClick={() => streamPageActions.runPrimaryAction(retryAction)}
              data-stream-action={`${retryAction.streamAction}_from_logs`}
            >
              <RotateCw aria-hidden /> {retryAction.label}
            </Button>
          )}
        </div>
        {folderOpeningRefusal !== null && (
          <p role="alert" className="mt-2 flex gap-1.5 text-left text-xs text-fg-2">
            <SquareX className="mt-px size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <span className="select-text">{folderOpeningRefusal}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** A stream's Logs tab: its records while it is loaded, or why it has none and where its log is on disk. */
export function StreamLogsPageView({ stream, streamPageActions }: { stream: ListedStream; streamPageActions: StreamPageActions }) {
  if (!isStreamLoaded(stream)) return <StreamLogsOfAStreamNotLoadedView stream={stream} streamPageActions={streamPageActions} />;
  return <LoadedStreamLogsView stream={stream} />;
}
