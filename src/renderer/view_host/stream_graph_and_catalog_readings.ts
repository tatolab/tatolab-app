// Each stream's graph and node catalog as the host serves them to its views: one poll per stream,
// however many views watch it, read only while one does and the window is shown.

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import type { NodeCatalogReading, StopWatching, StreamGraphReading } from "./studio_view_contract";

/** How often a watched stream's graph is read. */
export const STREAM_GRAPH_POLL_MILLISECONDS = 2500;

/** A reading every watcher is told of once there is one, then on each change. */
class LatestReadingWatchers<Reading> {
  private latestReading: Reading | null = null;
  private latestReadingJson: string | null = null;
  private readonly listeners = new Set<(reading: Reading) => void>();

  get watcherCount(): number {
    return this.listeners.size;
  }

  get latest(): Reading | null {
    return this.latestReading;
  }

  watch(listener: (reading: Reading) => void): () => void {
    this.listeners.add(listener);
    if (this.latestReading !== null) listener(this.latestReading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Keep `reading` and tell every watcher; a reading equal to the last as JSON tells none. */
  publish(reading: Reading): void {
    const readingJson = JSON.stringify(reading);
    if (readingJson === this.latestReadingJson) return;
    this.latestReading = reading;
    this.latestReadingJson = readingJson;
    for (const listener of [...this.listeners]) listener(reading);
  }
}

/** What the host reads of one stream. */
class OneStreamsReadings {
  readonly graph = new LatestReadingWatchers<StreamGraphReading>();
  readonly catalog = new LatestReadingWatchers<NodeCatalogReading>();
  readonly graphPoll: RepeatingBackendPoll;
  private isCatalogReadInFlight = false;

  constructor(
    private readonly stream: string,
    private readonly backend: Pick<TatolabBackend, "describeStreamGraph" | "describeNodeCatalog">,
    pollMilliseconds: number,
  ) {
    this.graphPoll = new RepeatingBackendPoll(() => this.readTheGraph(), pollMilliseconds);
  }

  /** Read the catalog when nobody has, after a refusal, or when the graph names a type it lacks; one read at a time. */
  readTheCatalogIfItFallsShort(): void {
    if (this.isCatalogReadInFlight || this.catalog.watcherCount === 0) return;
    const catalogReading = this.catalog.latest;
    const graphReading = this.graph.latest;
    const isListed = catalogReading?.kind === "listed";
    const typesListed = new Set(isListed ? catalogReading.catalog.node_types.map((nodeType) => nodeType.type) : []);
    const graphNamesAnUnlistedType = graphReading?.kind === "read" && graphReading.graph.nodes.some((node) => !typesListed.has(node.type));
    if (isListed && !graphNamesAnUnlistedType) return;
    this.isCatalogReadInFlight = true;
    this.backend.describeNodeCatalog(this.stream).then(
      (catalog) => {
        this.isCatalogReadInFlight = false;
        this.catalog.publish({ kind: "listed", catalog });
      },
      (rejection: unknown) => {
        this.isCatalogReadInFlight = false;
        this.catalog.publish({ kind: "not_listed", because: describeBackendRejection(rejection) });
      },
    );
  }

  private async readTheGraph(): Promise<void> {
    try {
      const graph = await this.backend.describeStreamGraph(this.stream);
      this.graph.publish({ kind: "read", graph });
    } catch (rejection) {
      this.graph.publish({ kind: "not_read", because: describeBackendRejection(rejection) });
    }
    this.readTheCatalogIfItFallsShort();
  }
}

/** Every watched stream's graph and node catalog, read through `backend`. */
export class StreamGraphAndCatalogReadings {
  private readonly readingsByStream = new Map<string, OneStreamsReadings>();
  private isPollingAllowed = true;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeStreamGraph" | "describeNodeCatalog">,
    private readonly pollMilliseconds: number = STREAM_GRAPH_POLL_MILLISECONDS,
  ) {}

  /** Read only while the window is shown. */
  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    for (const readings of this.readingsByStream.values()) this.updatePolling(readings);
  }

  readonly watchStreamGraph = (stream: string, listener: (reading: StreamGraphReading) => void): StopWatching => {
    const readings = this.readingsOf(stream);
    return this.stopWatchingOnce(readings, readings.graph.watch(listener));
  };

  readonly watchNodeCatalog = (stream: string, listener: (reading: NodeCatalogReading) => void): StopWatching => {
    const readings = this.readingsOf(stream);
    const stopWatchingTheCatalog = this.stopWatchingOnce(readings, readings.catalog.watch(listener));
    readings.readTheCatalogIfItFallsShort();
    return stopWatchingTheCatalog;
  };

  private readingsOf(stream: string): OneStreamsReadings {
    const knownReadings = this.readingsByStream.get(stream);
    if (knownReadings !== undefined) return knownReadings;
    const readings = new OneStreamsReadings(stream, this.backend, this.pollMilliseconds);
    this.readingsByStream.set(stream, readings);
    return readings;
  }

  /** The graph is polled for a catalog's watchers as well, so a reload that brings a new type reads the catalog again. */
  private updatePolling(readings: OneStreamsReadings): void {
    if (this.isPollingAllowed && readings.graph.watcherCount + readings.catalog.watcherCount > 0) readings.graphPoll.start();
    else readings.graphPoll.stop();
  }

  private stopWatchingOnce(readings: OneStreamsReadings, stopTheListener: () => void): StopWatching {
    this.updatePolling(readings);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updatePolling(readings);
    };
  }
}
