// What the app's windows follow of the runtime's pushes over one `/control/ws` connection: each
// subject, a stream graph or a project's log, is subscribed once however many windows follow it,
// and each push of a followed subject, with what it carries, is handed to every window following
// it. The connection is held open while any window follows a subject, and closed once none does. A
// subject the runtime would not subscribe is subscribed again on a schedule; a connection that
// would not open, or that the runtime closed, is opened again on one, and each window told to read
// its subject again once it is subscribed again.

import { Duration, Effect, FiberMap, Schedule, type Scope, Stream, SubscriptionRef } from "effect";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { RuntimeControl, type ControlConnection } from "./tatolab_runtime_control_operation_call.js";

/** How long a subject the runtime would not subscribe, or whose connection closed, waits before it is subscribed again. */
export const CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER = Duration.millis(2_500);

/** One push of a followed subject, named as it was subscribed, and what it carries. */
export interface SubjectPushed<Pushed> {
  readonly subject: string;
  readonly pushed: Pushed;
}

/** One kind of push the windows follow: how a subject is subscribed on a connection, and each push on it. */
export interface ControlPushesFeed<Pushed> {
  /** What a subject is, as the app's log names it: `stream graph`, `project log`. */
  readonly subjectAsTheLogNamesIt: string;
  /** `connection` subscribed to the pushes of `subject`; refused in the runtime's words. */
  readonly subscribe: (connection: ControlConnection, subject: string) => Effect.Effect<void, RuntimeControlFailure>;
  /** Each push of a subject on `connection`. */
  readonly pushes: (connection: ControlConnection) => Stream.Stream<SubjectPushed<Pushed>>;
}

/** Why one connection's following ended: no window follows a subject any longer, or it ended for `why` and is opened again on the schedule. */
type ConnectionEnded = { readonly _tag: "NoWindowFollows" } | { readonly _tag: "Ended"; readonly why: string };

/** The subjects of one kind the app's windows follow, each by its id. */
export interface ControlPushesFollowed<WindowFollowing> {
  /** Tell `windowFollowing` of each push of `subject` from now on, and once as soon as it is subscribed. */
  readonly follow: (subject: string, windowFollowing: WindowFollowing) => Effect.Effect<void>;
  /** Stop telling `windowFollowing` of `subject`; the connection closes once no window follows any subject. */
  readonly stopFollowing: (subject: string, windowFollowing: WindowFollowing) => Effect.Effect<void>;
  /** Stop telling `windowFollowing` of any subject, as it closes. */
  readonly stopFollowingEverySubjectOf: (windowFollowing: WindowFollowing) => Effect.Effect<void>;
}

/**
 * The subjects of `feed` the windows follow, each push handed to every window following its subject with `tellTheWindowItChanged`,
 * `null` telling it to read its subject again; followed over the runtime's connections for as long as the scope is open.
 */
export function controlPushesFollowedForTheWindows<WindowFollowing, Pushed>(
  feed: ControlPushesFeed<Pushed>,
  tellTheWindowItChanged: (windowFollowing: WindowFollowing, subject: string, pushed: NoInfer<Pushed> | null) => void,
): Effect.Effect<ControlPushesFollowed<WindowFollowing>, never, RuntimeControl | Scope.Scope> {
  return Effect.gen(function* () {
    const runtimeControl = yield* RuntimeControl;
    const windowsFollowingBySubject = new Map<string, Set<WindowFollowing>>();
    const subjectsFollowed = yield* SubscriptionRef.make<ReadonlySet<string>>(new Set());
    const theSubjectsFollowedChanged = Effect.suspend(() => SubscriptionRef.set(subjectsFollowed, new Set(windowsFollowingBySubject.keys())));
    const willFollowAgain = (because: string, subject: string | null) =>
      Effect.logInfo(`will follow a ${feed.subjectAsTheLogNamesIt} again`).pipe(Effect.annotateLogs(subject === null ? { because } : { subject, because }));

    const tellTheWindows = (subject: string, pushed: Pushed | null) =>
      Effect.sync(() => {
        for (const windowFollowing of [...(windowsFollowingBySubject.get(subject) ?? [])]) tellTheWindowItChanged(windowFollowing, subject, pushed);
      });

    /** `subject` subscribed on `connection`, again on a schedule while the runtime refuses, its windows then told to read it again; held until interrupted. */
    const subscribedUntilUnfollowed = (connection: ControlConnection, subject: string) =>
      feed.subscribe(connection, subject).pipe(
        Effect.tapError((refused) => willFollowAgain(refused.words, subject)),
        Effect.retry(Schedule.spaced(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER)),
        Effect.andThen(tellTheWindows(subject, null)),
        Effect.andThen(Effect.never),
      );

    /** Every followed subject subscribed on one connection and each push on it handed on, held open until no window follows a subject, or until it ends: why. */
    const followedOverOneConnection = Effect.gen(function* () {
      const connection = yield* runtimeControl.connect;
      const subscriptions = yield* FiberMap.make<string, never, RuntimeControlFailure>();
      const subscribeTheSubjectsFollowed = SubscriptionRef.changes(subjectsFollowed).pipe(
        Stream.takeUntil((subjects) => subjects.size === 0),
        Stream.runForEach((subjects) =>
          Effect.gen(function* () {
            for (const subject of subjects) yield* FiberMap.run(subscriptions, subject, subscribedUntilUnfollowed(connection, subject), { onlyIfMissing: true });
            for (const [subject] of [...subscriptions]) if (!subjects.has(subject)) yield* FiberMap.remove(subscriptions, subject);
          }),
        ),
        Effect.as<ConnectionEnded>({ _tag: "NoWindowFollows" }),
      );
      const pushesHandedOn = feed.pushes(connection).pipe(
        Stream.runForEach(({ subject, pushed }) => tellTheWindows(subject, pushed)),
        Effect.as<ConnectionEnded>({ _tag: "Ended", why: "the runtime's pushes on the /control/ws connection ended" }),
      );
      const closedByTheRuntime = connection.closedByTheRuntime.pipe(Effect.map((why): ConnectionEnded => ({ _tag: "Ended", why })));
      const aSubscriptionBroke = FiberMap.join(subscriptions).pipe(Effect.andThen(Effect.never));
      return yield* Effect.raceAllFirst([closedByTheRuntime, subscribeTheSubjectsFollowed, pushesHandedOn, aSubscriptionBroke]);
    });

    const aWindowFollowsASubject = SubscriptionRef.changes(subjectsFollowed).pipe(
      Stream.filter((subjects) => subjects.size > 0),
      Stream.take(1),
      Stream.runDrain,
    );

    yield* Effect.gen(function* () {
      yield* aWindowFollowsASubject;
      const ended = yield* Effect.scoped(followedOverOneConnection).pipe(
        Effect.catch((failure) => Effect.succeed<ConnectionEnded>({ _tag: "Ended", why: failure.words })),
        Effect.catchDefect((defect) =>
          Effect.logError(`following a ${feed.subjectAsTheLogNamesIt} broke`, defect).pipe(Effect.as<ConnectionEnded>({ _tag: "Ended", why: String(defect) })),
        ),
      );
      if (ended._tag === "NoWindowFollows") return;
      yield* willFollowAgain(ended.why, null);
      yield* Effect.sleep(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }).pipe(Effect.forever, Effect.forkScoped);

    const stopFollowing = (subject: string, windowFollowing: WindowFollowing) =>
      Effect.suspend(() => {
        const windowsFollowing = windowsFollowingBySubject.get(subject);
        if (windowsFollowing === undefined || !windowsFollowing.delete(windowFollowing)) return Effect.void;
        if (windowsFollowing.size > 0) return Effect.void;
        windowsFollowingBySubject.delete(subject);
        return theSubjectsFollowedChanged;
      });

    return {
      follow: (subject, windowFollowing) =>
        Effect.suspend(() => {
          const windowsFollowing = windowsFollowingBySubject.get(subject);
          if (windowsFollowing !== undefined) {
            windowsFollowing.add(windowFollowing);
            return Effect.void;
          }
          windowsFollowingBySubject.set(subject, new Set([windowFollowing]));
          return theSubjectsFollowedChanged;
        }),
      stopFollowing,
      stopFollowingEverySubjectOf: (windowFollowing) =>
        Effect.forEach([...windowsFollowingBySubject.keys()], (subject) => stopFollowing(subject, windowFollowing), { discard: true }),
    } satisfies ControlPushesFollowed<WindowFollowing>;
  });
}
