// Each stream's graph and input values as the host serves them to its views: one
// reading per stream, however many views watch it, kept only while one does and the window is shown.
// The graph is read as a view starts watching it, and again at once on each change the runtime
// pushes, and, for a stream the runtime does not list loaded, which it pushes no change of, on each
// transaction the project's feed announces; one read at a time. A change of the value an input reads is applied to the values kept and
// reads nothing.

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { StreamInputValuesReadings } from "./stream_input_values_readings";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import type { StopWatching, StreamGraphReading, StreamInputValuesReading } from "./studio_view_contract";

/** What the host reads a stream's graph through, and is told of its graph's changes by. */
type StreamGraphBackend = Pick<TatolabBackend, "describeStreamGraph" | "followStreamGraphChanges" | "stopFollowingStreamGraphChanges" | "onStreamGraphChanged" | "onProjectTransactionsChanged">;

/** Whether the runtime holds `listed` loaded, and so pushes each change of its graph: by its condition's load, or, from a runtime that lists no condition, while it runs. */
function doesTheRuntimePushTheChangesOf(listed: ListedStream): boolean {
  return listed.condition === null ? listed.state === "running" : listed.condition.load === "loaded";
}

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
  readonly inputValues = new StreamInputValuesReadings();
  private isGraphReadInFlight = false;
  private isAnotherGraphReadWanted = false;
  private isFollowingTheGraphChanges = false;

  constructor(
    private readonly stream: string,
    private readonly backend: StreamGraphBackend,
  ) {}

  /** Read the graph and follow its pushed changes while `isWatched`. */
  setWatched(isWatched: boolean): void {
    if (isWatched === this.isFollowingTheGraphChanges) return;
    this.isFollowingTheGraphChanges = isWatched;
    if (isWatched) {
      this.readTheGraphAgain();
      void this.backend.followStreamGraphChanges(this.stream).catch((rejection: unknown) => this.graph.publish({ kind: "not_read", because: describeBackendRejection(rejection) }));
      return;
    }
    this.isAnotherGraphReadWanted = false;
    void this.backend.stopFollowingStreamGraphChanges(this.stream).catch(() => undefined);
  }

  /** Read the graph again at once, or right after the read in flight, as the runtime pushed a change to it. */
  readTheGraphAgain(): void {
    if (!this.isFollowingTheGraphChanges) return;
    if (this.isGraphReadInFlight) {
      this.isAnotherGraphReadWanted = true;
      return;
    }
    this.isGraphReadInFlight = true;
    void this.readTheGraph().finally(() => {
      this.isGraphReadInFlight = false;
      if (!this.isAnotherGraphReadWanted) return;
      this.isAnotherGraphReadWanted = false;
      this.readTheGraphAgain();
    });
  }

  /** Each reading's values reach the views before the graph does, so a node drawn from it shows its values at once. */
  private async readTheGraph(): Promise<void> {
    this.inputValues.readStarting();
    try {
      const graph = await this.backend.describeStreamGraph(this.stream);
      this.inputValues.readLanded(graph);
      this.graph.publish({ kind: "read", graph });
    } catch (rejection) {
      this.inputValues.readLanded(null);
      this.graph.publish({ kind: "not_read", because: describeBackendRejection(rejection) });
    }
  }
}

/** Every watched stream's graph and input values, read through `backend`. */
export class StreamGraphReadings {
  private readonly readingsByStream = new Map<string, OneStreamsReadings>();
  private readonly streamsWhoseChangesThePushesCarry = new Set<string>();
  private isReadingAllowed = true;

  constructor(private readonly backend: StreamGraphBackend) {
    backend.onStreamGraphChanged((stream, inputValueChange) => {
      const readings = this.readingsByStream.get(stream);
      if (inputValueChange === null) readings?.readTheGraphAgain();
      else readings?.inputValues.takeTheChange(inputValueChange);
    });
    backend.onProjectTransactionsChanged(() => {
      for (const [stream, readings] of this.readingsByStream) if (!this.streamsWhoseChangesThePushesCarry.has(stream)) readings.readTheGraphAgain();
    });
  }

  /**
   * Take the streams the runtime lists now, from each status the window is shown: a watched stream it has loaded or unloaded
   * since the last is read again, as its graph changes from the running one to the saved one or back.
   */
  takeTheStreamsListed(streams: readonly ListedStream[] | null): void {
    const pushedBefore = new Set(this.streamsWhoseChangesThePushesCarry);
    this.streamsWhoseChangesThePushesCarry.clear();
    for (const listed of streams ?? []) if (doesTheRuntimePushTheChangesOf(listed)) this.streamsWhoseChangesThePushesCarry.add(listed.stream);
    for (const [stream, readings] of this.readingsByStream) if (pushedBefore.has(stream) !== this.streamsWhoseChangesThePushesCarry.has(stream)) readings.readTheGraphAgain();
  }

  /** Read only while the window is shown. */
  setReadingAllowed(isAllowed: boolean): void {
    this.isReadingAllowed = isAllowed;
    for (const readings of this.readingsByStream.values()) this.updateWhetherItIsRead(readings);
  }

  readonly watchStreamGraph = (stream: string, listener: (reading: StreamGraphReading) => void): StopWatching => {
    const readings = this.readingsOf(stream);
    return this.stopWatchingOnce(readings, readings.graph.watch(listener));
  };

  readonly watchStreamInputValues = (stream: string, listener: (reading: StreamInputValuesReading) => void): StopWatching => {
    const readings = this.readingsOf(stream);
    return this.stopWatchingOnce(readings, readings.inputValues.watch(listener));
  };

  private readingsOf(stream: string): OneStreamsReadings {
    const knownReadings = this.readingsByStream.get(stream);
    if (knownReadings !== undefined) return knownReadings;
    const readings = new OneStreamsReadings(stream, this.backend);
    this.readingsByStream.set(stream, readings);
    return readings;
  }

  /** The graph is read for the values' watchers as well, so the values follow the graph. */
  private updateWhetherItIsRead(readings: OneStreamsReadings): void {
    readings.setWatched(this.isReadingAllowed && readings.graph.watcherCount + readings.inputValues.watcherCount > 0);
  }

  private stopWatchingOnce(readings: OneStreamsReadings, stopTheListener: () => void): StopWatching {
    this.updateWhetherItIsRead(readings);
    let hasStopped = false;
    return () => {
      if (hasStopped) return;
      hasStopped = true;
      stopTheListener();
      this.updateWhetherItIsRead(readings);
    };
  }
}
