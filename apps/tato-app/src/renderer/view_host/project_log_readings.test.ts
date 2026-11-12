import { expect, test } from "vitest";
import type { ProjectLogRecord, ProjectLogRecordsPage } from "../../shared/tatolab_backend_contract";
import { PROJECT_LOG_RECORDS_HELD, ProjectLogReadings } from "./project_log_readings";
import type { ProjectLogReading } from "./studio_view_contract";

const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";
const ANOTHER_PROJECT_FOLDER = "/home/jonathanf/streams/lobby";

function record(message: string): ProjectLogRecord {
  return { host_ts_ns: null, level: "info", source: "rust", target: null, message, attrs: {}, processor_id: null, sent_by_its_own_process: false, action: null, stream: null, jsonl_line: "{}" };
}

/** A project log of `log.records`, served two records a page after a numeric cursor, or refused in `log.refusal`; it records each read and follow, and pushes a write with `pushTheLogWritten`. */
function pagingBackend() {
  const log: { records: ProjectLogRecord[]; refusal: string | null } = { records: [], refusal: null };
  const cursorsAsked: (string | null)[] = [];
  const projectsFollowed = new Set<string>();
  const projectLogRecordsWrittenListeners = new Set<(projectDirectory: string) => void>();
  const backend = {
    readProjectLogRecords: (_projectFolder: string, _narrowing: unknown, after: string | null): Promise<ProjectLogRecordsPage> => {
      cursorsAsked.push(after);
      if (log.refusal !== null) return Promise.reject(log.refusal);
      const from = after === null ? 0 : Number(after);
      const records = log.records.slice(from, from + 2);
      return Promise.resolve({ project_directory: PROJECT_FOLDER, records, next_after: String(from + records.length), records_no_longer_held: false });
    },
    followProjectLogRecords: async (projectDirectory: string) => {
      projectsFollowed.add(projectDirectory);
    },
    stopFollowingProjectLogRecords: async (projectDirectory: string) => {
      projectsFollowed.delete(projectDirectory);
    },
    onProjectLogRecordsWritten: (listener: (projectDirectory: string) => void) => {
      projectLogRecordsWrittenListeners.add(listener);
      return () => projectLogRecordsWrittenListeners.delete(listener);
    },
  };
  const pushTheLogWritten = (projectDirectory: string): void => {
    for (const listener of projectLogRecordsWrittenListeners) listener(projectDirectory);
  };
  return { backend, log, cursorsAsked, projectsFollowed, pushTheLogWritten };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
}

function messagesOf(seen: ProjectLogReading[]): (string[] | string)[] {
  return seen.map((reading) => (reading.kind === "read" ? reading.records.map((held) => held.message) : reading.because));
}

test("a_watched_log_is_read_at_once_and_read_on_from_its_cursor_on_each_pushed_write", async () => {
  const { backend, log, cursorsAsked, projectsFollowed, pushTheLogWritten } = pagingBackend();
  log.records = [record("one"), record("two"), record("three")];
  const readings = new ProjectLogReadings(backend);
  const seen: ProjectLogReading[] = [];

  const stop = readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  await settle();
  log.records.push(record("four"));
  pushTheLogWritten(ANOTHER_PROJECT_FOLDER);
  await settle();
  const cursorsAskedBeforeThePush = cursorsAsked.length;
  pushTheLogWritten(PROJECT_FOLDER);
  await settle();
  stop();

  expect(cursorsAskedBeforeThePush).toBe(3);
  expect(cursorsAsked.slice(cursorsAskedBeforeThePush)).toEqual(["3", "4"]);
  expect(messagesOf(seen)).toEqual([
    ["one", "two", "three"],
    ["one", "two", "three", "four"],
  ]);
  expect(projectsFollowed).toEqual(new Set());
});

test("writes_pushed_during_a_read_are_read_in_one_more_read_after_it", async () => {
  const { backend, log, cursorsAsked, pushTheLogWritten } = pagingBackend();
  const readings = new ProjectLogReadings(backend);
  readings.watchProjectLog(PROJECT_FOLDER, () => undefined);
  log.records = [record("one")];

  pushTheLogWritten(PROJECT_FOLDER);
  pushTheLogWritten(PROJECT_FOLDER);
  pushTheLogWritten(PROJECT_FOLDER);
  await settle();

  expect(cursorsAsked).toEqual([null, "0", "1"]);
});

test("a_refused_read_is_told_in_the_runtimes_words_and_a_hidden_window_neither_reads_nor_follows", async () => {
  const { backend, log, cursorsAsked, projectsFollowed, pushTheLogWritten } = pagingBackend();
  log.refusal = "The runtime lists no stream from /home/jonathanf/streams/pattern.";
  const readings = new ProjectLogReadings(backend);
  readings.setReadingAllowed(false);
  const seen: ProjectLogReading[] = [];

  readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  pushTheLogWritten(PROJECT_FOLDER);
  await settle();
  expect(cursorsAsked).toEqual([]);
  expect(projectsFollowed).toEqual(new Set());
  readings.setReadingAllowed(true);
  await settle();

  expect(projectsFollowed).toEqual(new Set([PROJECT_FOLDER]));
  expect(seen).toEqual([{ kind: "not_read", because: "The runtime lists no stream from /home/jonathanf/streams/pattern." }]);
});

test("a_long_log_is_read_to_its_end_in_several_reads_and_a_reading_holds_only_the_latest_records", async () => {
  const { backend, log } = pagingBackend();
  log.records = Array.from({ length: PROJECT_LOG_RECORDS_HELD + 4 }, (_, index) => record(`r${index}`));
  const readings = new ProjectLogReadings(backend);
  const seen: ProjectLogReading[] = [];

  readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  for (let read = 0; read < 20; read += 1) await settle();

  const latest = seen.at(-1);
  const held = latest?.kind === "read" ? latest.records : [];
  expect(held).toHaveLength(PROJECT_LOG_RECORDS_HELD);
  expect(held.at(-1)?.message).toBe(`r${PROJECT_LOG_RECORDS_HELD + 3}`);
});
