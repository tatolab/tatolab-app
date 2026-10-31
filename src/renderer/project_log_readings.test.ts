import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLogNarrowing, ProjectLogRecord, ProjectLogRecordsPage } from "../shared/tatolab_backend_contract";
import { ProjectLogReadings, type ProjectLogScope } from "./project_log_readings";

function logRecord(message: string): ProjectLogRecord {
  return {
    host_ts_ns: null,
    level: "info",
    source: "python",
    target: null,
    message,
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: true,
    action: "R1-2",
    stream: "pattern-main-d76f70",
    jsonl_line: JSON.stringify({ message }),
  };
}

function recordsPage(records: ProjectLogRecord[], nextAfter: string, recordsNoLongerHeld = false): ProjectLogRecordsPage {
  return { project_directory: "/p", records, next_after: nextAfter, records_no_longer_held: recordsNoLongerHeld };
}

const MAIN_STREAM: ProjectLogScope = { projectDirectory: "/p", stream: "pattern-main-d76f70" };
const WHOLE_PROJECT: ProjectLogScope = { projectDirectory: "/p", stream: null };

/** A backend answering each read with the next page or refusal queued, writing down what each read asked for. */
function backendAnswering(answers: (ProjectLogRecordsPage | string)[]) {
  const asked: { projectDirectory: string; narrowing: ProjectLogNarrowing; after: string | null }[] = [];
  const backend = {
    readProjectLogRecords: async (projectDirectory: string, narrowing: ProjectLogNarrowing, after: string | null): Promise<ProjectLogRecordsPage> => {
      asked.push({ projectDirectory, narrowing, after });
      const answer = answers.shift() ?? recordsPage([], after ?? "1:0");
      if (typeof answer === "string") throw answer;
      return answer;
    },
  };
  return { backend, asked };
}

const messagesOf = (readings: ProjectLogReadings, scope: ProjectLogScope = MAIN_STREAM) => readings.readingOf(scope).records.map((record) => record.message);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProjectLogReadings", () => {
  it("reads the shown scope from its first record, then on from each page's cursor every interval, numbering each record it holds", async () => {
    const { backend, asked } = backendAnswering([recordsPage([logRecord("first"), logRecord("second")], "1:200"), recordsPage([logRecord("third")], "1:300")]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    expect(asked).toEqual([]);

    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(messagesOf(readings)).toEqual(["first", "second"]);
    expect(readings.readingOf(MAIN_STREAM)).toMatchObject({ hasReadAPage: true, hasReadToTheNewestRecord: true });
    await vi.advanceTimersByTimeAsync(1000);

    expect(asked).toEqual([
      { projectDirectory: "/p", narrowing: { stream: "pattern-main-d76f70", action: null }, after: null },
      { projectDirectory: "/p", narrowing: { stream: "pattern-main-d76f70", action: null }, after: "1:200" },
    ]);
    expect(readings.readingOf(MAIN_STREAM).records.map((record) => record.position)).toEqual([1, 2, 3]);
  });

  it("reads the whole project with no stream named", async () => {
    const { backend, asked } = backendAnswering([recordsPage([logRecord("making the environment")], "1:90")]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(WHOLE_PROJECT);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(asked[0]?.narrowing).toEqual({ stream: null, action: null });
    expect(messagesOf(readings, WHOLE_PROJECT)).toEqual(["making the environment"]);
    expect(messagesOf(readings, MAIN_STREAM)).toEqual([]);
  });

  it("reads page after page in one poll while each page comes back full, and only then has read to the newest record", async () => {
    const fullPage = Array.from({ length: 500 }, (_, recordIndex) => logRecord(`r${recordIndex + 1}`));
    const answers: (ProjectLogRecordsPage | string)[] = [recordsPage(fullPage, "1:500")];
    const { backend, asked } = backendAnswering(answers);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(asked.map((ask) => ask.after)).toEqual([null, "1:500"]);
    expect(readings.readingOf(MAIN_STREAM).records).toHaveLength(500);
    expect(readings.readingOf(MAIN_STREAM).hasReadToTheNewestRecord).toBe(true);
  });

  it("marks earlier records not held when the log's retention deleted some", async () => {
    const { backend } = backendAnswering([recordsPage([logRecord("kept")], "4:10", true)]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(readings.readingOf(MAIN_STREAM).areEarlierRecordsNotHeld).toBe(true);
    expect(messagesOf(readings)).toEqual(["kept"]);
  });

  it("holds only the newest records past its limit and marks the earlier ones not held", async () => {
    const { backend } = backendAnswering([recordsPage([logRecord("a"), logRecord("b"), logRecord("c")], "1:3"), recordsPage([logRecord("d"), logRecord("e")], "1:5")]);
    const readings = new ProjectLogReadings(backend, 1000, 3);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readingOf(MAIN_STREAM).areEarlierRecordsNotHeld).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);

    expect(messagesOf(readings)).toEqual(["c", "d", "e"]);
    expect(readings.readingOf(MAIN_STREAM).areEarlierRecordsNotHeld).toBe(true);
  });

  it("keeps the records it holds through a refused read, shows the refusal in its own words, and clears it once a read answers", async () => {
    const refusal = "logs failed: Resource not found: this runtime holds no stream of the project in /p";
    const { backend } = backendAnswering([recordsPage([logRecord("kept")], "1:1"), refusal, recordsPage([], "1:1")]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(readings.readingOf(MAIN_STREAM).readRefusal).toBe(refusal);
    expect(messagesOf(readings)).toEqual(["kept"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readings.readingOf(MAIN_STREAM).readRefusal).toBeNull();
  });

  it("reads nothing while polling is not allowed, or while no scope is shown", async () => {
    const { backend, asked } = backendAnswering([]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    await vi.advanceTimersByTimeAsync(5000);
    readings.showProjectLog(null);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(5000);

    expect(asked).toEqual([]);
  });

  it("drops what it held of a scope once another is shown, and a page that settles after it changed", async () => {
    let answerTheSlowRead: (page: ProjectLogRecordsPage) => void = () => {};
    const askedStreams: (string | null)[] = [];
    const backend = {
      readProjectLogRecords: (_projectDirectory: string, narrowing: ProjectLogNarrowing): Promise<ProjectLogRecordsPage> => {
        askedStreams.push(narrowing.stream);
        if (narrowing.stream !== null) return new Promise((resolve) => (answerTheSlowRead = resolve));
        return Promise.resolve(recordsPage([logRecord("the project's")], "1:1"));
      },
    };
    const readings = new ProjectLogReadings(backend, 1000);
    const heardChanges = vi.fn();
    readings.subscribeToReadings(heardChanges);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.showProjectLog(WHOLE_PROJECT);
    answerTheSlowRead(recordsPage([logRecord("the stream's, too late")], "1:1"));
    await vi.advanceTimersByTimeAsync(0);

    expect(askedStreams).toEqual(["pattern-main-d76f70", null]);
    expect(messagesOf(readings, MAIN_STREAM)).toEqual([]);
    expect(messagesOf(readings, WHOLE_PROJECT)).toEqual(["the project's"]);
    expect(heardChanges).toHaveBeenCalled();
  });

  it("reads a scope shown again from its first record, dropping a page asked before", async () => {
    const answersInFlight: ((page: ProjectLogRecordsPage) => void)[] = [];
    const asked: string[] = [];
    const backend = {
      readProjectLogRecords: (_projectDirectory: string, narrowing: ProjectLogNarrowing, after: string | null): Promise<ProjectLogRecordsPage> => {
        asked.push(`${narrowing.stream ?? "project"}:${after ?? "first"}`);
        if (narrowing.stream === null) return Promise.resolve(recordsPage([], "1:0"));
        return new Promise((resolve) => answersInFlight.push(resolve));
      },
    };
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.showProjectLog(WHOLE_PROJECT);
    readings.showProjectLog(MAIN_STREAM);
    answersInFlight.shift()?.(recordsPage([logRecord("asked before it was shown again")], "1:120", true));
    await vi.advanceTimersByTimeAsync(0);
    answersInFlight.shift()?.(recordsPage([logRecord("first"), logRecord("second")], "1:2"));
    await vi.advanceTimersByTimeAsync(0);

    expect(messagesOf(readings)).toEqual(["first", "second"]);
    expect(readings.readingOf(MAIN_STREAM).areEarlierRecordsNotHeld).toBe(false);
    expect(asked).toEqual(["pattern-main-d76f70:first", "pattern-main-d76f70:first"]);
  });

  it("answers the same reading object until it changes", async () => {
    const { backend } = backendAnswering([recordsPage([logRecord("only")], "1:1"), recordsPage([], "1:1")]);
    const readings = new ProjectLogReadings(backend, 1000);
    readings.showProjectLog(MAIN_STREAM);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    const readingAfterTheFirstPage = readings.readingOf(MAIN_STREAM);
    await vi.advanceTimersByTimeAsync(1000);

    expect(readings.readingOf({ ...MAIN_STREAM })).toBe(readingAfterTheFirstPage);
  });
});
