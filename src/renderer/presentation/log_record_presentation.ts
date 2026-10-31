import { PROJECT_LOG_FOLDER_IN_THE_PROJECT, type StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import type { HeldProjectLogRecord } from "../project_log_readings";
import { abbreviateHomeDirectory } from "./stream_presentation";

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

function stepOfLogRecord(record: HeldProjectLogRecord, stepNamesByProcessorId: ReadonlyMap<string, string>): StreamLogRecordStep {
  if (record.processor_id === null) return { stepKey: RUNTIME_STEP_KEY, stepName: "runtime", isAStepOfTheGraph: false };
  const stepName = stepNamesByProcessorId.get(record.processor_id);
  return { stepKey: record.processor_id, stepName: stepName ?? record.processor_id, isAStepOfTheGraph: stepName !== undefined };
}

/** One `key=value` field of a record, its value written as logfmt writes it. */
export interface StreamLogRecordField {
  key: string;
  valueText: string;
}

function fieldsOfLogRecord(record: HeldProjectLogRecord): StreamLogRecordField[] {
  return Object.entries(record.attrs).map(([key, value]) => ({ key, valueText: formatLogAttrValue(value) }));
}

/** What narrows the Logs tab's rows: search text, a level, the steps chosen (none chosen shows every step), one stream, one stream action, and the records cleared. */
export interface StreamLogFilters {
  searchText: string;
  levelFilter: StreamLogLevelFilter;
  shownStepKeys: ReadonlySet<string>;
  /** The key of the one stream whose records show, the project's own records under their own key; `null` shows every stream's. */
  shownStreamKey: string | null;
  /** The key of the one stream action whose records show; `null` shows every action's. */
  shownActionKey: string | null;
  /** Records held up to this position were cleared from the view; 0 when none were. */
  clearedThroughPosition: number;
}

/** The action filter's key for the records that name no stream action. */
const NO_ACTION_KEY = "";

/** What the records that name no stream action show under, such as those a stream writes while it runs. */
const NOT_UNDER_A_STREAM_ACTION_WORDS = "Not under a stream action";

/** The action filter's words while the action chosen has no record left in view. */
const ONE_ACTION_NO_LONGER_HELD_WORDS = "One action";

function actionKeyOfLogRecord(record: HeldProjectLogRecord): string {
  return record.action ?? NO_ACTION_KEY;
}

/** The stream filter's key for the records of the project's own, such as the venv's making and the compile. */
export const PROJECT_OWN_RECORDS_STREAM_KEY = "";

/** What the project's own records show under in the stream filter. */
export const PROJECT_OWN_RECORDS_WORDS = "The project itself";

function streamKeyOfLogRecord(record: HeldProjectLogRecord): string {
  return record.stream ?? PROJECT_OWN_RECORDS_STREAM_KEY;
}

/** One choice of the stream filter: a stream the records name, or the project's own records. */
export interface StreamLogStreamChoice {
  streamKey: string;
  /** The stream's display name as the runtime lists it, its id once it is no longer listed, or `The project itself`. */
  streamWords: string;
}

/** One choice of the action filter: a stream action the records name. */
export interface StreamLogActionChoice {
  actionKey: string;
  /** `Action at HH:MM:SS`, when its first record held was written, or `Not under a stream action` for the records that name none. */
  actionWords: string;
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
  record: HeldProjectLogRecord;
  timeText: string;
  dateAndTimeText: string;
  levelWord: string;
  levelTone: LogLevelWordTone;
  step: StreamLogRecordStep;
  messageLineParts: StreamLogMessageLinePart[];
  /** `Tuesday, October 20` above the first row of each day while the rows span more than one; `null` otherwise. */
  dayDividerWords: string | null;
  /** The action's words above the first row of each run of one stream action while the rows hold more than one action; `null` otherwise. */
  actionDividerWords: string | null;
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
  /** Each stream action the records not cleared name, in the order their first records were written. */
  actionChoices: StreamLogActionChoice[];
  /** The action filter's words: `All actions`, or the one chosen. */
  actionFilterWords: string;
  /** Each stream the records not cleared name, in the order their first records were written, the project's own records among them. */
  streamChoices: StreamLogStreamChoice[];
  /** The stream filter's words: `All streams`, or the one chosen. */
  streamFilterWords: string;
  /** The step filter's words: `All steps`, the one step chosen, or `2 of 5`. */
  stepFilterWords: { words: string; isOneStepChosen: boolean };
  /** Why no row shows; `null` while some do. */
  emptyWords: string | null;
}

function rowOfLogRecord(record: HeldProjectLogRecord, stepNamesByProcessorId: ReadonlyMap<string, string>): StreamLogRow {
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
    actionDividerWords: null,
  };
}

/** `Action at HH:MM:SS`, local time, from when an action's first record held was written; `Action` for a record with no timestamp. */
function actionWordsOfItsFirstRecord(firstRecord: HeldProjectLogRecord): string {
  if (firstRecord.host_ts_ns === null) return "Action";
  const writtenAt = dateOfHostTimestamp(firstRecord.host_ts_ns);
  return `Action at ${padNumber(writtenAt.getHours(), 2)}:${padNumber(writtenAt.getMinutes(), 2)}:${padNumber(writtenAt.getSeconds(), 2)}`;
}

/** `rows` with an action divider above the first row of each run of one stream action, when they hold more than one. */
function rowsWithActionDividers(rows: StreamLogRow[], actionWordsByActionKey: ReadonlyMap<string, string>): StreamLogRow[] {
  if (new Set(rows.map((row) => actionKeyOfLogRecord(row.record))).size < 2) return rows;
  let previousActionKey: string | null = null;
  return rows.map((row) => {
    const actionKey = actionKeyOfLogRecord(row.record);
    if (actionKey === previousActionKey) return row;
    previousActionKey = actionKey;
    return { ...row, actionDividerWords: actionWordsByActionKey.get(actionKey) ?? NOT_UNDER_A_STREAM_ACTION_WORDS };
  });
}

/** Each action the rows name, in the order its first record was written; two actions begun in the same second read `(2)`, `(3)` after the first. */
function actionChoicesOfRows(rows: readonly StreamLogRow[]): StreamLogActionChoice[] {
  const actionChoices = new Map<string, StreamLogActionChoice>();
  const actionsByTheirWords = new Map<string, number>();
  for (const row of rows) {
    const actionKey = actionKeyOfLogRecord(row.record);
    if (actionChoices.has(actionKey)) continue;
    if (actionKey === NO_ACTION_KEY) {
      actionChoices.set(actionKey, { actionKey, actionWords: NOT_UNDER_A_STREAM_ACTION_WORDS });
      continue;
    }
    const actionWords = actionWordsOfItsFirstRecord(row.record);
    const actionsWithTheseWords = (actionsByTheirWords.get(actionWords) ?? 0) + 1;
    actionsByTheirWords.set(actionWords, actionsWithTheseWords);
    actionChoices.set(actionKey, { actionKey, actionWords: actionsWithTheseWords === 1 ? actionWords : `${actionWords} (${actionsWithTheseWords})` });
  }
  return [...actionChoices.values()];
}

function streamChoicesOfRows(rows: readonly StreamLogRow[], displayNamesByStreamId: ReadonlyMap<string, string>): StreamLogStreamChoice[] {
  const streamChoices = new Map<string, StreamLogStreamChoice>();
  for (const row of rows) {
    const streamKey = streamKeyOfLogRecord(row.record);
    if (streamChoices.has(streamKey)) continue;
    streamChoices.set(streamKey, {
      streamKey,
      streamWords: streamKey === PROJECT_OWN_RECORDS_STREAM_KEY ? PROJECT_OWN_RECORDS_WORDS : (displayNamesByStreamId.get(streamKey) ?? streamKey),
    });
  }
  return [...streamChoices.values()];
}

function streamFilterWordsOf(shownStreamKey: string | null, displayNamesByStreamId: ReadonlyMap<string, string>): string {
  if (shownStreamKey === null) return "All streams";
  if (shownStreamKey === PROJECT_OWN_RECORDS_STREAM_KEY) return PROJECT_OWN_RECORDS_WORDS;
  return displayNamesByStreamId.get(shownStreamKey) ?? shownStreamKey;
}

/** The stream action that failed a stream, from its records: the action of its last error, else of its last record; `null` with no records. */
export function actionKeyOfTheLastFailure(records: readonly HeldProjectLogRecord[]): string | null {
  const lastRecordOfTheFailure = [...records].reverse().find((record) => levelFilterOfLogRecord(record.level) === "error") ?? records.at(-1);
  return lastRecordOfTheFailure === undefined ? null : actionKeyOfLogRecord(lastRecordOfTheFailure);
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

/** The rows, counts and choices of `records`, oldest first, narrowed by `filters`, with each step named from `graph` and each stream by its listed display name. */
export function presentStreamLog(
  records: readonly HeldProjectLogRecord[],
  graph: StreamGraphSummary | null,
  filters: StreamLogFilters,
  displayNamesByStreamId: ReadonlyMap<string, string> = new Map(),
): StreamLogPresentation {
  const stepNamesByProcessorId = stepNamesByProcessorIdOf(graph);
  const rowsNotCleared = records.filter((record) => record.position > filters.clearedThroughPosition).map((record) => rowOfLogRecord(record, stepNamesByProcessorId));
  const rowsOfTheStepsSearched = rowsNotCleared.filter(
    (row) =>
      (filters.shownStepKeys.size === 0 || filters.shownStepKeys.has(row.step.stepKey)) &&
      (filters.shownActionKey === null || actionKeyOfLogRecord(row.record) === filters.shownActionKey) &&
      (filters.shownStreamKey === null || streamKeyOfLogRecord(row.record) === filters.shownStreamKey) &&
      rowMatchesSearch(row, filters.searchText),
  );
  const actionChoices = actionChoicesOfRows(rowsNotCleared);
  const actionWordsByActionKey = new Map(actionChoices.map((actionChoice) => [actionChoice.actionKey, actionChoice.actionWords]));
  const streamChoices = streamChoicesOfRows(rowsNotCleared, displayNamesByStreamId);
  const countsByLevelFilter: Record<StreamLogLevelFilter, number> = { all: rowsOfTheStepsSearched.length, info: 0, warn: 0, error: 0 };
  for (const row of rowsOfTheStepsSearched) countsByLevelFilter[levelFilterOfLogRecord(row.record.level)] += 1;
  const rows = rowsWithActionDividers(
    rowsWithDayDividers(
      filters.levelFilter === "all" ? rowsOfTheStepsSearched : rowsOfTheStepsSearched.filter((row) => levelFilterOfLogRecord(row.record.level) === filters.levelFilter),
    ),
    actionWordsByActionKey,
  );
  let emptyWords: string | null = null;
  if (rows.length === 0) {
    if (records.length === 0) emptyWords = "No log records yet. New ones show up here as they are written.";
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
    actionChoices,
    actionFilterWords: filters.shownActionKey === null ? "All actions" : (actionWordsByActionKey.get(filters.shownActionKey) ?? ONE_ACTION_NO_LONGER_HELD_WORDS),
    streamChoices,
    streamFilterWords: streamFilterWordsOf(filters.shownStreamKey, displayNamesByStreamId),
    stepFilterWords: {
      words:
        filters.shownStepKeys.size === 0
          ? "All nodes"
          : onlyStepChosen !== undefined
            ? onlyStepChosen.stepName
            : `${filters.shownStepKeys.size} of ${stepChoices.length}`,
      isOneStepChosen: onlyStepChosen !== undefined,
    },
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
  /** The display name of the stream that wrote it, its id while the listing holds no such stream, or `None, the project wrote it`. */
  streamWords: string;
  /** The words of the stream action it was written under, as the action filter offers it. */
  actionWords: string;
  fields: StreamLogRecordField[];
  /** The fields as the row writes them, `key=value` two spaces apart, for Copy fields. */
  fieldsTextToCopy: string;
  /** The record as the runtime wrote it, pretty-printed with every digit kept. */
  recordJsonLines: string[];
  /** The record as one JSONL line, for Copy. */
  jsonlLine: string;
}

/** What names the source of a record in its details: the listing's display names by stream id, and the action filter's choices. */
export interface StreamLogRecordSourceNames {
  displayNamesByStreamId: ReadonlyMap<string, string>;
  actionChoices: readonly StreamLogActionChoice[];
}

const RECORD_OF_NO_STREAM_WORDS = "None, the project wrote it";

/** The selected record's details, its step named from `graph`, its stream and action from `sourceNames`. */
export function presentStreamLogRecordDetails(
  record: HeldProjectLogRecord,
  graph: StreamGraphSummary | null,
  sourceNames: StreamLogRecordSourceNames,
): StreamLogRecordDetails {
  const actionKey = actionKeyOfLogRecord(record);
  const stepNamesByProcessorId = stepNamesByProcessorIdOf(graph);
  const fieldsOfTheRecord = fieldsOfLogRecord(record);
  return {
    levelWord: logLevelWordOf(record.level),
    levelTone: presentLogLevelWord(record.level),
    message: record.message,
    dateAndTimeText: formatLogRecordDateAndTime(record.host_ts_ns),
    step: stepOfLogRecord(record, stepNamesByProcessorId),
    streamWords: record.stream === null ? RECORD_OF_NO_STREAM_WORDS : (sourceNames.displayNamesByStreamId.get(record.stream) ?? record.stream),
    actionWords:
      sourceNames.actionChoices.find((actionChoice) => actionChoice.actionKey === actionKey)?.actionWords ??
      (actionKey === NO_ACTION_KEY ? NOT_UNDER_A_STREAM_ACTION_WORDS : ONE_ACTION_NO_LONGER_HELD_WORDS),
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
export function isEarlierRecordsPointerShown(areEarlierRecordsNotHeld: boolean, filters: StreamLogFilters): boolean {
  return areEarlierRecordsNotHeld && filters.clearedThroughPosition === 0 && filters.searchText.trim() === "";
}

/** The pointer row's words before the log folder. */
export const EARLIER_RECORDS_NOT_HELD_WORDS = "Earlier records are in";

/** The folder the runtime writes a project's log segments into, the home folder shortened, for display. */
export function logFolderPathOfProject(projectDirectory: string): string {
  return `${abbreviateHomeDirectory(projectDirectory)}/${PROJECT_LOG_FOLDER_IN_THE_PROJECT}/`;
}
