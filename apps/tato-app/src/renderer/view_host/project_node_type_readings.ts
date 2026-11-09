// Each project's node types as the host serves them to its views: one poll per project folder,
// however many views watch it, read only while one does and the window is shown. The runtime reads
// the project's source afresh on every ask, so a module saved or broken shows on the next round; a
// round whose listing reads the same as the last tells no one.

import type { ProjectNodeTypeListing } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import type { ProjectNodeTypesReading, StopWatching } from "./studio_view_contract";

/** How often a watched project's node types are listed again. */
export const PROJECT_NODE_TYPES_POLL_MILLISECONDS = 5000;

/** What the host reads of one project's node types. */
class OneProjectsNodeTypes {
  private readonly listeners = new Set<(reading: ProjectNodeTypesReading) => void>();
  private latestReading: ProjectNodeTypesReading | null = null;
  private latestReadingText: string | null = null;
  readonly poll: RepeatingBackendPoll;

  constructor(
    private readonly projectFolder: string,
    private readonly backend: Pick<TatolabBackend, "listProjectNodeTypes">,
    pollMilliseconds: number,
  ) {
    this.poll = new RepeatingBackendPoll(() => this.listTheNodeTypes(), pollMilliseconds);
  }

  get watcherCount(): number {
    return this.listeners.size;
  }

  watch(listener: (reading: ProjectNodeTypesReading) => void): () => void {
    this.listeners.add(listener);
    if (this.latestReading !== null) listener(this.latestReading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async listTheNodeTypes(): Promise<void> {
    let listing: ProjectNodeTypeListing;
    try {
      listing = await this.backend.listProjectNodeTypes(this.projectFolder);
    } catch (rejection) {
      this.publish({ kind: "not_listed", because: describeBackendRejection(rejection) });
      return;
    }
    this.publish({ kind: "listed", listing });
  }

  private publish(reading: ProjectNodeTypesReading): void {
    const readingText = JSON.stringify(reading);
    if (readingText === this.latestReadingText) return;
    this.latestReadingText = readingText;
    this.latestReading = reading;
    for (const listener of [...this.listeners]) listener(reading);
  }
}

/** Every watched project's node types, listed through `backend`. */
export class ProjectNodeTypeReadings {
  private readonly nodeTypesByProjectFolder = new Map<string, OneProjectsNodeTypes>();
  private isPollingAllowed = true;

  constructor(
    private readonly backend: Pick<TatolabBackend, "listProjectNodeTypes">,
    private readonly pollMilliseconds: number = PROJECT_NODE_TYPES_POLL_MILLISECONDS,
  ) {}

  /** Read only while the window is shown. */
  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    for (const projectNodeTypes of this.nodeTypesByProjectFolder.values()) this.updatePolling(projectNodeTypes);
  }

  readonly watchProjectNodeTypes = (projectFolder: string, listener: (reading: ProjectNodeTypesReading) => void): StopWatching => {
    const projectNodeTypes = this.nodeTypesOf(projectFolder);
    const stopTheListener = projectNodeTypes.watch(listener);
    this.updatePolling(projectNodeTypes);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updatePolling(projectNodeTypes);
    };
  };

  private nodeTypesOf(projectFolder: string): OneProjectsNodeTypes {
    const known = this.nodeTypesByProjectFolder.get(projectFolder);
    if (known !== undefined) return known;
    const projectNodeTypes = new OneProjectsNodeTypes(projectFolder, this.backend, this.pollMilliseconds);
    this.nodeTypesByProjectFolder.set(projectFolder, projectNodeTypes);
    return projectNodeTypes;
  }

  private updatePolling(projectNodeTypes: OneProjectsNodeTypes): void {
    if (this.isPollingAllowed && projectNodeTypes.watcherCount > 0) projectNodeTypes.poll.start();
    else projectNodeTypes.poll.stop();
  }
}
