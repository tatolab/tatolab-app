// Each project's log as the host serves it to its views: one reading per project folder, however
// many views watch it, kept only while one does and the window is shown. The log is read as a view
// starts watching it. The records the runtime pushes are appended when they follow the reading's
// cursor; otherwise the reading reads on from its cursor up to where the push ends, one read at a
// time. So a view sees each record once, the latest last, and holds no more than the latest few
// hundred.

import type { ProjectLogRecord, ProjectLogRecordsPage, ProjectLogRecordsPushed } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ProjectLogReading, StopWatching } from "./studio_view_contract";

/** What the host reads a project's log through, and is told of its writes by. */
type ProjectLogBackend = Pick<TatolabBackend, "readProjectLogRecords" | "followProjectLogRecords" | "stopFollowingProjectLogRecords" | "onProjectLogRecordsWritten">;

/** How many of a project's latest records a reading holds. */
export const PROJECT_LOG_RECORDS_HELD = 500;

/** How many pages one read takes before it yields and reads on, so a long log never holds the window. */
const PROJECT_LOG_PAGES_PER_READ = 20;

/** What the host reads of one project's log. */
class OneProjectsLog {
  private readonly listeners = new Set<(reading: ProjectLogReading) => void>();
  private latestReading: ProjectLogReading | null = null;
  private recordsHeld: ProjectLogRecord[] = [];
  private recordsNoLongerHeld = false;
  private cursor: string | null = null;
  private isReadInFlight = false;
  private isAnotherReadWanted = false;
  private isFollowingTheLogWrites = false;

  constructor(
    private readonly projectFolder: string,
    private readonly backend: ProjectLogBackend,
  ) {}

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

  /** Read the log and follow its pushed writes while `isWatched`. */
  setWatched(isWatched: boolean): void {
    if (isWatched === this.isFollowingTheLogWrites) return;
    this.isFollowingTheLogWrites = isWatched;
    if (isWatched) {
      this.readTheNewRecords(null);
      void this.backend.followProjectLogRecords(this.projectFolder).catch((rejection: unknown) => this.publish({ kind: "not_read", because: describeBackendRejection(rejection) }));
      return;
    }
    this.isAnotherReadWanted = false;
    void this.backend.stopFollowingProjectLogRecords(this.projectFolder).catch(() => undefined);
  }

  /** Take what the runtime pushed of the log: append its records when they follow the cursor, or read on from the cursor up to where they end; `null` reads on to the latest. */
  takeThePushedRecords(pushed: ProjectLogRecordsPushed | null): void {
    if (!this.isFollowingTheLogWrites) return;
    if (pushed !== null && !this.isReadInFlight && pushed.after === this.cursor) {
      this.cursor = pushed.next_after;
      this.holdTheRecordsRead(pushed.records, pushed.records_no_longer_held);
      if (pushed.records.length > 0) this.publishTheRecordsHeld();
      return;
    }
    this.readTheNewRecords(pushed?.next_after ?? null);
  }

  /** Read on from the cursor, up to the cursor `until` or to the latest for `null`, at once or, to the latest, right after the read in flight. */
  private readTheNewRecords(until: string | null): void {
    if (!this.isFollowingTheLogWrites) return;
    if (this.isReadInFlight) {
      this.isAnotherReadWanted = true;
      return;
    }
    this.isReadInFlight = true;
    void this.readEveryPageAfterTheCursor(until).finally(() => {
      this.isReadInFlight = false;
      if (!this.isAnotherReadWanted) return;
      this.isAnotherReadWanted = false;
      this.readTheNewRecords(null);
    });
  }

  private async readEveryPageAfterTheCursor(until: string | null): Promise<void> {
    let anyRecordArrived = false;
    try {
      for (let pagesRead = 0; pagesRead < PROJECT_LOG_PAGES_PER_READ; pagesRead += 1) {
        const page: ProjectLogRecordsPage = await this.backend.readProjectLogRecords(this.projectFolder, { stream: null, action: null }, this.cursor, until);
        this.cursor = page.next_after;
        this.holdTheRecordsRead(page.records, page.records_no_longer_held);
        if (page.records.length > 0) anyRecordArrived = true;
        if (page.records.length === 0 || page.next_after === until) break;
        if (pagesRead === PROJECT_LOG_PAGES_PER_READ - 1) this.isAnotherReadWanted = true;
      }
    } catch (rejection) {
      this.publish({ kind: "not_read", because: describeBackendRejection(rejection) });
      return;
    }
    if (anyRecordArrived || this.latestReading?.kind !== "read") this.publishTheRecordsHeld();
  }

  private holdTheRecordsRead(records: readonly ProjectLogRecord[], recordsNoLongerHeld: boolean): void {
    if (recordsNoLongerHeld) this.recordsNoLongerHeld = true;
    if (records.length > 0) this.recordsHeld = [...this.recordsHeld, ...records].slice(-PROJECT_LOG_RECORDS_HELD);
  }

  private publishTheRecordsHeld(): void {
    this.publish({ kind: "read", records: this.recordsHeld, records_no_longer_held: this.recordsNoLongerHeld });
  }

  private publish(reading: ProjectLogReading): void {
    this.latestReading = reading;
    for (const listener of [...this.listeners]) listener(reading);
  }
}

/** Every watched project's log, read through `backend`. */
export class ProjectLogReadings {
  private readonly logsByProjectFolder = new Map<string, OneProjectsLog>();
  private isReadingAllowed = true;

  constructor(private readonly backend: ProjectLogBackend) {
    backend.onProjectLogRecordsWritten((projectFolder, pushed) => this.logsByProjectFolder.get(projectFolder)?.takeThePushedRecords(pushed));
  }

  /** Read only while the window is shown. */
  setReadingAllowed(isAllowed: boolean): void {
    this.isReadingAllowed = isAllowed;
    for (const projectLog of this.logsByProjectFolder.values()) this.updateWhetherItIsRead(projectLog);
  }

  readonly watchProjectLog = (projectFolder: string, listener: (reading: ProjectLogReading) => void): StopWatching => {
    const projectLog = this.logOf(projectFolder);
    const stopTheListener = projectLog.watch(listener);
    this.updateWhetherItIsRead(projectLog);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updateWhetherItIsRead(projectLog);
    };
  };

  private logOf(projectFolder: string): OneProjectsLog {
    const knownLog = this.logsByProjectFolder.get(projectFolder);
    if (knownLog !== undefined) return knownLog;
    const projectLog = new OneProjectsLog(projectFolder, this.backend);
    this.logsByProjectFolder.set(projectFolder, projectLog);
    return projectLog;
  }

  private updateWhetherItIsRead(projectLog: OneProjectsLog): void {
    projectLog.setWatched(this.isReadingAllowed && projectLog.watcherCount > 0);
  }
}
