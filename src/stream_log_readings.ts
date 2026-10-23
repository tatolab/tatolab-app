// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { StreamLogRecord } from "./backend/tatolab_backend_contract";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often the shown stream's new log records are read while it is loaded. */
export const STREAM_LOG_POLL_MILLISECONDS = 1000;
/** The window holds a load's newest this many records; the runtime itself holds its newest 4096. */
export const MOST_STREAM_LOG_RECORDS_HELD = 5000;
/** The backend asks the runtime for this many records a page; a full page means more are waiting. */
const STREAM_LOG_RECORDS_PAGE_SIZE = 500;
const MOST_PAGES_READ_PER_POLL = 8;

/** What the window holds of the shown stream's log: one load's records, oldest first. */
export interface StreamLogReading {
  /** Which load of the stream the records are from, as the runtime names it; `null` until a page is read. */
  streamInstance: string | null;
  records: readonly StreamLogRecord[];
  /** This load's records before the first one held that the window does not hold: the runtime no longer held them, or the window let them go. */
  earlierRecordsNotHeldCount: number;
  /** The runtime's words when the last read was refused; `null` once a read answers. */
  readRefusal: string | null;
  hasReadAPage: boolean;
}

const NOTHING_READ_YET: StreamLogReading = { streamInstance: null, records: [], earlierRecordsNotHeldCount: 0, readRefusal: null, hasReadAPage: false };

/**
 * The one reader of the shown stream's log, which its Logs tab shows: it reads the stream's new records while it is
 * loaded and the window lets it poll, on whichever tab shows, and tells `onStreamInstanceRead` each load it reads so
 * the Overview and the graph inspector can name it. It holds only the shown stream's records.
 */
export class StreamLogReadings {
  private shownReading: { streamName: string; reading: StreamLogReading } | null = null;
  private readonly readingListeners = new Set<() => void>();
  private readonly logPoll: RepeatingBackendPoll;
  private shownStream: { streamName: string; isLoaded: boolean } | null = null;
  private isPollingAllowed = false;
  private afterSequence = 0;
  /** Counts each time the stream shown changes or loads again, so a read begun before it is dropped when it settles. */
  private shownStreamGeneration = 0;

  constructor(
    private readonly backend: Pick<TatolabBackend, "readStreamLogRecords">,
    private readonly onStreamInstanceRead: (streamName: string, streamInstance: string) => void,
    pollMilliseconds: number = STREAM_LOG_POLL_MILLISECONDS,
    private readonly mostRecordsHeld: number = MOST_STREAM_LOG_RECORDS_HELD,
  ) {
    this.logPoll = new RepeatingBackendPoll(() => this.readTheShownStreamsNewRecords(), pollMilliseconds);
  }

  /** The reading of `streamName`, the same object until it changes; nothing read for a stream not shown. */
  readonly readingOf = (streamName: string): StreamLogReading =>
    this.shownReading?.streamName === streamName ? this.shownReading.reading : NOTHING_READ_YET;

  /** Calls `readingListener` after each change to the shown stream's reading; the returned function stops it. */
  readonly subscribeToReadings = (readingListener: () => void): (() => void) => {
    this.readingListeners.add(readingListener);
    return () => this.readingListeners.delete(readingListener);
  };

  /** Read `streamName`'s log from now on while `isLoaded`, letting go of what was held of any other, or of none when `null`. */
  showStream(streamName: string | null, isLoaded: boolean): void {
    const isTheSameLoadedStream = isLoaded && this.shownStream?.streamName === streamName && this.shownStream.isLoaded;
    this.shownStream = streamName === null ? null : { streamName, isLoaded };
    if (!isTheSameLoadedStream) {
      this.shownStreamGeneration += 1;
      this.logPoll.stop();
      this.afterSequence = 0;
      this.replaceTheShownReading(streamName === null ? null : { streamName, reading: NOTHING_READ_YET });
    }
    this.updatePolling();
  }

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.updatePolling();
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.shownStream?.isLoaded === true) this.logPoll.start();
    else this.logPoll.stop();
  }

  private isStillShownAsReadFrom(streamName: string, readGeneration: number): boolean {
    return readGeneration === this.shownStreamGeneration && this.shownStream?.streamName === streamName && this.shownStream.isLoaded;
  }

  private async readTheShownStreamsNewRecords(): Promise<void> {
    const shownStream = this.shownStream;
    if (shownStream === null || !shownStream.isLoaded) return;
    const { streamName } = shownStream;
    const readGeneration = this.shownStreamGeneration;
    try {
      for (let pageIndex = 0; pageIndex < MOST_PAGES_READ_PER_POLL; pageIndex++) {
        const recordsPage = await this.backend.readStreamLogRecords(streamName, this.afterSequence);
        if (!this.isStillShownAsReadFrom(streamName, readGeneration)) return;
        this.onStreamInstanceRead(streamName, recordsPage.stream_instance);
        const heldReading = this.readingOf(streamName);
        if (heldReading.streamInstance !== null && recordsPage.stream_instance !== heldReading.streamInstance) {
          // Another load numbers its records from 1 again, so this page's cursor belongs to the old one.
          this.afterSequence = 0;
          this.replaceTheShownReading({ streamName, reading: { ...NOTHING_READ_YET, streamInstance: recordsPage.stream_instance } });
          continue;
        }
        const recordsWithThisPage = [...heldReading.records, ...recordsPage.records];
        const recordsLetGoCount = Math.max(0, recordsWithThisPage.length - this.mostRecordsHeld);
        this.afterSequence = recordsPage.next_after;
        this.replaceTheShownReading({
          streamName,
          reading: {
            streamInstance: recordsPage.stream_instance,
            records: recordsLetGoCount === 0 ? recordsWithThisPage : recordsWithThisPage.slice(recordsLetGoCount),
            earlierRecordsNotHeldCount: heldReading.earlierRecordsNotHeldCount + recordsPage.records_no_longer_held + recordsLetGoCount,
            readRefusal: null,
            hasReadAPage: true,
          },
        });
        if (recordsPage.records.length < STREAM_LOG_RECORDS_PAGE_SIZE) break;
      }
    } catch (rejection) {
      if (this.isStillShownAsReadFrom(streamName, readGeneration)) {
        this.replaceTheShownReading({ streamName, reading: { ...this.readingOf(streamName), readRefusal: describeBackendRejection(rejection) } });
      }
    }
  }

  private replaceTheShownReading(shownReading: { streamName: string; reading: StreamLogReading } | null): void {
    const previousReading = this.shownReading;
    const isUnchanged =
      previousReading?.streamName === shownReading?.streamName &&
      previousReading !== null &&
      shownReading !== null &&
      previousReading.reading.streamInstance === shownReading.reading.streamInstance &&
      previousReading.reading.records.length === shownReading.reading.records.length &&
      previousReading.reading.records.at(-1) === shownReading.reading.records.at(-1) &&
      previousReading.reading.earlierRecordsNotHeldCount === shownReading.reading.earlierRecordsNotHeldCount &&
      previousReading.reading.readRefusal === shownReading.reading.readRefusal &&
      previousReading.reading.hasReadAPage === shownReading.reading.hasReadAPage;
    if (isUnchanged || (previousReading === null && shownReading === null)) return;
    this.shownReading = shownReading;
    for (const readingListener of this.readingListeners) readingListener();
  }
}
