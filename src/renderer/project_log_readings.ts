import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { ProjectLogRecord } from "../shared/tatolab_backend_contract";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often the shown project log's new records are read. */
export const PROJECT_LOG_POLL_MILLISECONDS = 1000;
/** The window holds the shown log's newest this many records. */
export const MOST_PROJECT_LOG_RECORDS_HELD = 5000;
/** The main process asks the runtime for this many records a page; a full page means more are waiting. */
const PROJECT_LOG_RECORDS_PAGE_SIZE = 500;
const MOST_PAGES_READ_PER_POLL = 8;

/** Which log the window reads: a project's whole log, or its records one stream wrote. */
export interface ProjectLogScope {
  projectDirectory: string;
  /** The stream the records are narrowed to; `null` for the whole project. */
  stream: string | null;
}

function sameProjectLogScope(firstScope: ProjectLogScope | null, secondScope: ProjectLogScope | null): boolean {
  return firstScope?.projectDirectory === secondScope?.projectDirectory && firstScope?.stream === secondScope?.stream;
}

/** A record the window holds, with its place among the records read for its scope, which names it while it is held. */
export interface HeldProjectLogRecord extends ProjectLogRecord {
  /** Counts up from 1 in the order the records were read, from the first read of the scope. */
  position: number;
}

/** What the window holds of the shown log, oldest first. */
export interface ProjectLogReading {
  records: readonly HeldProjectLogRecord[];
  /** Whether records written before the first one held are not held: the log's retention deleted them, or the window let them go. */
  areEarlierRecordsNotHeld: boolean;
  /** The runtime's words when the last read was refused; `null` once a read answers. */
  readRefusal: string | null;
  hasReadAPage: boolean;
  /** Whether a read has reached the newest record written, so the records held end where the log ends. */
  hasReadToTheNewestRecord: boolean;
}

const NOTHING_READ_YET: ProjectLogReading = { records: [], areEarlierRecordsNotHeld: false, readRefusal: null, hasReadAPage: false, hasReadToTheNewestRecord: false };

/**
 * The one reader of the shown project log, which a stream's Logs tab shows: from the log's first record held on disk,
 * then each record written after, while the window lets it poll. It holds only the shown scope's records.
 */
export class ProjectLogReadings {
  private shownReading: { scope: ProjectLogScope; reading: ProjectLogReading } | null = null;
  private readonly readingListeners = new Set<() => void>();
  private readonly logPoll: RepeatingBackendPoll;
  private isPollingAllowed = false;
  private readAfter: string | null = null;
  private nextPosition = 1;
  /** Counts each time the scope shown changes, so a read begun before it is dropped when it settles. */
  private shownScopeGeneration = 0;

  constructor(
    private readonly backend: Pick<TatolabBackend, "readProjectLogRecords">,
    pollMilliseconds: number = PROJECT_LOG_POLL_MILLISECONDS,
    private readonly mostRecordsHeld: number = MOST_PROJECT_LOG_RECORDS_HELD,
  ) {
    this.logPoll = new RepeatingBackendPoll(() => this.readTheShownScopesNewRecords(), pollMilliseconds);
  }

  /** The reading of `scope`, the same object until it changes; nothing read for a scope not shown. */
  readonly readingOf = (scope: ProjectLogScope): ProjectLogReading =>
    this.shownReading !== null && sameProjectLogScope(this.shownReading.scope, scope) ? this.shownReading.reading : NOTHING_READ_YET;

  /** Calls `readingListener` after each change to the shown reading; the returned function stops it. */
  readonly subscribeToReadings = (readingListener: () => void): (() => void) => {
    this.readingListeners.add(readingListener);
    return () => this.readingListeners.delete(readingListener);
  };

  /** Read `scope`'s log from now on, letting go of what was held of any other, or of none when `null`. */
  showProjectLog(scope: ProjectLogScope | null): void {
    if (sameProjectLogScope(this.shownReading?.scope ?? null, scope)) return;
    this.shownScopeGeneration += 1;
    this.logPoll.stop();
    this.readAfter = null;
    this.nextPosition = 1;
    this.replaceTheShownReading(scope === null ? null : { scope: { ...scope }, reading: NOTHING_READ_YET });
    this.updatePolling();
  }

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.updatePolling();
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.shownReading !== null) this.logPoll.start();
    else this.logPoll.stop();
  }

  private async readTheShownScopesNewRecords(): Promise<void> {
    const shownReading = this.shownReading;
    if (shownReading === null) return;
    const { scope } = shownReading;
    const readGeneration = this.shownScopeGeneration;
    try {
      for (let pageIndex = 0; pageIndex < MOST_PAGES_READ_PER_POLL; pageIndex++) {
        const recordsPage = await this.backend.readProjectLogRecords(scope.projectDirectory, { stream: scope.stream, action: null }, this.readAfter);
        if (readGeneration !== this.shownScopeGeneration) return;
        const heldReading = this.readingOf(scope);
        const recordsOfThisPage = recordsPage.records.map((record) => ({ ...record, position: this.nextPosition++ }));
        const recordsWithThisPage = [...heldReading.records, ...recordsOfThisPage];
        const recordsLetGoCount = Math.max(0, recordsWithThisPage.length - this.mostRecordsHeld);
        const isTheLastPageWritten = recordsPage.records.length < PROJECT_LOG_RECORDS_PAGE_SIZE;
        this.readAfter = recordsPage.next_after;
        this.replaceTheShownReading({
          scope,
          reading: {
            records: recordsLetGoCount === 0 ? recordsWithThisPage : recordsWithThisPage.slice(recordsLetGoCount),
            areEarlierRecordsNotHeld: heldReading.areEarlierRecordsNotHeld || recordsPage.records_no_longer_held || recordsLetGoCount > 0,
            readRefusal: null,
            hasReadAPage: true,
            hasReadToTheNewestRecord: heldReading.hasReadToTheNewestRecord || isTheLastPageWritten,
          },
        });
        if (isTheLastPageWritten) break;
      }
    } catch (rejection) {
      if (readGeneration === this.shownScopeGeneration) {
        this.replaceTheShownReading({ scope, reading: { ...this.readingOf(scope), readRefusal: describeBackendRejection(rejection) } });
      }
    }
  }

  private replaceTheShownReading(shownReading: { scope: ProjectLogScope; reading: ProjectLogReading } | null): void {
    const previousReading = this.shownReading;
    const isUnchanged =
      previousReading !== null &&
      shownReading !== null &&
      sameProjectLogScope(previousReading.scope, shownReading.scope) &&
      previousReading.reading.records.length === shownReading.reading.records.length &&
      previousReading.reading.records.at(-1)?.position === shownReading.reading.records.at(-1)?.position &&
      previousReading.reading.areEarlierRecordsNotHeld === shownReading.reading.areEarlierRecordsNotHeld &&
      previousReading.reading.readRefusal === shownReading.reading.readRefusal &&
      previousReading.reading.hasReadAPage === shownReading.reading.hasReadAPage &&
      previousReading.reading.hasReadToTheNewestRecord === shownReading.reading.hasReadToTheNewestRecord;
    if (isUnchanged || (previousReading === null && shownReading === null)) return;
    this.shownReading = shownReading;
    for (const readingListener of this.readingListeners) readingListener();
  }
}
