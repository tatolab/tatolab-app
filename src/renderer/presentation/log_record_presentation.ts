import { STREAM_LOG_FOLDER_IN_THE_PROJECT, type ListedStream, type StreamGraphSummary, type StreamLogRecord } from "../../shared/tatolab_backend_contract";
import { abbreviateHomeDirectory, countLabel, streamNotLoadedReason } from "./stream_presentation";

/** The levels the runtime writes, least severe first; a level this app does not know ranks as info. */
const LOG_LEVEL_RANKS: Record<string, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

const UNKNOWN_LOG_LEVEL_RANK = LOG_LEVEL_RANKS.info;

function rankLogLevel(level: string | null): number {
  if (level === null) return UNKNOWN_LOG_LEVEL_RANK;
  return LOG_LEVEL_RANKS[level.toLowerCase()] ?? UNKNOWN_LOG_LEVEL_RANK;
}

/** Which records the Logs tab's level control shows: every one, or one level's. */
export type StreamLogLevelFilter = "all" | "info" | "warn" | "error";

/** The level control's segments, in order; each but All counts its own records. */
export const STREAM_LOG_LEVEL_FILTERS: readonly { levelFilter: StreamLogLevelFilter; label: string }[] = [
  { levelFilter: "all", label: "All" },
  { levelFilter: "info", label: "Info" },
  { levelFilter: "warn", label: "Warnings" },
  { levelFilter: "error", label: "Errors" },
];

/** The segment a record of `level` falls under: Warnings, Errors, or Info for every other level, trace, debug and an unknown one included. */
export function levelFilterOfLogRecord(level: string | null): Exclude<StreamLogLevelFilter, "all"> {
  const rank = rankLogLevel(level);
  if (rank === LOG_LEVEL_RANKS.warn) return "warn";
  if (rank === LOG_LEVEL_RANKS.error) return "error";
  return "info";
}

/** How a log line's level word reads: quiet for trace and debug, amber for warn, red for error, else plain. */
export type LogLevelWordTone = "quiet" | "plain" | "warn" | "error";

/** The tone of `level`'s word; a level this app does not know reads as plainly as info. */
export function presentLogLevelWord(level: string | null): LogLevelWordTone {
  const rank = rankLogLevel(level);
  if (rank <= LOG_LEVEL_RANKS.debug) return "quiet";
  if (rank === LOG_LEVEL_RANKS.warn) return "warn";
  if (rank === LOG_LEVEL_RANKS.error) return "error";
  return "plain";
}

function logLevelWordOf(level: string | null): string {
  return level === null ? "—" : level.toUpperCase();
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function dateOfHostTimestamp(hostTimestampNanoseconds: number): Date {
  return new Date(hostTimestampNanoseconds / 1_000_000);
}

/** `HH:MM:SS.mmm` in local time. */
export function formatLogRecordTime(hostTimestampNanoseconds: number | null): string {
  if (hostTimestampNanoseconds === null) return "--:--:--.---";
  const recordedAt = dateOfHostTimestamp(hostTimestampNanoseconds);
  return `${padNumber(recordedAt.getHours(), 2)}:${padNumber(recordedAt.getMinutes(), 2)}:${padNumber(
    recordedAt.getSeconds(),
    2,
  )}.${padNumber(recordedAt.getMilliseconds(), 3)}`;
}

/** `YYYY-MM-DD HH:MM:SS.mmm` in local time, for a record's details and the tooltip on its time. */
export function formatLogRecordDateAndTime(hostTimestampNanoseconds: number | null): string {
  if (hostTimestampNanoseconds === null) return "No timestamp";
  const recordedAt = dateOfHostTimestamp(hostTimestampNanoseconds);
  return `${recordedAt.getFullYear()}-${padNumber(recordedAt.getMonth() + 1, 2)}-${padNumber(recordedAt.getDate(), 2)} ${formatLogRecordTime(
    hostTimestampNanoseconds,
  )}`;
}

/** An attribute value as logfmt writes it: quoted when it is empty or holds a space, `=` or `"`. */
export function formatLogAttrValue(value: string): string {
  return value === "" || /[\s="]/.test(value) ? JSON.stringify(value) : value;
}

/** The step filter's key for the records the runtime wrote for the stream outside any step. */
const RUNTIME_STEP_KEY = "";

/** The step that wrote a record: its key in the step filter (its `processor_id`), and its name. */
export interface StreamLogRecordStep {
  stepKey: string;
  /** The step's name in the graph; `runtime` for a record outside any step; the id itself for a step the graph does not hold. */
  stepName: string;
  isAStepOfTheGraph: boolean;
}

/** Each step of `graph` by the `id` its log records name it by. */
function stepNamesByProcessorIdOf(graph: StreamGraphSummary | null): ReadonlyMap<string, string> {
  return new Map((graph?.nodes ?? []).filter((node) => node.id !== "").map((node) => [node.id, node.name]));
}

function stepOfLogRecord(record: StreamLogRecord, stepNamesByProcessorId: ReadonlyMap<string, string>): StreamLogRecordStep {
  if (record.processor_id === null) return { stepKey: RUNTIME_STEP_KEY, stepName: "runtime", isAStepOfTheGraph: false };
  const stepName = stepNamesByProcessorId.get(record.processor_id);
  return { stepKey: record.processor_id, stepName: stepName ?? record.processor_id, isAStepOfTheGraph: stepName !== undefined };
}

/** One `key=value` field of a record, its value written as logfmt writes it. */
export interface StreamLogRecordField {
  key: string;
  valueText: string;
}

function fieldsOfLogRecord(record: StreamLogRecord): StreamLogRecordField[] {
  return Object.entries(record.attrs).map(([key, value]) => ({ key, valueText: formatLogAttrValue(value) }));
}

/** What narrows the Logs tab's rows: search text, a level, the steps chosen (none chosen shows every step), and the records cleared. */
export interface StreamLogFilters {
  searchText: string;
  levelFilter: StreamLogLevelFilter;
  shownStepKeys: ReadonlySet<string>;
  /** Records numbered up to this one were cleared from the view; 0 when none were. */
  clearedThroughSequence: number;
}

/** What a run of a row's message line is, which decides its colour. */
export type StreamLogMessageLinePartKind = "message" | "separator" | "field_key" | "field_value";

/** A run of a row's message line: its message, then each field as `key=value`, two spaces before each. */
export interface StreamLogMessageLinePart {
  text: string;
  kind: StreamLogMessageLinePartKind;
}

/** One row of the Logs tab. */
export interface StreamLogRow {
  record: StreamLogRecord;
  timeText: string;
  dateAndTimeText: string;
  levelWord: string;
  levelTone: LogLevelWordTone;
  step: StreamLogRecordStep;
  messageLineParts: StreamLogMessageLinePart[];
  /** `Tuesday, October 20` above the first row of each day while the rows span more than one; `null` otherwise. */
  dayDividerWords: string | null;
}

/** One choice of the step filter. */
export interface StreamLogStepChoice {
  stepKey: string;
  stepName: string;
  /** The step's class, `not in the graph`, or `tatolabd` for the runtime. */
  stepHint: string;
}

/** One segment of the level control: its level, its word, how many of the records the search and the steps let through it counts, and the colour of its word. */
export interface StreamLogLevelFilterChoice {
  levelFilter: StreamLogLevelFilter;
  label: string;
  count: number;
  /** Warnings amber and Errors red while they count any; plain otherwise. */
  labelTone: "plain" | "warn" | "error";
}

/** What the Logs tab shows of the records held. */
export interface StreamLogPresentation {
  rows: StreamLogRow[];
  levelFilterChoices: StreamLogLevelFilterChoice[];
  stepChoices: StreamLogStepChoice[];
  /** The step filter's words: `All steps`, the one step chosen, or `2 of 5`. */
  stepFilterWords: { words: string; isOneStepChosen: boolean };
  /** `113 lines`, or `12 of 113` while a filter hides some. */
  lineCountWords: string;
  /** Why no row shows; `null` while some do. */
  emptyWords: string | null;
}

function rowOfLogRecord(record: StreamLogRecord, stepNamesByProcessorId: ReadonlyMap<string, string>): StreamLogRow {
  return {
    record,
    timeText: formatLogRecordTime(record.host_ts_ns),
    dateAndTimeText: formatLogRecordDateAndTime(record.host_ts_ns),
    levelWord: logLevelWordOf(record.level),
    levelTone: presentLogLevelWord(record.level),
    step: stepOfLogRecord(record, stepNamesByProcessorId),
    messageLineParts: [
      { text: record.message, kind: "message" },
      ...fieldsOfLogRecord(record).flatMap((field): StreamLogMessageLinePart[] => [
        { text: "  ", kind: "separator" },
        { text: `${field.key}=`, kind: "field_key" },
        { text: field.valueText, kind: "field_value" },
      ]),
    ],
    dayDividerWords: null,
  };
}

function localDayOfHostTimestamp(hostTimestampNanoseconds: number | null): string | null {
  return hostTimestampNanoseconds === null ? null : dateOfHostTimestamp(hostTimestampNanoseconds).toDateString();
}

/** `rows` with a day divider above the first row of each local day, when they span more than one. */
function rowsWithDayDividers(rows: StreamLogRow[]): StreamLogRow[] {
  const days = new Set(rows.map((row) => localDayOfHostTimestamp(row.record.host_ts_ns)).filter((day) => day !== null));
  if (days.size < 2) return rows;
  let previousDay: string | null = null;
  return rows.map((row) => {
    const day = localDayOfHostTimestamp(row.record.host_ts_ns);
    if (day === null || day === previousDay) return row;
    previousDay = day;
    return {
      ...row,
      dayDividerWords: dateOfHostTimestamp(row.record.host_ts_ns ?? 0).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    };
  });
}

/** Where `searchText` matches `text`, ignoring case and the search's own leading and trailing spaces, as `[start, end)` pairs that do not overlap. */
export function searchMatchRangesOf(text: string, searchText: string): [number, number][] {
  const lowercaseSearchText = searchText.trim().toLowerCase();
  if (lowercaseSearchText === "") return [];
  const lowercaseText = text.toLowerCase();
  const matchRanges: [number, number][] = [];
  for (let matchAt = lowercaseText.indexOf(lowercaseSearchText); matchAt !== -1; matchAt = lowercaseText.indexOf(lowercaseSearchText, matchAt + lowercaseSearchText.length)) {
    matchRanges.push([matchAt, matchAt + lowercaseSearchText.length]);
  }
  return matchRanges;
}

/** A row's message line as it reads: its message and fields, as the row shows them. */
function messageLineTextOf(row: StreamLogRow): string {
  return row.messageLineParts.map((part) => part.text).join("");
}

/** Whether `searchText` matches a row's step or its message line, each as the row shows it, so whatever matches is what the row marks. */
function rowMatchesSearch(row: StreamLogRow, searchText: string): boolean {
  if (searchText.trim() === "") return true;
  return searchMatchRangesOf(row.step.stepName, searchText).length > 0 || searchMatchRangesOf(messageLineTextOf(row), searchText).length > 0;
}

/** The class a step's type names, such as `PersonDetector` of `nodes.person_detector:PersonDetector`. */
function classNameOfStepType(stepType: string): string {
  return stepType.slice(stepType.lastIndexOf(":") + 1);
}

function stepChoicesOfRows(rows: readonly StreamLogRow[], graph: StreamGraphSummary | null): StreamLogStepChoice[] {
  const stepKeysNamed = new Set(rows.map((row) => row.step.stepKey));
  const graphStepChoices = (graph?.nodes ?? [])
    .filter((node) => stepKeysNamed.has(node.id))
    .map((node) => ({ stepKey: node.id, stepName: node.name, stepHint: classNameOfStepType(node.type) }));
  const stepsNotInTheGraph = [...stepKeysNamed]
    .filter((stepKey) => stepKey !== RUNTIME_STEP_KEY && !graphStepChoices.some((choice) => choice.stepKey === stepKey))
    .map((stepKey) => ({ stepKey, stepName: stepKey, stepHint: "not in the graph" }));
  const runtimeChoice = stepKeysNamed.has(RUNTIME_STEP_KEY) ? [{ stepKey: RUNTIME_STEP_KEY, stepName: "runtime", stepHint: "tatolabd" }] : [];
  return [...graphStepChoices, ...stepsNotInTheGraph, ...runtimeChoice];
}

/** The rows, counts and step choices of `records`, oldest first, narrowed by `filters`, with each step named from `graph`. */
export function presentStreamLog(records: readonly StreamLogRecord[], graph: StreamGraphSummary | null, filters: StreamLogFilters): StreamLogPresentation {
  const stepNamesByProcessorId = stepNamesByProcessorIdOf(graph);
  const rowsNotCleared = records.filter((record) => record.sequence > filters.clearedThroughSequence).map((record) => rowOfLogRecord(record, stepNamesByProcessorId));
  const rowsOfTheStepsSearched = rowsNotCleared.filter(
    (row) => (filters.shownStepKeys.size === 0 || filters.shownStepKeys.has(row.step.stepKey)) && rowMatchesSearch(row, filters.searchText),
  );
  const countsByLevelFilter: Record<StreamLogLevelFilter, number> = { all: rowsOfTheStepsSearched.length, info: 0, warn: 0, error: 0 };
  for (const row of rowsOfTheStepsSearched) countsByLevelFilter[levelFilterOfLogRecord(row.record.level)] += 1;
  const rows = rowsWithDayDividers(
    filters.levelFilter === "all" ? rowsOfTheStepsSearched : rowsOfTheStepsSearched.filter((row) => levelFilterOfLogRecord(row.record.level) === filters.levelFilter),
  );
  let emptyWords: string | null = null;
  if (rows.length === 0) {
    if (records.length === 0) emptyWords = "No log records yet. New ones show up here as the stream writes them.";
    else if (rowsNotCleared.length === 0) emptyWords = "Cleared. New lines appear here.";
    else emptyWords = "No lines match.";
  }
  const stepChoices = stepChoicesOfRows(rowsNotCleared, graph);
  const onlyStepChosen = filters.shownStepKeys.size === 1 ? stepChoices.find((stepChoice) => filters.shownStepKeys.has(stepChoice.stepKey)) : undefined;
  return {
    rows,
    levelFilterChoices: STREAM_LOG_LEVEL_FILTERS.map(({ levelFilter, label }) => {
      const count = countsByLevelFilter[levelFilter];
      return { levelFilter, label, count, labelTone: count > 0 && (levelFilter === "warn" || levelFilter === "error") ? levelFilter : "plain" };
    }),
    stepChoices,
    stepFilterWords: {
      words:
        filters.shownStepKeys.size === 0
          ? "All nodes"
          : onlyStepChosen !== undefined
            ? onlyStepChosen.stepName
            : `${filters.shownStepKeys.size} of ${stepChoices.length}`,
      isOneStepChosen: onlyStepChosen !== undefined,
    },
    lineCountWords: rows.length === rowsNotCleared.length ? countLabel(rows.length, "line", "lines") : `${rows.length.toLocaleString("en-US")} of ${rowsNotCleared.length.toLocaleString("en-US")}`,
    emptyWords,
  };
}

/** The rows' records as the runtime's JSONL, one line each, for Copy. */
export function jsonlOfStreamLogRows(rows: readonly StreamLogRow[]): string {
  return rows.map((row) => row.record.jsonl_line).join("\n");
}

/** What the details panel shows of the selected record. */
export interface StreamLogRecordDetails {
  levelWord: string;
  levelTone: LogLevelWordTone;
  message: string;
  dateAndTimeText: string;
  step: StreamLogRecordStep;
  /** Which process wrote it: the runtime's own, or the step's own helper process. */
  processWords: "runtime" | "own process";
  fields: StreamLogRecordField[];
  /** The fields as the row writes them, `key=value` two spaces apart, for Copy fields. */
  fieldsTextToCopy: string;
  /** The record as the runtime wrote it, pretty-printed with every digit kept. */
  recordJsonLines: string[];
  /** The record as one JSONL line, for Copy. */
  jsonlLine: string;
}

/** The selected record's details, its step named from `graph`. */
export function presentStreamLogRecordDetails(record: StreamLogRecord, graph: StreamGraphSummary | null): StreamLogRecordDetails {
  const stepNamesByProcessorId = stepNamesByProcessorIdOf(graph);
  const fieldsOfTheRecord = fieldsOfLogRecord(record);
  return {
    levelWord: logLevelWordOf(record.level),
    levelTone: presentLogLevelWord(record.level),
    message: record.message,
    dateAndTimeText: formatLogRecordDateAndTime(record.host_ts_ns),
    step: stepOfLogRecord(record, stepNamesByProcessorId),
    processWords: record.sent_by_its_own_process ? "own process" : "runtime",
    fields: fieldsOfTheRecord,
    fieldsTextToCopy: fieldsOfTheRecord.map((field) => `${field.key}=${field.valueText}`).join("  "),
    recordJsonLines: prettyJsonLinesOf(record.jsonl_line),
    jsonlLine: record.jsonl_line,
  };
}

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g;

/** Compact JSON text laid out two spaces an indent, rewriting no token, so every number keeps the digits it was written in. */
export function prettyJsonLinesOf(jsonText: string): string[] {
  const tokens = [...jsonText.matchAll(JSON_TOKEN)].map((tokenMatch) => tokenMatch[0]);
  const lines: string[] = [];
  let currentLine = "";
  let depth = 0;
  const endTheLine = () => {
    lines.push(currentLine);
    currentLine = "  ".repeat(depth);
  };
  tokens.forEach((token, tokenIndex) => {
    const nextToken = tokens[tokenIndex + 1];
    if (token === "{" || token === "[") {
      const closingToken = token === "{" ? "}" : "]";
      if (nextToken === closingToken) {
        currentLine += token;
        return;
      }
      currentLine += token;
      depth += 1;
      endTheLine();
    } else if (token === "}" || token === "]") {
      const previousToken = tokens[tokenIndex - 1];
      if (previousToken === "{" || previousToken === "[") {
        currentLine += token;
        return;
      }
      depth -= 1;
      endTheLine();
      currentLine += token;
    } else if (token === ",") {
      currentLine += token;
      endTheLine();
    } else if (token === ":") {
      currentLine += ": ";
    } else {
      currentLine += token;
    }
  });
  if (currentLine.trim() !== "") lines.push(currentLine);
  return lines;
}

/** Whether the pointer row to the records not held shows: while some are not held, nothing is cleared and nothing is searched for. */
export function isEarlierRecordsPointerShown(earlierRecordsNotHeldCount: number, filters: StreamLogFilters): boolean {
  return earlierRecordsNotHeldCount > 0 && filters.clearedThroughSequence === 0 && filters.searchText.trim() === "";
}

/** The pointer row's words before the log folder: `2,312 earlier records are in`. */
export function earlierRecordsNotHeldWords(earlierRecordsNotHeldCount: number): string {
  return countLabel(earlierRecordsNotHeldCount, "earlier record is in", "earlier records are in");
}

/** The folder the runtime writes a stream's log segments into, under its project, the home folder shortened, for display. */
export function logFolderPathOfStream(projectDirectory: string): string {
  return `${abbreviateHomeDirectory(projectDirectory)}/${STREAM_LOG_FOLDER_IN_THE_PROJECT}/`;
}

/** The toolbar's words for which load of the stream the records are from: `Load #5` for a numbered one, else the instance as the runtime names it. */
export function streamLoadWords(streamInstance: string): string {
  return /^\d+$/.test(streamInstance) ? `Load #${streamInstance}` : `Load ${streamInstance}`;
}

/** What the Logs tab of a stream that is not loaded says. */
export interface StreamLogsOfAStreamNotLoaded {
  hasFailed: boolean;
  title: string;
  /** A failed stream's reason in the runtime's words; else why there are no records to show. */
  explanation: string;
}

/** The Logs tab's words for `stream` while it is not loaded. */
export function presentStreamLogsOfAStreamNotLoaded(stream: ListedStream): StreamLogsOfAStreamNotLoaded {
  const notLoadedReason = streamNotLoadedReason(stream);
  if (notLoadedReason === "failed") return { hasFailed: true, title: "Failed to load", explanation: stream.failed_because ?? "The runtime gave no reason." };
  if (notLoadedReason === "loading") return { hasFailed: false, title: "Loading", explanation: "Its records show here once the runtime has loaded it." };
  return {
    hasFailed: false,
    title: "Not loaded",
    explanation: "The runtime holds records only for a loaded stream. Everything it wrote is in the stream's log folder.",
  };
}
