import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamLogRecord, StreamLogRecordsPage } from "../shared/tatolab_backend_contract";
import { StreamLogReadings } from "./stream_log_readings";

function logRecord(sequence: number, message: string): StreamLogRecord {
  return {
    sequence,
    host_ts_ns: null,
    level: "info",
    source: "python",
    target: null,
    message,
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: true,
    jsonl_line: JSON.stringify({ message }),
  };
}

function recordsPage(streamInstance: string, records: StreamLogRecord[], recordsNoLongerHeld = 0): StreamLogRecordsPage {
  return { stream: "main", stream_instance: streamInstance, records, next_after: records.at(-1)?.sequence ?? 0, records_no_longer_held: recordsNoLongerHeld };
}

/** A backend answering each read with the next page or refusal queued, writing down the cursor each read asked after. */
function backendAnswering(answers: (StreamLogRecordsPage | string)[]) {
  const askedAfter: { streamName: string; afterSequence: number }[] = [];
  const backend = {
    readStreamLogRecords: async (streamName: string, afterSequence: number): Promise<StreamLogRecordsPage> => {
      askedAfter.push({ streamName, afterSequence });
      const answer = answers.shift() ?? recordsPage("4", []);
      if (typeof answer === "string") throw answer;
      return answer;
    },
  };
  return { backend, askedAfter };
}

const messagesOf = (readings: StreamLogReadings, streamName = "main") => readings.readingOf(streamName).records.map((record) => record.message);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("StreamLogReadings", () => {
  it("reads the shown loaded stream from 0, then on from each page's next_after every interval", async () => {
    const { backend, askedAfter } = backendAnswering([recordsPage("4", [logRecord(1, "first"), logRecord(2, "second")]), recordsPage("4", [logRecord(3, "third")])]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    expect(askedAfter).toEqual([]);

    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(messagesOf(readings)).toEqual(["first", "second"]);
    expect(readings.readingOf("main").hasReadAPage).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(askedAfter.map((ask) => ask.afterSequence)).toEqual([0, 2]);
    expect(messagesOf(readings)).toEqual(["first", "second", "third"]);
  });

  it("reads page after page in one poll while each page comes back full", async () => {
    const fullPage = Array.from({ length: 500 }, (_, recordIndex) => logRecord(recordIndex + 1, `r${recordIndex + 1}`));
    const { backend, askedAfter } = backendAnswering([recordsPage("4", fullPage), recordsPage("4", [logRecord(501, "last")])]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(askedAfter.map((ask) => ask.afterSequence)).toEqual([0, 500]);
    expect(readings.readingOf("main").records).toHaveLength(501);
  });

  it("counts the records the runtime no longer holds as earlier records not held", async () => {
    const { backend } = backendAnswering([recordsPage("4", [logRecord(313, "kept")], 312)]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(readings.readingOf("main").earlierRecordsNotHeldCount).toBe(312);
    expect(messagesOf(readings)).toEqual(["kept"]);
  });

  it("holds only the newest records past its limit and counts the ones it let go", async () => {
    const { backend } = backendAnswering([
      recordsPage("4", [logRecord(1, "a"), logRecord(2, "b"), logRecord(3, "c")], 0),
      recordsPage("4", [logRecord(4, "d"), logRecord(5, "e")]),
    ]);
    const readings = new StreamLogReadings(backend, () => {}, 1000, 3);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(messagesOf(readings)).toEqual(["c", "d", "e"]);
    expect(readings.readingOf("main").earlierRecordsNotHeldCount).toBe(2);
  });

  it("starts again from 0 when a page names another load, and tells each load it reads", async () => {
    const { backend, askedAfter } = backendAnswering([
      recordsPage("4", [logRecord(1, "old load")], 5),
      recordsPage("5", [logRecord(7, "numbered by the new load")]),
      recordsPage("5", [logRecord(1, "new load")]),
    ]);
    const streamInstancesRead: string[] = [];
    const readings = new StreamLogReadings(backend, (streamName, streamInstance) => streamInstancesRead.push(`${streamName}:${streamInstance}`), 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(askedAfter.map((ask) => ask.afterSequence)).toEqual([0, 1, 0]);
    expect(streamInstancesRead).toEqual(["main:4", "main:5", "main:5"]);
    expect(messagesOf(readings)).toEqual(["new load"]);
    expect(readings.readingOf("main").streamInstance).toBe("5");
    expect(readings.readingOf("main").earlierRecordsNotHeldCount).toBe(0);
  });

  it("keeps the records it holds through a refused read, shows the refusal in its own words, and clears it once a read answers", async () => {
    const { backend } = backendAnswering([recordsPage("4", [logRecord(1, "kept")]), "no stream named `main` is loaded in this runtime. Loaded: none", recordsPage("4", [])]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(readings.readingOf("main").readRefusal).toBe("no stream named `main` is loaded in this runtime. Loaded: none");
    expect(messagesOf(readings)).toEqual(["kept"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readings.readingOf("main").readRefusal).toBeNull();
  });

  it("reads nothing while polling is not allowed, or for a stream that is not loaded", async () => {
    const { backend, askedAfter } = backendAnswering([]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    await vi.advanceTimersByTimeAsync(5000);
    readings.showStream("main", false);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(5000);

    expect(askedAfter).toEqual([]);
  });

  it("drops what it held of a stream once another is shown, and a page that settles after it changed", async () => {
    let answerTheSlowRead: (page: StreamLogRecordsPage) => void = () => {};
    const askedStreams: string[] = [];
    const backend = {
      readStreamLogRecords: (streamName: string): Promise<StreamLogRecordsPage> => {
        askedStreams.push(streamName);
        if (streamName === "main") return new Promise((resolve) => (answerTheSlowRead = resolve));
        return Promise.resolve({ ...recordsPage("9", [logRecord(1, "camera's")]), stream: "camera" });
      },
    };
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    const heardChanges = vi.fn();
    readings.subscribeToReadings(heardChanges);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.showStream("camera", true);
    answerTheSlowRead(recordsPage("4", [logRecord(1, "main's, too late")]));
    await vi.advanceTimersByTimeAsync(0);

    expect(askedStreams).toEqual(["main", "camera"]);
    expect(messagesOf(readings, "main")).toEqual([]);
    expect(messagesOf(readings, "camera")).toEqual(["camera's"]);
    expect(heardChanges).toHaveBeenCalled();
  });

  it("drops a page asked before its stream was shown again, and reads that stream from 0", async () => {
    const answersInFlight: ((page: StreamLogRecordsPage) => void)[] = [];
    const askedAfter: string[] = [];
    const backend = {
      readStreamLogRecords: (streamName: string, afterSequence: number): Promise<StreamLogRecordsPage> => {
        askedAfter.push(`${streamName}:${afterSequence}`);
        if (streamName === "camera") return Promise.resolve({ ...recordsPage("9", []), stream: "camera" });
        return new Promise((resolve) => answersInFlight.push(resolve));
      },
    };
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.showStream("camera", true);
    readings.showStream("main", true);
    answersInFlight.shift()?.(recordsPage("4", [logRecord(121, "asked before main was shown again")], 120));
    await vi.advanceTimersByTimeAsync(0);
    answersInFlight.shift()?.(recordsPage("4", [logRecord(1, "first"), logRecord(2, "second")]));
    await vi.advanceTimersByTimeAsync(0);

    expect(messagesOf(readings)).toEqual(["first", "second"]);
    expect(readings.readingOf("main").earlierRecordsNotHeldCount).toBe(0);
    expect(askedAfter).toEqual(["main:0", "main:0"]);
  });

  it("answers the same reading object until it changes", async () => {
    const { backend } = backendAnswering([recordsPage("4", [logRecord(1, "only")]), recordsPage("4", [])]);
    const readings = new StreamLogReadings(backend, () => {}, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    const readingAfterTheFirstPage = readings.readingOf("main");
    await vi.advanceTimersByTimeAsync(1000);

    expect(readings.readingOf("main")).toBe(readingAfterTheFirstPage);
  });
});
