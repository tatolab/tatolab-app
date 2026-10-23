// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { StreamLogRecord, StreamLogRecordsPage } from "../backend/tatolab_backend_contract";
import { StreamLogFollower, type StreamLogRecordsDestination } from "./stream_log_follower";

function logRecord(sequence: number, message: string): StreamLogRecord {
  return { sequence, host_ts_ns: null, level: "info", source: "python", target: null, message, attrs: {} };
}

function recordsPage(streamInstance: string, records: StreamLogRecord[], recordsNoLongerHeld = 0): StreamLogRecordsPage {
  return {
    stream: "main",
    stream_instance: streamInstance,
    records,
    next_after: records.at(-1)?.sequence ?? 0,
    records_no_longer_held: recordsNoLongerHeld,
  };
}

/** A console that writes down what the follower put into it. */
class RecordingLogDestination implements StreamLogRecordsDestination {
  readonly shownLines: string[] = [];
  lastReadFailure: string | null = null;

  appendRecords(records: StreamLogRecord[]): void {
    this.shownLines.push(...records.map((record) => record.message));
  }

  appendDivider(dividerText: string): void {
    this.shownLines.push(`-- ${dividerText}`);
  }

  clear(): void {
    this.shownLines.length = 0;
  }

  showReadFailure(failureText: string | null): void {
    this.lastReadFailure = failureText;
  }
}

/** Starts `follower`, lets one round of reads settle, and stops it. */
async function readOneRound(follower: StreamLogFollower): Promise<void> {
  follower.setReading(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  follower.setReading(false);
}

describe("StreamLogFollower", () => {
  it("reads on from the last page's next_after", async () => {
    const askedAfter: number[] = [];
    const pages = [recordsPage("4", [logRecord(1, "first"), logRecord(2, "second")]), recordsPage("4", [logRecord(3, "third")])];
    const destination = new RecordingLogDestination();
    const follower = new StreamLogFollower(
      { readStreamLogRecords: async (_streamName, afterSequence) => (askedAfter.push(afterSequence), pages.shift()!) },
      "main",
      destination,
      () => {},
    );
    await readOneRound(follower);
    await readOneRound(follower);
    expect(askedAfter).toEqual([0, 2]);
    expect(destination.shownLines).toEqual(["first", "second", "third"]);
  });

  it("clears and reads from 0 when the stream was loaded again", async () => {
    const askedAfter: number[] = [];
    const pages = [
      recordsPage("4", [logRecord(1, "old load")]),
      recordsPage("5", [logRecord(7, "numbered by the new load")]),
      recordsPage("5", [logRecord(1, "new load")]),
    ];
    const destination = new RecordingLogDestination();
    const streamInstancesRead: string[] = [];
    const follower = new StreamLogFollower(
      { readStreamLogRecords: async (_streamName, afterSequence) => (askedAfter.push(afterSequence), pages.shift()!) },
      "main",
      destination,
      (streamInstance) => streamInstancesRead.push(streamInstance),
    );
    await readOneRound(follower);
    await readOneRound(follower);
    expect(askedAfter).toEqual([0, 1, 0]);
    expect(streamInstancesRead).toEqual(["4", "5", "5"]);
    expect(destination.shownLines).toHaveLength(2);
    expect(destination.shownLines[0]).toMatch(/^-- Loaded again at /);
    expect(destination.shownLines[1]).toBe("new load");
  });

  it("says how many records the runtime no longer holds", async () => {
    const destination = new RecordingLogDestination();
    const follower = new StreamLogFollower(
      { readStreamLogRecords: async () => recordsPage("4", [logRecord(313, "kept")], 312) },
      "main",
      destination,
      () => {},
    );
    await readOneRound(follower);
    expect(destination.shownLines).toEqual(["-- 312 earlier records are no longer held by the runtime", "kept"]);
  });

  it("shows a refused read and clears it once a read succeeds", async () => {
    let refuseReads = true;
    const destination = new RecordingLogDestination();
    const follower = new StreamLogFollower(
      {
        readStreamLogRecords: async () => {
          if (refuseReads) throw "no stream named `main` is loaded in this runtime. Loaded: none";
          return recordsPage("4", []);
        },
      },
      "main",
      destination,
      () => {},
    );
    await readOneRound(follower);
    expect(destination.lastReadFailure).toBe("no stream named `main` is loaded in this runtime. Loaded: none");
    refuseReads = false;
    await readOneRound(follower);
    expect(destination.lastReadFailure).toBeNull();
  });
});
