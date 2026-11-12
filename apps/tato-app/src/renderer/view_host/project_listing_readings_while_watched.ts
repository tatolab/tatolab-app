// One listing of each project as the host serves it to its views, its node types or its assets:
// one listing per project folder, however many views watch it, read as the first view watches it,
// as the window is shown again, and each time the window is told the project changed. A reading
// that reads the same as the last tells no one.

import { describeBackendRejection } from "../backend/tatolab_backend";
import type { StopWatching } from "./studio_view_contract";

/** A project's listing, or why the runtime gave none, in its own words. */
export type ProjectListingReading<Listing> = { kind: "listed"; listing: Listing } | { kind: "not_listed"; because: string };

/** What the host reads of one project's listing, one read at a time. */
class OneProjectsListing<Listing> {
  private readonly listeners = new Set<(reading: ProjectListingReading<Listing>) => void>();
  private latestReading: ProjectListingReading<Listing> | null = null;
  private latestReadingText: string | null = null;
  private isReadInFlight = false;
  private isAnotherReadWanted = false;

  constructor(
    private readonly projectFolder: string,
    private readonly listTheProject: (projectFolder: string) => Promise<Listing>,
  ) {}

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

  /** List the project now, or once more right after the read in flight. */
  listItAgain(): void {
    if (this.isReadInFlight) {
      this.isAnotherReadWanted = true;
      return;
    }
    this.isReadInFlight = true;
    void this.readTheListing().finally(() => {
      this.isReadInFlight = false;
      if (!this.isAnotherReadWanted) return;
      this.isAnotherReadWanted = false;
      this.listItAgain();
    });
  }

  private async readTheListing(): Promise<void> {
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
export class ProjectListingReadingsWhileWatched<Listing> {
  private readonly listingsByProjectFolder = new Map<string, OneProjectsListing<Listing>>();
  private isReadingAllowed = true;

  constructor(private readonly listTheProject: (projectFolder: string) => Promise<Listing>) {}

  /** Read only while the window is shown; every watched project is listed again as it is shown. */
  setReadingAllowed(isAllowed: boolean): void {
    const wasAllowed = this.isReadingAllowed;
    this.isReadingAllowed = isAllowed;
    if (!isAllowed || wasAllowed) return;
    for (const projectListing of this.listingsByProjectFolder.values()) {
      if (projectListing.watcherCount > 0) projectListing.listItAgain();
    }
  }

  readonly watchTheProject = (projectFolder: string, listener: (reading: ProjectListingReading<Listing>) => void): StopWatching => {
    const projectListing = this.listingOf(projectFolder);
    const isTheFirstWatcher = projectListing.watcherCount === 0;
    const stopTheListener = projectListing.watch(listener);
    if (isTheFirstWatcher && this.isReadingAllowed) projectListing.listItAgain();
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
    };
  };

  /** List `projectFolder` again at once while a view watches it and the window is shown, so a change to the project shows. */
  listTheProjectAgainNow(projectFolder: string): void {
    const projectListing = this.listingsByProjectFolder.get(projectFolder);
    if (this.isReadingAllowed && projectListing !== undefined && projectListing.watcherCount > 0) projectListing.listItAgain();
  }

  private listingOf(projectFolder: string): OneProjectsListing<Listing> {
    const known = this.listingsByProjectFolder.get(projectFolder);
    if (known !== undefined) return known;
    const projectListing = new OneProjectsListing(projectFolder, this.listTheProject);
    this.listingsByProjectFolder.set(projectFolder, projectListing);
    return projectListing;
  }
}
