// Each project's log as the host serves it to its views: one reading per project folder, however
// many views watch it, kept only while one does and the window is shown. The log is read as a view
// starts watching it, and again at once on each write the runtime pushes, one read at a time. Each
// read takes every page after the last cursor, so a view sees each record once, the latest last, and
// holds no more than the latest few hundred.

import type { ProjectLogRecord, ProjectLogRecordsPage } from "../../shared/tatolab_backend_contract";
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
      this.readTheNewRecords();
      void this.backend.followProjectLogRecords(this.projectFolder).catch((rejection: unknown) => this.publish({ kind: "not_read", because: describeBackendRejection(rejection) }));
      return;
    }
    this.isAnotherReadWanted = false;
    void this.backend.stopFollowingProjectLogRecords(this.projectFolder).catch(() => undefined);
  }

  /** Read on from the cursor at once, or right after the read in flight, as the runtime pushed a write to the log. */
  readTheNewRecords(): void {
    if (!this.isFollowingTheLogWrites) return;
    if (this.isReadInFlight) {
      this.isAnotherReadWanted = true;
      return;
    }
    this.isReadInFlight = true;
    void this.readEveryPageAfterTheCursor().finally(() => {
      this.isReadInFlight = false;
      if (!this.isAnotherReadWanted) return;
      this.isAnotherReadWanted = false;
      this.readTheNewRecords();
    });
  }

  private async readEveryPageAfterTheCursor(): Promise<void> {
    let anyRecordArrived = false;
    try {
      for (let pagesRead = 0; pagesRead < PROJECT_LOG_PAGES_PER_READ; pagesRead += 1) {
        const page: ProjectLogRecordsPage = await this.backend.readProjectLogRecords(this.projectFolder, { stream: null, action: null }, this.cursor);
        this.cursor = page.next_after;
        if (page.records_no_longer_held) this.recordsNoLongerHeld = true;
        if (page.records.length === 0) break;
        anyRecordArrived = true;
        this.recordsHeld = [...this.recordsHeld, ...page.records].slice(-PROJECT_LOG_RECORDS_HELD);
        if (pagesRead === PROJECT_LOG_PAGES_PER_READ - 1) this.isAnotherReadWanted = true;
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
  private isReadingAllowed = true;

  constructor(private readonly backend: ProjectLogBackend) {
    backend.onProjectLogRecordsWritten((projectFolder) => this.logsByProjectFolder.get(projectFolder)?.readTheNewRecords());
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
