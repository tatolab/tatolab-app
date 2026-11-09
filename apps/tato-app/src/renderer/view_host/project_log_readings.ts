// Each project's log as the host serves it to its views: one poll per project folder, however many
// views watch it, read only while one does and the window is shown. Each round reads every page
// after the last cursor, so a view sees each record once, the latest last, and holds no more than
// the latest few hundred.

import type { ProjectLogRecord, ProjectLogRecordsPage } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import type { ProjectLogReading, StopWatching } from "./studio_view_contract";

/** How often a watched project's log is read. */
export const PROJECT_LOG_POLL_MILLISECONDS = 1500;

/** How many of a project's latest records a reading holds. */
export const PROJECT_LOG_RECORDS_HELD = 500;

/** How many pages one round reads before it waits for the next, so a long log never holds the window. */
const PROJECT_LOG_PAGES_PER_ROUND = 20;

/** What the host reads of one project's log. */
class OneProjectsLog {
  private readonly listeners = new Set<(reading: ProjectLogReading) => void>();
  private latestReading: ProjectLogReading | null = null;
  private recordsHeld: ProjectLogRecord[] = [];
  private recordsNoLongerHeld = false;
  private cursor: string | null = null;
  readonly poll: RepeatingBackendPoll;

  constructor(
    private readonly projectFolder: string,
    private readonly backend: Pick<TatolabBackend, "readProjectLogRecords">,
    pollMilliseconds: number,
  ) {
    this.poll = new RepeatingBackendPoll(() => this.readTheNewRecords(), pollMilliseconds);
  }

  get watcherCount(): number {
    return this.listeners.size;
  }

  watch(listener: (reading: ProjectLogReading) => void): () => void {
    this.listeners.add(listener);
    if (this.latestReading !== null) listener(this.latestReading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async readTheNewRecords(): Promise<void> {
    let anyRecordArrived = false;
    try {
      for (let pagesRead = 0; pagesRead < PROJECT_LOG_PAGES_PER_ROUND; pagesRead += 1) {
        const page: ProjectLogRecordsPage = await this.backend.readProjectLogRecords(this.projectFolder, { stream: null, action: null }, this.cursor);
        this.cursor = page.next_after;
        if (page.records_no_longer_held) this.recordsNoLongerHeld = true;
        if (page.records.length === 0) break;
        anyRecordArrived = true;
        this.recordsHeld = [...this.recordsHeld, ...page.records].slice(-PROJECT_LOG_RECORDS_HELD);
      }
    } catch (rejection) {
      this.publish({ kind: "not_read", because: describeBackendRejection(rejection) });
      return;
    }
    if (anyRecordArrived || this.latestReading?.kind !== "read") {
      this.publish({ kind: "read", records: this.recordsHeld, records_no_longer_held: this.recordsNoLongerHeld });
    }
  }

  private publish(reading: ProjectLogReading): void {
    this.latestReading = reading;
    for (const listener of [...this.listeners]) listener(reading);
  }
}

/** Every watched project's log, read through `backend`. */
export class ProjectLogReadings {
  private readonly logsByProjectFolder = new Map<string, OneProjectsLog>();
  private isPollingAllowed = true;

  constructor(
    private readonly backend: Pick<TatolabBackend, "readProjectLogRecords">,
    private readonly pollMilliseconds: number = PROJECT_LOG_POLL_MILLISECONDS,
  ) {}

  /** Read only while the window is shown. */
  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    for (const projectLog of this.logsByProjectFolder.values()) this.updatePolling(projectLog);
  }

  readonly watchProjectLog = (projectFolder: string, listener: (reading: ProjectLogReading) => void): StopWatching => {
    const projectLog = this.logOf(projectFolder);
    const stopTheListener = projectLog.watch(listener);
    this.updatePolling(projectLog);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updatePolling(projectLog);
    };
  };

  private logOf(projectFolder: string): OneProjectsLog {
    const knownLog = this.logsByProjectFolder.get(projectFolder);
    if (knownLog !== undefined) return knownLog;
    const projectLog = new OneProjectsLog(projectFolder, this.backend, this.pollMilliseconds);
    this.logsByProjectFolder.set(projectFolder, projectLog);
    return projectLog;
  }

  private updatePolling(projectLog: OneProjectsLog): void {
    if (this.isPollingAllowed && projectLog.watcherCount > 0) projectLog.poll.start();
    else projectLog.poll.stop();
  }
}
