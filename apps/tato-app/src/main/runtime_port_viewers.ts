// The Node visualizer's reads of any output port of any running node: one `/control/ws` connection for every
// viewer the app's windows hold, one runtime viewer per port however many windows show it. Opening, closing
// and reopening a viewer run as Effects whose failures are typed, so each one is recovered from as it should
// be and shown in the viewer with its recovery: a port whose stream does not run yet, a connection the runtime
// dropped and a reload that replaced the port's node are waited out and opened again; a port the viewer
// cannot read ends with a way to open it again. What each viewer reads of its port is `RuntimePortViewerReads`'s.

import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import { Data, Deferred, Effect, Exit, Fiber } from "effect";
import type { PortViewerRecovery, PortViewerTarget, TatolabStatus } from "../shared/tatolab_backend_contract.js";
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

/** How a port viewer recovers once its reads ended in each way. */
const RECOVERY_ONCE_THE_READS_ENDED: Record<RuntimePortViewerReadsEnded["kind"], PortViewerRecovery> = {
  the_node_stopped_writing: "shows_once_the_node_runs",
  the_frames_cannot_reach_a_window: "open_the_port_again",
};

/** Whether the runtime lists `listedStream` with a stream action working on it, which replaces its nodes. */
function aStreamActionReplacesTheNodesOf(listedStream: ListedStream): boolean {
  return listedStream.action !== null || STREAM_STATES_WHILE_ITS_NODES_ARE_REPLACED.has(listedStream.state);
}

function portViewerTargetKey(target: PortViewerTarget): string {
  return JSON.stringify([target.stream, target.node_id, target.port]);
}

/** Every port viewer the app's windows hold, by the id each was opened under. */
export class RuntimePortViewers {
  private readonly subscriptionsByPortViewer = new Map<string, PortViewerSubscription>();
  private readonly runtimeViewersByTargetKey = new Map<string, RuntimeViewerHeldOpen>();
  private readonly openingsByTargetKey = new Map<string, Deferred.Deferred<RuntimeViewerHeldOpen, PortViewerOpenFailure>>();
  private readonly reopeningsByTargetKey = new Map<string, Fiber.Fiber<void>>();
  private readonly streamsSeenWhileTheirNodesWereReplaced = new Set<string>();
  private viewerConnection: RuntimeViewerConnection | null = null;
  private connectionBeingOpened: Deferred.Deferred<RuntimeViewerConnection, PortViewerConnectionNotOpened> | null = null;
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

  /** Close every port viewer and the connection they share, as the app quits. */
  closeEveryPortViewer(): void {
    const connection = this.viewerConnection;
    this.viewerConnection = null;
    Effect.runFork(
      Effect.forEach([...this.subscriptionsByPortViewer.keys()], (portViewer) => this.portViewerClosed(portViewer), { discard: true }).pipe(Effect.andThen(connection === null ? Effect.void : connection.close)),
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
    return this.runtimeViewerOf(target).pipe(
      Effect.as(true),
      Effect.catchTag("PortViewerOpenRefused", (refusal) => (this.isTheStreamNotYetRunning(target, refusal) ? Effect.succeed(false) : Effect.fail(refusal))),
      Effect.map((isHeldOpen) => {
        this.portViewersOpened += 1;
        const portViewer = `port-viewer-${this.portViewersOpened}`;
        this.subscriptionsByPortViewer.set(portViewer, { target, windowShowingPortViewers });
        if (!isHeldOpen) this.reopenAfterAWait(portViewerTargetKey(target));
        return { port_viewer: portViewer };
      }),
    );
  }

  private portViewerClosed(portViewer: string): Effect.Effect<void> {
    return Effect.suspend(() => {
      const subscription = this.subscriptionsByPortViewer.get(portViewer);
      if (subscription === undefined) return Effect.void;
      this.subscriptionsByPortViewer.delete(portViewer);
      const targetKey = portViewerTargetKey(subscription.target);
      if (this.subscriptionsOf(targetKey).length > 0) return Effect.void;
      return Effect.all([this.stopReopening(targetKey), this.runtimeViewerClosed(targetKey)], { discard: true });
    });
  }

  private isTheStreamNotYetRunning(target: PortViewerTarget, refusal: PortViewerOpenRefused): boolean {
    const listedState = this.sources.streamStateTheRuntimeListsNow(target.stream);
    return refusal.theRuntimeRefusedIt && listedState !== null && STREAM_STATES_A_PORT_VIEWER_WAITS_OUT.has(listedState);
  }

  private subscriptionsOf(targetKey: string): [string, PortViewerSubscription][] {
    return [...this.subscriptionsByPortViewer].filter(([, subscription]) => portViewerTargetKey(subscription.target) === targetKey);
  }

  private tellEveryPortViewerOf(targetKey: string, event: { kind: "reopening"; because: string } | { kind: "ended"; because: string; recovery: PortViewerRecovery }): void {
    for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, ...event });
  }

  /** The connection the port viewers share, opened once however many ask for it at a time; a connection the runtime drops reopens every viewer it held. */
  private theViewerConnection(): Effect.Effect<RuntimeViewerConnection, PortViewerConnectionNotOpened> {
    return Effect.suspend(() => {
      const held = this.viewerConnection;
      const beingOpened = this.connectionBeingOpened;
      if (beingOpened !== null) return Deferred.await(beingOpened);
      const opening = Deferred.makeUnsafe<RuntimeViewerConnection, PortViewerConnectionNotOpened>();
      this.connectionBeingOpened = opening;
      const opened = held === null ? this.sources.openTheViewerConnection : Effect.flatMap(held.isOpen, (isOpen) => (isOpen ? Effect.succeed(held) : this.sources.openTheViewerConnection));
      return opened.pipe(
        Effect.tap((connection) =>
          Effect.suspend(() => {
            if (connection === held) return Effect.void;
            this.viewerConnection = connection;
            return Effect.forkDetach(Effect.flatMap(connection.whyItClosed, (whyItClosed) => this.everyRuntimeViewerReopenedAfter(connection, whyItClosed)));
          }),
        ),
        Effect.onExit((exit) =>
          Effect.suspend(() => {
            this.connectionBeingOpened = null;
            return Deferred.done(opening, exit);
          }),
        ),
      );
    });
  }

  /** The runtime viewer of `target`'s port, held open already, being opened by another port viewer, or opened now. */
  private runtimeViewerOf(target: PortViewerTarget): Effect.Effect<RuntimeViewerHeldOpen, PortViewerOpenFailure> {
    return Effect.suspend(() => {
      const targetKey = portViewerTargetKey(target);
      const heldOpen = this.runtimeViewersByTargetKey.get(targetKey);
      if (heldOpen !== undefined) return Effect.succeed(heldOpen);
      const beingOpened = this.openingsByTargetKey.get(targetKey);
      if (beingOpened !== undefined) return Deferred.await(beingOpened);
      const opening = Deferred.makeUnsafe<RuntimeViewerHeldOpen, PortViewerOpenFailure>();
      this.openingsByTargetKey.set(targetKey, opening);
      return this.runtimeViewerOpened(target, targetKey).pipe(
        Effect.onExit((exit) =>
          Effect.suspend(() => {
            this.openingsByTargetKey.delete(targetKey);
            return Deferred.done(opening, exit);
          }),
        ),
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
      this.tellEveryPortViewerOf(targetKey, { kind: "ended", because: ended.words, recovery: RECOVERY_ONCE_THE_READS_ENDED[ended.kind] });
      for (const [portViewer] of this.subscriptionsOf(targetKey)) this.subscriptionsByPortViewer.delete(portViewer);
      return Effect.all([this.stopReopening(targetKey), this.runtimeViewerClosed(targetKey)], { discard: true });
    });
  }

  private everyRuntimeViewerOfTheStreamReopened(stream: string): Effect.Effect<void> {
    return Effect.forEach(
      [...this.runtimeViewersByTargetKey].filter(([, heldOpen]) => heldOpen.openedViewer.stream === stream),
      ([targetKey, heldOpen]) =>
        this.runtimeViewerClosed(targetKey).pipe(
          Effect.andThen(
            Effect.sync(() => {
              this.tellEveryPortViewerOf(targetKey, { kind: "reopening", because: `${heldOpen.openedViewer.node_name} › ${heldOpen.openedViewer.port} was replaced as its project loaded again.` });
              this.reopenAfterAWait(targetKey);
            }),
          ),
        ),
      { discard: true },
    );
  }

  private everyRuntimeViewerReopenedAfter(closedConnection: RuntimeViewerConnection, whyItClosed: string): Effect.Effect<void> {
    return Effect.sync(() => {
      if (this.viewerConnection !== closedConnection) return;
      this.viewerConnection = null;
      for (const [targetKey, heldOpen] of [...this.runtimeViewersByTargetKey]) {
        this.runtimeViewersByTargetKey.delete(targetKey);
        heldOpen.reads.stop();
        heldOpen.channelReader.close();
        this.tellEveryPortViewerOf(targetKey, { kind: "reopening", because: whyItClosed });
        this.reopenAfterAWait(targetKey);
      }
    });
  }

  /** Open the port `targetKey` names again after a wait, and again after each wait that follows a failure the port viewers wait out, while a window shows it; one reopening per port. */
  private reopenAfterAWait(targetKey: string): void {
    if (this.reopeningsByTargetKey.has(targetKey)) return;
    const reopening = Effect.runFork(this.reopenedAfterEachWait(targetKey).pipe(Effect.ensuring(Effect.sync(() => this.reopeningsByTargetKey.delete(targetKey)))));
    this.reopeningsByTargetKey.set(targetKey, reopening);
  }

  private reopenedAfterEachWait(targetKey: string): Effect.Effect<void> {
    const reopenedOnce: Effect.Effect<boolean> = Effect.gen({ self: this }, function* () {
      yield* this.sources.waitBeforeReopening;
      const [firstSubscription] = this.subscriptionsOf(targetKey);
      if (firstSubscription === undefined || this.runtimeViewersByTargetKey.has(targetKey)) return true;
      const reopened = yield* Effect.exit(this.runtimeViewerOf(firstSubscription[1].target));
      if (Exit.isSuccess(reopened)) {
        if (this.subscriptionsOf(targetKey).length === 0) yield* this.runtimeViewerClosed(targetKey);
        return true;
      }
      const failure = Exit.findErrorOption(reopened);
      if (failure._tag === "None") return true;
      if (failure.value._tag === "PortViewerPortNotRead") {
        this.tellEveryPortViewerOf(targetKey, { kind: "ended", because: failure.value.words, recovery: "open_the_port_again" });
        for (const [portViewer] of this.subscriptionsOf(targetKey)) this.subscriptionsByPortViewer.delete(portViewer);
        return true;
      }
      this.tellEveryPortViewerOf(targetKey, { kind: "reopening", because: failure.value.words });
      return false;
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
