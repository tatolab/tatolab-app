import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { StreamGraphSummary } from "../shared/tatolab_backend_contract";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often the shown stream's graph is read while it is loaded. */
export const STREAM_GRAPH_POLL_MILLISECONDS = 2500;

/** What the window knows of one stream's graph. */
export interface StreamGraphReading {
  /** The graph last read, kept in memory only, for this window's session. */
  graph: StreamGraphSummary | null;
  /** `loaded` while the stream is loaded and this graph was read since it last loaded; `as_of_the_last_load` once it is not, or until the new load is read. */
  graphSource: "loaded" | "as_of_the_last_load";
  /** The runtime's words when the last read of the loaded stream was refused; `null` once a read answers. */
  readRefusal: string | null;
}

const NOTHING_READ_YET: StreamGraphReading = { graph: null, graphSource: "as_of_the_last_load", readRefusal: null };

/**
 * The one reader of the shown stream's graph, which the Overview, Inspect and the graph canvas all show: it reads the
 * graph while the stream is loaded and the window lets it poll, and keeps the last graph read of every stream for the
 * session, so a stream that stops still shows its steps as of its last load.
 */
export class StreamGraphReadings {
  private readonly readingsByStream = new Map<string, StreamGraphReading>();
  private readonly readingListeners = new Set<() => void>();
  private readonly graphPoll: RepeatingBackendPoll;
  private shownStream: { streamId: string; isLoaded: boolean } | null = null;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeStreamGraph">,
    pollMilliseconds: number = STREAM_GRAPH_POLL_MILLISECONDS,
  ) {
    this.graphPoll = new RepeatingBackendPoll(() => this.readTheShownStreamsGraph(), pollMilliseconds);
  }

  /** The reading of `streamId`, the same object until it changes. */
  readonly readingOf = (streamId: string): StreamGraphReading => this.readingsByStream.get(streamId) ?? NOTHING_READ_YET;

  /** Calls `readingListener` after each change to any stream's reading; the returned function stops it. */
  readonly subscribeToReadings = (readingListener: () => void): (() => void) => {
    this.readingListeners.add(readingListener);
    return () => this.readingListeners.delete(readingListener);
  };

  /** Read `streamId`'s graph from now on while `isLoaded`, and none while it is not, or no stream's when `null`. */
  showStream(streamId: string | null, isLoaded: boolean): void {
    const isTheSameLoadedStream = isLoaded && this.shownStream?.streamId === streamId && this.shownStream.isLoaded;
    this.shownStream = streamId === null ? null : { streamId, isLoaded };
    if (streamId !== null && !isLoaded) {
      this.updateReading(streamId, { graphSource: "as_of_the_last_load", readRefusal: null });
    }
    // Another stream, or a new load, is read at once rather than at the poll's next interval.
    if (!isTheSameLoadedStream) this.graphPoll.stop();
    this.updatePolling();
  }

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.updatePolling();
  }

  /** Read the shown stream's graph at once, as a new listing of it asks. */
  pollNow(): void {
    this.graphPoll.pollNow();
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.shownStream?.isLoaded === true) this.graphPoll.start();
    else this.graphPoll.stop();
  }

  private isStillShownLoaded(streamId: string): boolean {
    return this.shownStream?.streamId === streamId && this.shownStream.isLoaded;
  }

  private async readTheShownStreamsGraph(): Promise<void> {
    const shownStream = this.shownStream;
    if (shownStream === null || !shownStream.isLoaded) return;
    const { streamId } = shownStream;
    try {
      const graph = await this.backend.describeStreamGraph(streamId);
      if (this.isStillShownLoaded(streamId)) this.updateReading(streamId, { graph, graphSource: "loaded", readRefusal: null });
    } catch (rejection) {
      if (this.isStillShownLoaded(streamId)) this.updateReading(streamId, { readRefusal: describeBackendRejection(rejection) });
    }
  }

  private updateReading(streamId: string, readingChanges: Partial<StreamGraphReading>): void {
    const reading = this.readingOf(streamId);
    const changedReading = { ...reading, ...readingChanges };
    const isUnchanged =
      changedReading.graph === reading.graph &&
      changedReading.graphSource === reading.graphSource &&
      changedReading.readRefusal === reading.readRefusal;
    if (isUnchanged) return;
    this.readingsByStream.set(streamId, changedReading);
    for (const readingListener of this.readingListeners) readingListener();
  }
}
