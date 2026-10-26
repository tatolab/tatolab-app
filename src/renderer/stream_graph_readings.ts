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
  /** Which load of the stream its log follower last read, as the runtime names it; `null` while it is not loaded. */
  streamInstance: string | null;
}

const NOTHING_READ_YET: StreamGraphReading = { graph: null, graphSource: "as_of_the_last_load", readRefusal: null, streamInstance: null };

/**
 * The one reader of the shown stream's graph, which the Overview, Inspect and the graph canvas all show: it reads the
 * graph while the stream is loaded and the window lets it poll, and keeps the last graph read of every stream for the
 * session, so a stream that stops still shows its steps as of its last load.
 */
export class StreamGraphReadings {
  private readonly readingsByStream = new Map<string, StreamGraphReading>();
  private readonly readingListeners = new Set<() => void>();
  private readonly graphPoll: RepeatingBackendPoll;
  private shownStream: { streamName: string; isLoaded: boolean } | null = null;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeStreamGraph">,
    pollMilliseconds: number = STREAM_GRAPH_POLL_MILLISECONDS,
  ) {
    this.graphPoll = new RepeatingBackendPoll(() => this.readTheShownStreamsGraph(), pollMilliseconds);
  }

  /** The reading of `streamName`, the same object until it changes. */
  readonly readingOf = (streamName: string): StreamGraphReading => this.readingsByStream.get(streamName) ?? NOTHING_READ_YET;

  /** Calls `readingListener` after each change to any stream's reading; the returned function stops it. */
  readonly subscribeToReadings = (readingListener: () => void): (() => void) => {
    this.readingListeners.add(readingListener);
    return () => this.readingListeners.delete(readingListener);
  };

  /** Read `streamName`'s graph from now on while `isLoaded`, and none while it is not, or no stream's when `null`. */
  showStream(streamName: string | null, isLoaded: boolean): void {
    const isTheSameLoadedStream = isLoaded && this.shownStream?.streamName === streamName && this.shownStream.isLoaded;
    this.shownStream = streamName === null ? null : { streamName, isLoaded };
    if (streamName !== null && !isLoaded) {
      this.updateReading(streamName, { graphSource: "as_of_the_last_load", readRefusal: null, streamInstance: null });
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

  /** The load of `streamName` its log follower read, which the Overview's details name. */
  rememberStreamInstance(streamName: string, streamInstance: string): void {
    if (this.readingOf(streamName).streamInstance !== streamInstance) this.updateReading(streamName, { streamInstance });
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.shownStream?.isLoaded === true) this.graphPoll.start();
    else this.graphPoll.stop();
  }

  private isStillShownLoaded(streamName: string): boolean {
    return this.shownStream?.streamName === streamName && this.shownStream.isLoaded;
  }

  private async readTheShownStreamsGraph(): Promise<void> {
    const shownStream = this.shownStream;
    if (shownStream === null || !shownStream.isLoaded) return;
    const { streamName } = shownStream;
    try {
      const graph = await this.backend.describeStreamGraph(streamName);
      if (this.isStillShownLoaded(streamName)) this.updateReading(streamName, { graph, graphSource: "loaded", readRefusal: null });
    } catch (rejection) {
      if (this.isStillShownLoaded(streamName)) this.updateReading(streamName, { readRefusal: describeBackendRejection(rejection) });
    }
  }

  private updateReading(streamName: string, readingChanges: Partial<StreamGraphReading>): void {
    const reading = this.readingOf(streamName);
    const changedReading = { ...reading, ...readingChanges };
    const isUnchanged =
      changedReading.graph === reading.graph &&
      changedReading.graphSource === reading.graphSource &&
      changedReading.readRefusal === reading.readRefusal &&
      changedReading.streamInstance === reading.streamInstance;
    if (isUnchanged) return;
    this.readingsByStream.set(streamName, changedReading);
    for (const readingListener of this.readingListeners) readingListener();
  }
}
