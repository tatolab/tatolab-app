// The change feed of the project a studio window shows, followed over one `/control/ws`
// connection: `read_project_changes` opens the project in the runtime and answers its feed, whose
// project UUID `subscribe_project_changes` names, and each `project_changed` of that project,
// `missed` among them, reads the feed again, one read at a time. A `files_changed`, a file an
// editor or another tool changed in the project's folder, leaves the feed as it is: the window is
// told the project's files changed. A `node_types_added`, `node_types_removed` or
// `node_types_updated` leaves it as it is too: the window is told the project's node types
// changed. The window is told both after `missed` and after each subscribe, when a change may have
// gone untold. A connection the runtime closes is followed again at once, keeping the last
// reading; when that fails too, or a connection would not open or broke, the window is told why,
// and the feed is followed again every few seconds, or at once as the runtime starts answering.

import { Duration, Effect, Fiber, FiberSet, Latch, Result as EffectResult, Stream } from "effect";
import type { ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import { projectTransactionsFromTheChangeFeed } from "./project_transactions_on_the_wire.js";
import { followedUntilTheConnectionEnds, runsOneAtATime, type AfterTheRun } from "./runtime_connection_following.js";
import { controlOperationOnTheConnectionReadWith, RuntimeControl, type ControlConnection } from "./tatolab_runtime_control_operation_call.js";

/** How long after the feed's connection ends it is followed again. */
export const PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER = Duration.seconds(3);

/** What following a window's project feed reaches: the runtime, through what runs the following, and the window. */
export interface ProjectTransactionsFeedOfAStudioWindowSources {
  /** Run `following` over the runtime until the answer is called, which interrupts it; `null` while nothing reaches the runtime yet. */
  followOverTheRuntime: (following: Effect.Effect<never, never, RuntimeControl>) => (() => void) | null;
  sendTheWindowTheProjectTransactions: (reading: ProjectTransactionsReading) => void;
  /** Tell the window a file of the project changed, so it lists the project again. */
  tellTheWindowTheProjectFilesChanged: () => void;
  /** Tell the window the node types the project offers changed, so it lists them again. */
  tellTheWindowTheProjectNodeTypesChanged: () => void;
}

/** The `project_changed` kinds that name node types the project offers, which leave its feed as it is. */
const PROJECT_CHANGES_NAMING_NODE_TYPES: ReadonlySet<string> = new Set(["node_types_added", "node_types_removed", "node_types_updated"]);

/** Why one connection's following ended: the runtime closed it, or it could not open, read, subscribe or carry on. */
type FeedConnectionEnded = { readonly _tag: "ClosedByTheRuntime"; readonly why: string } | { readonly _tag: "Failed"; readonly why: string };

/** The change feed of the project in `projectFolder`, followed while its studio window is open. */
export class ProjectTransactionsFeedOfAStudioWindow {
  private lastReading: ProjectTransactionsReading = { kind: "not_read", because: "The project's history has not been read yet." };
  private stopTheFollowing: (() => void) | null = null;
  private hasStopped = false;
  private readonly followAgainAtOnce = Latch.makeUnsafe(false);

  constructor(
    readonly projectFolder: string,
    private readonly sources: ProjectTransactionsFeedOfAStudioWindowSources,
  ) {}

  /** The feed as last read, or why it is not. */
  readProjectTransactions(): ProjectTransactionsReading {
    return this.lastReading;
  }

  /** Start following the feed, unless it is already followed; nothing while nothing reaches the runtime yet, until it is followed again. */
  follow(): void {
    if (this.hasStopped || this.stopTheFollowing !== null) return;
    this.stopTheFollowing = this.sources.followOverTheRuntime(this.followed());
  }

  /** Follow the feed again at once, as the runtime starts answering, rather than at the end of the wait. */
  followAgain(): void {
    if (this.stopTheFollowing === null) this.follow();
    else Latch.openUnsafe(this.followAgainAtOnce);
  }

  /** Stop following, as the window closes or the app quits. */
  stopFollowing(): void {
    this.hasStopped = true;
    this.stopTheFollowing?.();
    this.stopTheFollowing = null;
  }

  private publish(reading: ProjectTransactionsReading): void {
    if (this.hasStopped || JSON.stringify(reading) === JSON.stringify(this.lastReading)) return;
    this.lastReading = reading;
    this.sources.sendTheWindowTheProjectTransactions(reading);
  }

  /** The feed followed over one connection after another, for as long as it runs. */
  private followed(): Effect.Effect<never, never, RuntimeControl> {
    const feed = this;
    const projectFolder = this.projectFolder;
    const sources = this.sources;
    let hasFollowedAgainAtOnce = false;

    /** The feed followed over `connection` until it ends: why. */
    const followedOver = (connection: ControlConnection) =>
      Effect.gen(function* () {
        const readTheFeed = controlOperationOnTheConnectionReadWith(connection, "read_project_changes", { project_directory: projectFolder }, projectTransactionsFromTheChangeFeed);
        const firstRead = yield* readTheFeed;
        const project = firstRead.project;
        const reading = yield* FiberSet.make<void, never>();
        /** The feed read again and published, one read at a time; a change while one is under way is read once after it. */
        const reads = runsOneAtATime<null>(
          reading,
          Effect.fnUntraced(function* (): Effect.fn.Return<AfterTheRun> {
            const read = yield* Effect.result(readTheFeed);
            feed.publish(EffectResult.isSuccess(read) ? { kind: "read", project_transactions: read.success } : { kind: "not_read", because: read.failure.words });
            return "run_what_was_asked_since";
          }),
          () => null,
        );
        const readTheFeedAgain = reads.ask(projectFolder, null);
        const changesNoticed = yield* connection.notifications("project_changed").pipe(
          Stream.filter((change) => change.project === project),
          Stream.runForEach((change) =>
            Effect.suspend(() => {
              const namesNodeTypes = PROJECT_CHANGES_NAMING_NODE_TYPES.has(change.change);
              if (change.change === "files_changed" || change.change === "missed") sources.tellTheWindowTheProjectFilesChanged();
              if (namesNodeTypes || change.change === "missed") sources.tellTheWindowTheProjectNodeTypesChanged();
              return change.change !== "files_changed" && !namesNodeTypes ? readTheFeedAgain : Effect.void;
            }),
          ),
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* connection.call("subscribe_project_changes", { projects: [project] });
        hasFollowedAgainAtOnce = false;
        sources.tellTheWindowTheProjectFilesChanged();
        sources.tellTheWindowTheProjectNodeTypesChanged();
        feed.publish({ kind: "read", project_transactions: firstRead });
        yield* readTheFeedAgain;
        return yield* Effect.raceAllFirst([
          Fiber.join(changesNoticed).pipe(Effect.as<FeedConnectionEnded>({ _tag: "Failed", why: "the runtime's project changes on the /control/ws connection ended" })),
          FiberSet.join(reading).pipe(Effect.andThen(Effect.never)),
        ]);
      });

    /** The feed followed over one connection until it ends, the runtime's close of it ending it whatever the following was doing: why. */
    const followedOverOneConnection = Effect.gen(function* () {
      const connection = yield* (yield* RuntimeControl).connect;
      return yield* Effect.raceFirst(
        connection.closedByTheRuntime.pipe(Effect.map((why): FeedConnectionEnded => ({ _tag: "ClosedByTheRuntime", why }))),
        followedOver(connection),
      );
    });

    return Effect.forever(
      Effect.gen(function* () {
        const ended = yield* followedUntilTheConnectionEnds(followedOverOneConnection, (why): FeedConnectionEnded => ({ _tag: "Failed", why }), "following a project's change feed");
        if (ended._tag === "ClosedByTheRuntime") {
          const followsAgainAtOnce = feed.lastReading.kind === "read" && !hasFollowedAgainAtOnce;
          hasFollowedAgainAtOnce = followsAgainAtOnce;
          if (followsAgainAtOnce) return;
        }
        feed.publish({ kind: "not_read", because: ended.why });
        Latch.closeUnsafe(feed.followAgainAtOnce);
        yield* Effect.raceFirst(Effect.sleep(PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER), feed.followAgainAtOnce.await);
      }),
    );
  }
}
