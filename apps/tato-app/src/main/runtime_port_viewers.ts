// The Node visualizer's reads of any output port of any running node: one `/control/ws` connection for every
// viewer the app's windows hold, one runtime viewer per port however many windows show it. Opening, closing
// and reopening a viewer run as Effects whose failures are typed, so each one is recovered from as it should
// be and shown in the viewer with its recovery: a port whose stream does not run yet, a connection the runtime
// dropped and a reload that replaced the port's node are waited out and opened again; a port the viewer
// cannot read ends with a way to open it again. What each viewer reads of its port is `RuntimePortViewerReads`'s.

import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import { Data, Deferred, Effect, Fiber } from "effect";
import type { PortViewerEvent, PortViewerRecovery, PortViewerTarget, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { fromResult, resultInWordsOf } from "./result_as_effect.js";
import { describeCaughtFailure, type Result } from "./result.js";
import { RuntimePortViewerReads, type RuntimePortViewerReadsEnded, type WindowShowingPortViewers } from "./runtime_port_viewer_reads.js";
import type { OpenedRuntimeViewer, RuntimeViewerConnection } from "./runtime_viewer_control_connection.js";
import type { RuntimeViewerChannelReaderOfTheAddon } from "./runtime_viewer_image_frame_import.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

export type { WindowShowingPortViewers } from "./runtime_port_viewer_reads.js";

/** No connection to the runtime opened for port viewers, in the words of why. */
export class PortViewerConnectionNotOpened extends Data.TaggedError("PortViewerConnectionNotOpened")<{ readonly words: string }> {}

/** The runtime did not open a viewer of the port, in its own words; `theRuntimeRefusedIt` when it was `open_viewer`'s own refusal rather than a call that went unanswered. */
export class PortViewerOpenRefused extends Data.TaggedError("PortViewerOpenRefused")<{ readonly words: string; readonly theRuntimeRefusedIt: boolean }> {}

/** The runtime opened a viewer of the port but this app cannot read it: the addon refused its channel, or its writes cannot be followed. */
export class PortViewerPortNotRead extends Data.TaggedError("PortViewerPortNotRead")<{ readonly words: string }> {}

/** Why a runtime viewer of a port did not open. */
export type PortViewerOpenFailure = PortViewerConnectionNotOpened | PortViewerOpenRefused | PortViewerPortNotRead;

/** What the port viewers reach: the runtime, the viewer addon, and the wait before a port opens again. */
export interface RuntimePortViewersSources {
  /** A connection to the runtime the port viewers are opened over. */
  openTheViewerConnection: Effect.Effect<RuntimeViewerConnection, PortViewerConnectionNotOpened>;
  /** The addon's reader of the channel `openedViewer` names, as the iceoryx2 node `viewerNodeName`; refused in the addon's words, or because this build carries no addon. */
  openAChannelReader(openedViewer: OpenedRuntimeViewer, viewerNodeName: string): Result<RuntimeViewerChannelReaderOfTheAddon, string>;
  /** The process that imports the frames, which `open_viewer` admits on macOS: the main process. */
  viewerProcessId: number;
  /** The wait before a port opens again: `PORT_VIEWER_REOPEN_AFTER_MS`. */
  waitBeforeReopening: Effect.Effect<void>;
  /** The state the runtime's last listing gives the stream `stream`, or `null` when it lists no such stream. */
  streamStateTheRuntimeListsNow(stream: string): string | null;
  tatolabAppLog: TatolabAppLog;
}

/** How long a port viewer waits, after its connection to the runtime closed or its stream was not yet running, before it opens the port again. */
export const PORT_VIEWER_REOPEN_AFTER_MS = 1_000;

/** One window's port viewer. */
interface PortViewerSubscription {
  target: PortViewerTarget;
  windowShowingPortViewers: WindowShowingPortViewers;
}

/** One runtime viewer held open, shared by every port viewer of its port, and the connection it was opened on. */
interface RuntimeViewerHeldOpen {
  openedViewer: OpenedRuntimeViewer;
  channelReader: RuntimeViewerChannelReaderOfTheAddon;
  reads: RuntimePortViewerReads;
  connection: RuntimeViewerConnection;
}

/** The listed states of a stream whose nodes run once its project is started, resumed or done stopping, so `open_viewer`'s refusal on it is waited out. */
const STREAM_STATES_A_PORT_VIEWER_WAITS_OUT: ReadonlySet<string> = new Set(["stopped", "paused", "preparing", "stopping"]);

/** The listed states of a stream a load or a stop is working on: its nodes, and the channels a runtime viewer held open on them, are being replaced. */
const STREAM_STATES_WHILE_ITS_NODES_ARE_REPLACED: ReadonlySet<string> = new Set(["preparing", "stopping"]);

/** Why no port viewer opens once the app began to quit. */
const THE_APP_IS_QUITTING = "the app is quitting";

/** How a port viewer recovers once its reads ended in each way. */
const RECOVERY_ONCE_THE_READS_ENDED: Record<RuntimePortViewerReadsEnded["kind"], PortViewerRecovery> = {
  the_node_stopped_writing: "shows_once_the_node_runs",
  the_frames_cannot_reach_a_window: "open_the_port_again",
};

/** Whether the runtime lists `listedStream` with a stream action working on it, which replaces its nodes. */
function aStreamActionReplacesTheNodesOf(listedStream: ListedStream): boolean {
  return listedStream.action !== null || STREAM_STATES_WHILE_ITS_NODES_ARE_REPLACED.has(listedStream.state);
}

/** A port viewer event every port viewer of one port is told, without the id each gets it under. */
type EventToEveryPortViewerOfAPort = Extract<PortViewerEvent, { kind: "reopening" | "ended" }> extends infer Event ? (Event extends unknown ? Omit<Event, "port_viewer"> : never) : never;

/** `open` run once for `key` however many ask for it while it runs, in a fiber of its own: a caller interrupted while it waits stops waiting, and the opening goes on for the others. */
function sharedWhileInFlight<K, A, E>(inFlight: Map<K, Deferred.Deferred<A, E>>, key: K, open: Effect.Effect<A, E>): Effect.Effect<A, E> {
  return Effect.suspend(() => {
    const beingOpened = inFlight.get(key);
    if (beingOpened !== undefined) return Deferred.await(beingOpened);
    const opening = Deferred.makeUnsafe<A, E>();
    inFlight.set(key, opening);
    const openedAndShared = open.pipe(
      Effect.onExit((exit) =>
        Effect.suspend(() => {
          inFlight.delete(key);
          return Deferred.done(opening, exit);
        }),
      ),
    );
    return Effect.forkDetach(openedAndShared).pipe(Effect.andThen(Deferred.await(opening)));
  });
}

function portViewerTargetKey(target: PortViewerTarget): string {
  return JSON.stringify([target.stream, target.node_id, target.port]);
}

/** Every port viewer the app's windows hold, by the id each was opened under. */
export class RuntimePortViewers {
  private readonly subscriptionsByPortViewer = new Map<string, PortViewerSubscription>();
  private readonly runtimeViewersByTargetKey = new Map<string, RuntimeViewerHeldOpen>();
  private readonly openingsByTargetKey = new Map<string, Deferred.Deferred<RuntimeViewerHeldOpen, PortViewerOpenFailure>>();
  /** How many port viewers of each port are waiting for its runtime viewer to open, so it is not closed under them as one of its port viewers closes. */
  private readonly portViewersWaitingByTargetKey = new Map<string, number>();
  private readonly connectionOpenings = new Map<"connection", Deferred.Deferred<RuntimeViewerConnection, PortViewerConnectionNotOpened>>();
  private readonly reopeningsByTargetKey = new Map<string, Fiber.Fiber<void>>();
  private readonly streamsSeenWhileTheirNodesWereReplaced = new Set<string>();
  private viewerConnection: RuntimeViewerConnection | null = null;
  private hasQuit = false;
  private portViewersOpened = 0;

  constructor(private readonly sources: RuntimePortViewersSources) {}

  /** Open a port viewer of `target` for `windowShowingPortViewers`, answering the id its events arrive under; refused in the runtime's or the addon's words. */
  openAPortViewer(target: PortViewerTarget, windowShowingPortViewers: WindowShowingPortViewers): Promise<Result<{ port_viewer: string }, string>> {
    return Effect.runPromise(resultInWordsOf(this.portViewerOpened(target, windowShowingPortViewers)));
  }

  /** Close the port viewer `portViewer` that `windowShowingPortViewers` opened, and its runtime viewer once no window shows that port; one already closed, or another window's, is left as it is. */
  closeAPortViewer(portViewer: string, windowShowingPortViewers: WindowShowingPortViewers): void {
    if (this.subscriptionsByPortViewer.get(portViewer)?.windowShowingPortViewers !== windowShowingPortViewers) return;
    Effect.runFork(this.portViewerClosed(portViewer));
  }

  /** Close every port viewer `windowShowingPortViewers` opened, as it closes. */
  closeThePortViewersOf(windowShowingPortViewers: WindowShowingPortViewers): void {
    const portViewersOfTheWindow = [...this.subscriptionsByPortViewer].filter(([, subscription]) => subscription.windowShowingPortViewers === windowShowingPortViewers);
    Effect.runFork(Effect.forEach(portViewersOfTheWindow, ([portViewer]) => this.portViewerClosed(portViewer), { discard: true }));
  }

  /** Close the connection the port viewers share as the app quits, which closes every runtime viewer opened on it, then let go of what this app held of them; a connection still opening is closed once it opens. */
  closeEveryPortViewer(): void {
    this.hasQuit = true;
    const connection = this.viewerConnection;
    this.viewerConnection = null;
    this.subscriptionsByPortViewer.clear();
    Effect.runFork(
      (connection === null ? Effect.void : connection.close).pipe(
        Effect.andThen(Effect.suspend(() => Fiber.interruptAll(this.reopeningsByTargetKey.values()))),
        Effect.andThen(Effect.forEach([...this.runtimeViewersByTargetKey.keys()], (targetKey) => this.runtimeViewerClosed(targetKey), { discard: true })),
      ),
    );
  }

  /** Open again each runtime viewer of a stream the runtime listed with a stream action working on it and now lists without one, and not stopped between a reload's stop and its start: a reload replaced the node it read, whose new channel the viewer held open does not carry. */
  noticeStatus(status: Pick<TatolabStatus, "streams">): void {
    for (const listedStream of status.streams ?? []) {
      if (aStreamActionReplacesTheNodesOf(listedStream)) {
        this.streamsSeenWhileTheirNodesWereReplaced.add(listedStream.stream);
      } else if (listedStream.state !== "stopped" && this.streamsSeenWhileTheirNodesWereReplaced.delete(listedStream.stream)) {
        Effect.runFork(this.everyRuntimeViewerOfTheStreamReopened(listedStream.stream));
      }
    }
  }

  private portViewerOpened(target: PortViewerTarget, windowShowingPortViewers: WindowShowingPortViewers): Effect.Effect<{ port_viewer: string }, PortViewerOpenFailure> {
    return Effect.suspend(() => {
      const targetKey = portViewerTargetKey(target);
      this.portViewersWaitingByTargetKey.set(targetKey, (this.portViewersWaitingByTargetKey.get(targetKey) ?? 0) + 1);
      return this.runtimeViewerOf(target).pipe(
        Effect.as(true),
        Effect.catchTag("PortViewerOpenRefused", (refusal) => (this.isTheStreamNotYetRunning(target, refusal) ? Effect.succeed(false) : Effect.fail(refusal))),
        Effect.flatMap((isHeldOpen) =>
          Effect.suspend(() => {
            this.portViewersOpened += 1;
            const portViewer = `port-viewer-${this.portViewersOpened}`;
            this.subscriptionsByPortViewer.set(portViewer, { target, windowShowingPortViewers });
            return (isHeldOpen ? Effect.void : this.reopenAfterAWait(targetKey)).pipe(Effect.as({ port_viewer: portViewer }));
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            const stillWaiting = (this.portViewersWaitingByTargetKey.get(targetKey) ?? 1) - 1;
            if (stillWaiting === 0) this.portViewersWaitingByTargetKey.delete(targetKey);
            else this.portViewersWaitingByTargetKey.set(targetKey, stillWaiting);
          }),
        ),
      );
    });
  }

  private portViewerClosed(portViewer: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      const subscription = this.subscriptionsByPortViewer.get(portViewer);
      if (subscription === undefined) return Effect.void;
      this.subscriptionsByPortViewer.delete(portViewer);
      const targetKey = portViewerTargetKey(subscription.target);
      if (this.isThePortShown(targetKey)) return Effect.void;
      return Effect.all([this.stopReopening(targetKey), this.runtimeViewerClosed(targetKey)], { discard: true });
    });
  }

  private isTheStreamNotYetRunning(target: PortViewerTarget, refusal: PortViewerOpenRefused): boolean {
    const listedState = this.sources.streamStateTheRuntimeListsNow(target.stream);
    return refusal.theRuntimeRefusedIt && listedState !== null && STREAM_STATES_A_PORT_VIEWER_WAITS_OUT.has(listedState);
  }

  /** Whether a port viewer shows the port `targetKey` names, or waits for its runtime viewer to open. */
  private isThePortShown(targetKey: string): boolean {
    return this.portViewersWaitingByTargetKey.has(targetKey) || this.subscriptionsOf(targetKey).length > 0;
  }

  private subscriptionsOf(targetKey: string): [string, PortViewerSubscription][] {
    return [...this.subscriptionsByPortViewer].filter(([, subscription]) => portViewerTargetKey(subscription.target) === targetKey);
  }

  private tellEveryPortViewerOf(targetKey: string, event: EventToEveryPortViewerOfAPort): void {
    for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, ...event });
  }

  /** The connection the port viewers share, opened once however many ask for it at a time. */
  private theViewerConnection(): Effect.Effect<RuntimeViewerConnection, PortViewerConnectionNotOpened> {
    return Effect.suspend(() => {
      if (this.hasQuit) return Effect.fail(new PortViewerConnectionNotOpened({ words: THE_APP_IS_QUITTING }));
      const held = this.viewerConnection;
      const opened = sharedWhileInFlight(this.connectionOpenings, "connection", this.sources.openTheViewerConnection.pipe(Effect.tap((connection) => this.connectionHeld(connection))));
      return held === null ? opened : Effect.flatMap(held.isOpen, (isOpen) => (isOpen ? Effect.succeed(held) : opened));
    });
  }

  /** Hold `connection` for the port viewers, a connection the runtime drops reopening every viewer it held; one that opened as the app quit is closed. */
  private connectionHeld(connection: RuntimeViewerConnection): Effect.Effect<void, PortViewerConnectionNotOpened> {
    return Effect.suspend(() => {
      if (this.hasQuit) return connection.close.pipe(Effect.andThen(Effect.fail(new PortViewerConnectionNotOpened({ words: THE_APP_IS_QUITTING }))));
      this.viewerConnection = connection;
      return Effect.asVoid(Effect.forkDetach(Effect.flatMap(connection.whyItClosed, (whyItClosed) => this.everyRuntimeViewerReopenedAfter(connection, whyItClosed))));
    });
  }

  /** The runtime viewer of `target`'s port, held open already, being opened, or opened now; one that opened once no port viewer shows the port any more is closed again. */
  private runtimeViewerOf(target: PortViewerTarget): Effect.Effect<RuntimeViewerHeldOpen, PortViewerOpenFailure> {
    return Effect.suspend(() => {
      const targetKey = portViewerTargetKey(target);
      const heldOpen = this.runtimeViewersByTargetKey.get(targetKey);
      if (heldOpen !== undefined) return Effect.succeed(heldOpen);
      return sharedWhileInFlight(
        this.openingsByTargetKey,
        targetKey,
        this.runtimeViewerOpened(target, targetKey).pipe(Effect.tap(() => (this.isThePortShown(targetKey) ? Effect.void : this.runtimeViewerClosed(targetKey)))),
      );
    });
  }

  /** A runtime viewer of `target`'s port opened, its channel read and its writes followed; whatever opened before a step that failed is closed again. */
  private runtimeViewerOpened(target: PortViewerTarget, targetKey: string): Effect.Effect<RuntimeViewerHeldOpen, PortViewerOpenFailure> {
    const { sources } = this;
    return Effect.gen({ self: this }, function* () {
      const connection = yield* this.theViewerConnection();
      const openedViewer = yield* connection
        .openViewer({ ...target, viewer_process_id: sources.viewerProcessId })
        .pipe(Effect.mapError((failure) => new PortViewerOpenRefused({ words: failure.words, theRuntimeRefusedIt: failure.theRuntimeRefusedIt })));
      const closeTheViewer = this.viewerClosedOn(connection, openedViewer.viewer);
      const runForkHere = Effect.runForkWith(yield* Effect.context<never>());
      const channelReader = yield* fromResult(sources.openAChannelReader(openedViewer, `tato-studio-viewer-${sources.viewerProcessId}`), (words) => new PortViewerPortNotRead({ words })).pipe(
        Effect.tapError(() => closeTheViewer),
      );
      const reads = new RuntimePortViewerReads({
        openedViewer,
        channelReader,
        windowsShowingThePort: () => this.subscriptionsOf(targetKey).map(([portViewer, subscription]) => [portViewer, subscription.windowShowingPortViewers] as const),
        whenTheReadsEnd: (ended) => runForkHere(this.everyPortViewerEnded(targetKey, heldOpen, ended)),
        tatolabAppLog: sources.tatolabAppLog,
      });
      const heldOpen: RuntimeViewerHeldOpen = { openedViewer, channelReader, reads, connection };
      this.runtimeViewersByTargetKey.set(targetKey, heldOpen);
      yield* Effect.try({
        try: () => reads.followWrites(),
        catch: (followRefusal) => new PortViewerPortNotRead({ words: `the viewer could not follow the port's writes: ${describeCaughtFailure(followRefusal)}` }),
      }).pipe(Effect.tapError(() => this.runtimeViewerClosed(targetKey)));
      sources.tatolabAppLog.info("opened a runtime viewer", { viewer: openedViewer.viewer });
      return heldOpen;
    });
  }

  /** Close the viewer `viewer` on `connection` while it is open, a refusal logged: a connection that closed took its viewers with it. */
  private viewerClosedOn(connection: RuntimeViewerConnection, viewer: string): Effect.Effect<void> {
    return Effect.flatMap(connection.isOpen, (isOpen) =>
      isOpen
        ? connection.closeViewer(viewer).pipe(
            Effect.catch((refusal) => Effect.sync(() => this.sources.tatolabAppLog.debug("a runtime viewer did not close", { viewer, failure: refusal.words }))),
            Effect.asVoid,
          )
        : Effect.void,
    );
  }

  /** Stop the reads of the runtime viewer of the port `targetKey` names and close it, its channel reader at once and the viewer on its connection. */
  private runtimeViewerClosed(targetKey: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      const heldOpen = this.runtimeViewersByTargetKey.get(targetKey);
      if (heldOpen === undefined) return Effect.void;
      this.runtimeViewersByTargetKey.delete(targetKey);
      heldOpen.reads.stop();
      heldOpen.channelReader.close();
      return this.viewerClosedOn(heldOpen.connection, heldOpen.openedViewer.viewer);
    });
  }

  /** End every port viewer of the port `targetKey` names because its reads ended, saying how it recovers. */
  private everyPortViewerEnded(targetKey: string, heldOpen: RuntimeViewerHeldOpen, ended: RuntimePortViewerReadsEnded): Effect.Effect<void> {
    return Effect.suspend(() => {
      if (this.runtimeViewersByTargetKey.get(targetKey) !== heldOpen) return Effect.void;
      return this.stopReopening(targetKey).pipe(Effect.andThen(this.everyPortViewerOfThePortEnded(targetKey, ended.words, RECOVERY_ONCE_THE_READS_ENDED[ended.kind])));
    });
  }

  /** Tell every port viewer of the port `targetKey` names that it ended `because`, and how it recovers, and close its runtime viewer. */
  private everyPortViewerOfThePortEnded(targetKey: string, because: string, recovery: PortViewerRecovery): Effect.Effect<void> {
    return Effect.suspend(() => {
      this.tellEveryPortViewerOf(targetKey, { kind: "ended", because, recovery });
      for (const [portViewer] of this.subscriptionsOf(targetKey)) this.subscriptionsByPortViewer.delete(portViewer);
      return this.runtimeViewerClosed(targetKey);
    });
  }

  /** Close the runtime viewer of the port `targetKey` names, tell its port viewers it is reopening `because`, and open it again after a wait. */
  private runtimeViewerReopenedBecause(targetKey: string, because: string): Effect.Effect<void> {
    return this.runtimeViewerClosed(targetKey).pipe(
      Effect.andThen(Effect.sync(() => this.tellEveryPortViewerOf(targetKey, { kind: "reopening", because }))),
      Effect.andThen(this.reopenAfterAWait(targetKey)),
    );
  }

  private everyRuntimeViewerOfTheStreamReopened(stream: string): Effect.Effect<void> {
    return Effect.suspend(() =>
      Effect.forEach(
        [...this.runtimeViewersByTargetKey].filter(([, heldOpen]) => heldOpen.openedViewer.stream === stream),
        ([targetKey, heldOpen]) => this.runtimeViewerReopenedBecause(targetKey, `${heldOpen.openedViewer.node_name} › ${heldOpen.openedViewer.port} was replaced as its project loaded again.`),
        { discard: true },
      ),
    );
  }

  private everyRuntimeViewerReopenedAfter(closedConnection: RuntimeViewerConnection, whyItClosed: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      if (this.viewerConnection !== closedConnection) return Effect.void;
      this.viewerConnection = null;
      return Effect.forEach([...this.runtimeViewersByTargetKey.keys()], (targetKey) => this.runtimeViewerReopenedBecause(targetKey, whyItClosed), { discard: true });
    });
  }

  /** Open the port `targetKey` names again after a wait, and again after each wait that follows a failure the port viewers wait out, while a window shows it; one reopening per port. */
  private reopenAfterAWait(targetKey: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      if (this.reopeningsByTargetKey.has(targetKey)) return Effect.void;
      const forgottenOnceDone = Effect.withFiber((reopening) =>
        Effect.sync(() => {
          if (this.reopeningsByTargetKey.get(targetKey) === reopening) this.reopeningsByTargetKey.delete(targetKey);
        }),
      );
      // Started at once, so it is waiting by the time the port viewer that asked for it opens; one done already is not kept.
      return Effect.forkDetach(this.reopenedAfterEachWait(targetKey).pipe(Effect.ensuring(forgottenOnceDone)), { startImmediately: true }).pipe(
        Effect.map((reopening) => {
          if (reopening.pollUnsafe() === undefined) this.reopeningsByTargetKey.set(targetKey, reopening);
        }),
      );
    });
  }

  private reopenedAfterEachWait(targetKey: string): Effect.Effect<void> {
    const reopenedOnce: Effect.Effect<boolean> = Effect.gen({ self: this }, function* () {
      yield* this.sources.waitBeforeReopening;
      const [firstSubscription] = this.subscriptionsOf(targetKey);
      if (firstSubscription === undefined || this.runtimeViewersByTargetKey.has(targetKey)) return true;
      return yield* this.runtimeViewerOf(firstSubscription[1].target).pipe(
        Effect.as(true),
        Effect.catchTag("PortViewerPortNotRead", (notRead) => this.everyPortViewerOfThePortEnded(targetKey, notRead.words, "open_the_port_again").pipe(Effect.as(true))),
        Effect.catch((failure) => Effect.sync(() => this.tellEveryPortViewerOf(targetKey, { kind: "reopening", because: failure.words })).pipe(Effect.as(false))),
        Effect.catchDefect((defect) => {
          const words = `reopening the port broke: ${describeCaughtFailure(defect)}`;
          this.sources.tatolabAppLog.error("a port viewer's reopening broke", { failure: words });
          return this.everyPortViewerOfThePortEnded(targetKey, words, "open_the_port_again").pipe(Effect.as(true));
        }),
      );
    });
    return Effect.repeat(reopenedOnce, { until: (isDone) => isDone }).pipe(Effect.asVoid);
  }

  private stopReopening(targetKey: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      const reopening = this.reopeningsByTargetKey.get(targetKey);
      this.reopeningsByTargetKey.delete(targetKey);
      return reopening === undefined ? Effect.void : Fiber.interrupt(reopening);
    });
  }
}
