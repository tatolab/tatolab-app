// One listing of each project as the host serves it to its views, its node types or its assets:
// one poll per project folder, however many views watch it, read only while one does and the
// window is shown. The runtime reads the project afresh on every ask, so a module saved or an
// asset imported shows on the next round; a round whose listing reads the same as the last tells
// no one.

import { describeBackendRejection } from "../backend/tatolab_backend";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import type { StopWatching } from "./studio_view_contract";

/** How often a watched project is listed again. */
export const PROJECT_LISTING_POLL_MILLISECONDS = 5000;

/** A project's listing, or why the runtime gave none, in its own words. */
export type ProjectListingReading<Listing> = { kind: "listed"; listing: Listing } | { kind: "not_listed"; because: string };

/** What the host reads of one project's listing. */
class OneProjectsListing<Listing> {
  private readonly listeners = new Set<(reading: ProjectListingReading<Listing>) => void>();
  private latestReading: ProjectListingReading<Listing> | null = null;
  private latestReadingText: string | null = null;
  readonly poll: RepeatingBackendPoll;

  constructor(
    private readonly projectFolder: string,
    private readonly listTheProject: (projectFolder: string) => Promise<Listing>,
    pollMilliseconds: number,
  ) {
    this.poll = new RepeatingBackendPoll(() => this.listItAgain(), pollMilliseconds);
  }

  get watcherCount(): number {
    return this.listeners.size;
  }

  watch(listener: (reading: ProjectListingReading<Listing>) => void): () => void {
    this.listeners.add(listener);
    if (this.latestReading !== null) listener(this.latestReading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async listItAgain(): Promise<void> {
    let listing: Listing;
    try {
      listing = await this.listTheProject(this.projectFolder);
    } catch (rejection) {
      this.publish({ kind: "not_listed", because: describeBackendRejection(rejection) });
      return;
    }
    this.publish({ kind: "listed", listing });
  }

  private publish(reading: ProjectListingReading<Listing>): void {
    const readingText = JSON.stringify(reading);
    if (readingText === this.latestReadingText) return;
    this.latestReadingText = readingText;
    this.latestReading = reading;
    for (const listener of [...this.listeners]) listener(reading);
  }
}

/** Every watched project's listing, each read through `listTheProject`. */
export class ProjectListingReadingsPolledWhileWatched<Listing> {
  private readonly listingsByProjectFolder = new Map<string, OneProjectsListing<Listing>>();
  private isPollingAllowed = true;

  constructor(
    private readonly listTheProject: (projectFolder: string) => Promise<Listing>,
    private readonly pollMilliseconds: number = PROJECT_LISTING_POLL_MILLISECONDS,
  ) {}

  /** Read only while the window is shown. */
  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    for (const projectListing of this.listingsByProjectFolder.values()) this.updatePolling(projectListing);
  }

  readonly watchTheProject = (projectFolder: string, listener: (reading: ProjectListingReading<Listing>) => void): StopWatching => {
    const projectListing = this.listingOf(projectFolder);
    const stopTheListener = projectListing.watch(listener);
    this.updatePolling(projectListing);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updatePolling(projectListing);
    };
  };

  /** List `projectFolder` again at once while a view watches it, so a change the window just made shows without waiting a round. */
  listTheProjectAgainNow(projectFolder: string): void {
    this.listingsByProjectFolder.get(projectFolder)?.poll.pollNow();
  }

  private listingOf(projectFolder: string): OneProjectsListing<Listing> {
    const known = this.listingsByProjectFolder.get(projectFolder);
    if (known !== undefined) return known;
    const projectListing = new OneProjectsListing(projectFolder, this.listTheProject, this.pollMilliseconds);
    this.listingsByProjectFolder.set(projectFolder, projectListing);
    return projectListing;
  }

  private updatePolling(projectListing: OneProjectsListing<Listing>): void {
    if (this.isPollingAllowed && projectListing.watcherCount > 0) projectListing.poll.start();
    else projectListing.poll.stop();
  }
}
