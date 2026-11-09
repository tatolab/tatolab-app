import { afterEach, expect, test, vi } from "vitest";
import type { ProjectLogRecord, ProjectLogRecordsPage } from "../../shared/tatolab_backend_contract";
import { PROJECT_LOG_RECORDS_HELD, ProjectLogReadings } from "./project_log_readings";
import type { ProjectLogReading } from "./studio_view_contract";

afterEach(() => {
  vi.useRealTimers();
});

const POLL_MILLISECONDS = 1000;
const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";

function record(message: string): ProjectLogRecord {
  return { host_ts_ns: null, level: "info", source: "rust", target: null, message, attrs: {}, processor_id: null, sent_by_its_own_process: false, action: null, stream: null, jsonl_line: "{}" };
}

/** A project log of `log.records`, served two records a page after a numeric cursor, or refused in `log.refusal`. */
function pagingBackend() {
  const log: { records: ProjectLogRecord[]; refusal: string | null } = { records: [], refusal: null };
  const cursorsAsked: (string | null)[] = [];
  const backend = {
    readProjectLogRecords: (_projectFolder: string, _narrowing: unknown, after: string | null): Promise<ProjectLogRecordsPage> => {
      cursorsAsked.push(after);
      if (log.refusal !== null) return Promise.reject(log.refusal);
      const from = after === null ? 0 : Number(after);
      const records = log.records.slice(from, from + 2);
      return Promise.resolve({ project_directory: PROJECT_FOLDER, records, next_after: String(from + records.length), records_no_longer_held: false });
    },
  };
  return { backend, log, cursorsAsked };
}

test("a_round_reads_every_page_after_the_cursor_and_tells_each_record_once", async () => {
  vi.useFakeTimers();
  const { backend, log } = pagingBackend();
  log.records = [record("one"), record("two"), record("three")];
  const readings = new ProjectLogReadings(backend, POLL_MILLISECONDS);
  const seen: ProjectLogReading[] = [];
  const stop = readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  log.records.push(record("four"));
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  stop();
  expect(seen.map((reading) => (reading.kind === "read" ? reading.records.map((held) => held.message) : reading.because))).toEqual([
    ["one", "two", "three"],
    ["one", "two", "three", "four"],
  ]);
});

test("a_refused_read_is_told_in_the_runtimes_words_and_a_hidden_window_reads_nothing", async () => {
  vi.useFakeTimers();
  const { backend, log, cursorsAsked } = pagingBackend();
  log.refusal = "The runtime lists no stream from /home/jonathanf/streams/pattern.";
  const readings = new ProjectLogReadings(backend, POLL_MILLISECONDS);
  readings.setPollingAllowed(false);
  const seen: ProjectLogReading[] = [];
  readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 3);
  expect(cursorsAsked).toEqual([]);
  readings.setPollingAllowed(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(seen).toEqual([{ kind: "not_read", because: "The runtime lists no stream from /home/jonathanf/streams/pattern." }]);
});

test("a_reading_holds_only_the_latest_records", async () => {
  vi.useFakeTimers();
  const { backend, log } = pagingBackend();
  log.records = Array.from({ length: PROJECT_LOG_RECORDS_HELD + 4 }, (_, index) => record(`r${index}`));
  const readings = new ProjectLogReadings(backend, POLL_MILLISECONDS);
  const seen: ProjectLogReading[] = [];
  readings.watchProjectLog(PROJECT_FOLDER, (reading) => seen.push(reading));
  for (let round = 0; round < 20; round += 1) await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  const latest = seen.at(-1);
  const held = latest?.kind === "read" ? latest.records : [];
  expect(held).toHaveLength(PROJECT_LOG_RECORDS_HELD);
  expect(held.at(-1)?.message).toBe(`r${PROJECT_LOG_RECORDS_HELD + 3}`);
});
