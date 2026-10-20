// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { StreamLogRecord } from "../backend/tatolab_backend_contract";
import { formatLogRecordTime } from "../presentation/log_record_presentation";
import { countLabel } from "../presentation/stream_presentation";
import { RepeatingBackendPoll } from "../repeating_backend_poll";

/** Where a follower puts what it reads: the stream's log console. */
export interface StreamLogRecordsDestination {
  appendRecords(records: StreamLogRecord[]): void;
  appendDivider(dividerText: string): void;
  clear(): void;
  showReadFailure(failureText: string | null): void;
}

/** The backend asks the runtime for this many records a page; a full page means more are waiting. */
const STREAM_LOG_RECORDS_PAGE_SIZE = 500;
const MOST_PAGES_READ_PER_POLL = 8;
const STREAM_LOG_POLL_MILLISECONDS = 1000;

/** Reads one loaded stream's new log records about once a second into its console. */
export class StreamLogFollower {
  private readonly logPoll: RepeatingBackendPoll;
  private afterSequence = 0;
  private lastStreamInstance: string | null = null;
  private isDisposed = false;

  constructor(
    private readonly backend: Pick<TatolabBackend, "readStreamLogRecords">,
    private readonly streamName: string,
    private readonly logConsole: StreamLogRecordsDestination,
  ) {
    this.logPoll = new RepeatingBackendPoll(() => this.readNewRecords(), STREAM_LOG_POLL_MILLISECONDS);
  }

  setReading(shouldRead: boolean): void {
    if (shouldRead) this.logPoll.start();
    else this.logPoll.stop();
  }

  readNow(): void {
    this.logPoll.pollNow();
  }

  dispose(): void {
    this.isDisposed = true;
    this.logPoll.stop();
  }

  private async readNewRecords(): Promise<void> {
    try {
      for (let pageIndex = 0; pageIndex < MOST_PAGES_READ_PER_POLL; pageIndex++) {
        const recordsPage = await this.backend.readStreamLogRecords(this.streamName, this.afterSequence);
        if (this.isDisposed) return;
        if (this.lastStreamInstance !== null && recordsPage.stream_instance !== this.lastStreamInstance) {
          this.lastStreamInstance = recordsPage.stream_instance;
          this.afterSequence = 0;
          this.logConsole.clear();
          this.logConsole.appendDivider(
            `Loaded again at ${formatLogRecordTime(Date.now() * 1_000_000)}. Showing records from this load.`,
          );
          continue;
        }
        this.lastStreamInstance = recordsPage.stream_instance;
        if (recordsPage.records_no_longer_held > 0) {
          this.logConsole.appendDivider(
            `${countLabel(recordsPage.records_no_longer_held, "earlier record is", "earlier records are")} no longer held by the runtime`,
          );
        }
        this.logConsole.appendRecords(recordsPage.records);
        this.afterSequence = recordsPage.next_after;
        if (recordsPage.records.length < STREAM_LOG_RECORDS_PAGE_SIZE) break;
      }
      this.logConsole.showReadFailure(null);
    } catch (rejection) {
      if (this.isDisposed) return;
      this.logConsole.showReadFailure(describeBackendRejection(rejection));
    }
  }
}
