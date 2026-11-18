// The runtime's stream actions followed over one `/control/ws` connection, so the status is read
// again the moment a load, a run, a stop or any other action moves on, rather than at the status
// poll's next round, and each project's `.venv` sync is read as uv moves. Each
// `stream_action_changed` names the action, which `describe_stream_action` describes on the same
// connection; `missed` describes every action followed again. An action's sync is under way while
// it is on its `making_the_venv` step, and is handed over once as just ended when a later
// description carries it on another step or ended, so a sync shorter than a status round still
// reaches the window. A connection that cannot open, cannot subscribe, closes or breaks is opened
// again on a schedule, and what it noticed is forgotten.

import { Duration, Effect, Fiber, FiberSet, Latch, Result as EffectResult, type Scope, Stream } from "effect";
import { STREAM_ACTION_STEP_MAKING_THE_VENV, type FailedProjectStreamAction, type ProjectVenvSyncOfAStreamAction, type StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import { everyOneRead, jsonObject, requiredArray } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { streamActionDescriptionFromTheDescribeStreamActionToolResult } from "./stream_action_description.js";
import { followedUntilTheConnectionEnds, runsOneAtATime, type AfterTheRun } from "./runtime_connection_following.js";
import { controlOperationOnTheConnectionReadWith, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

/** Each project's sync under way, and each that ended since the status last took them. */
export interface ProjectVenvSyncsUnderWayAndJustEnded {
  readonly underWay: ProjectVenvSyncOfAStreamAction[];
  readonly justEnded: ProjectVenvSyncOfAStreamAction[];
}

/** How long the stream actions wait, after their connection could not open, could not subscribe, closed or broke, before they are followed again. */
export const STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER = Duration.millis(2_500);

function actionsUnderWayFromTheSubscribeResult(operationResult: unknown): Result<string[], string> {
  const subscribeResult = jsonObject(operationResult, "the subscribe_stream_action_changes answer");
  if (!subscribeResult.ok) return subscribeResult;
  const actionsUnderWay = requiredArray(subscribeResult.value, "actions_under_way");
  if (!actionsUnderWay.ok) return actionsUnderWay;
  return everyOneRead(actionsUnderWay.value, (action) => (typeof action === "string" ? succeeded(action) : failedWith("an entry of actions_under_way is not an action's id")));
}

function syncOfTheAction(description: StreamActionDescription): ProjectVenvSyncOfAStreamAction | null {
  return description.venv_sync === null ? null : { action: description.action, project_directory: description.project_directory, venv_sync: description.venv_sync };
}

function isMakingTheVenv(description: StreamActionDescription): boolean {
  return description.state === "in_progress" && description.step === STREAM_ACTION_STEP_MAKING_THE_VENV;
}

function hasEnded(description: StreamActionDescription): boolean {
  return description.state !== "queued" && description.state !== "in_progress";
}

/** Whether a description's sync that is no longer under way is handed over as just ended: not for an action already past its sync as the subscription began. */
type EndedSyncOfTheDescription = "hand_it_over" | "count_it_handed_over";

/** What the followed stream actions have noticed over the connection open now: each sync under way or just ended, and each project whose latest action failed. */
export class StreamActionsNoticed {
  private actionsFollowedUntilTheyEnd = new Set<string>();
  private actionsMakingTheVenv = new Map<string, StreamActionDescription>();
  private actionsWhoseSyncWasHandedOver = new Set<string>();
  private syncsJustEnded: ProjectVenvSyncOfAStreamAction[] = [];
  private latestFailedActionOfEachProject = new Map<string, FailedProjectStreamAction>();

  /** The syncs under way as last described, and each that ended since the last take, which this take empties. */
  takeTheProjectVenvSyncs(): ProjectVenvSyncsUnderWayAndJustEnded {
    const justEnded = this.syncsJustEnded;
    this.syncsJustEnded = [];
    const underWay = [...this.actionsMakingTheVenv.values()].flatMap((description) => syncOfTheAction(description) ?? []);
    return { underWay, justEnded };
  }

  /** Each project whose latest followed stream action failed, until another action of the project is described or the connection is lost. */
  projectStreamActionFailuresNow(): FailedProjectStreamAction[] {
    return [...this.latestFailedActionOfEachProject.values()];
  }

  /** Each action followed until it ends. */
  actionsFollowedNow(): string[] {
    return [...this.actionsFollowedUntilTheyEnd];
  }

  /** Notice `description`: whether a sync or a project's failure changed, so the status is read again. */
  noticeTheDescription(description: StreamActionDescription, endedSyncOfTheDescription: EndedSyncOfTheDescription): boolean {
    const action = description.action;
    if (hasEnded(description)) this.actionsFollowedUntilTheyEnd.delete(action);
    else this.actionsFollowedUntilTheyEnd.add(action);
    const wasMakingTheVenv = this.actionsMakingTheVenv.has(action);
    let didTheSyncsChange = false;
    if (isMakingTheVenv(description)) {
      this.actionsMakingTheVenv.set(action, description);
      didTheSyncsChange = true;
    } else {
      this.actionsMakingTheVenv.delete(action);
      didTheSyncsChange = wasMakingTheVenv;
      const endedSync = syncOfTheAction(description);
      if (endedSync !== null && !this.actionsWhoseSyncWasHandedOver.has(action)) {
        this.actionsWhoseSyncWasHandedOver.add(action);
        if (endedSyncOfTheDescription === "hand_it_over" || wasMakingTheVenv) {
          this.syncsJustEnded.push(endedSync);
          didTheSyncsChange = true;
        }
      }
    }
    if (hasEnded(description)) this.actionsWhoseSyncWasHandedOver.delete(action);
    const didTheProjectsFailureChange = this.noticeWhetherTheActionFailed(description);
    return didTheSyncsChange || didTheProjectsFailureChange;
  }

  /** Stop following `action`, which the runtime no longer describes: whether a sync under way ended, so the status is read again. */
  noticeTheActionWasNotDescribed(action: string): boolean {
    this.actionsFollowedUntilTheyEnd.delete(action);
    return this.actionsMakingTheVenv.delete(action);
  }

  /** Forget everything noticed, as the connection is lost: whether a sync was under way, so the status is read again. */
  forget(): boolean {
    const hadAnySyncUnderWay = this.actionsMakingTheVenv.size > 0;
    this.actionsFollowedUntilTheyEnd = new Set();
    this.actionsMakingTheVenv = new Map();
    this.actionsWhoseSyncWasHandedOver = new Set();
    this.latestFailedActionOfEachProject = new Map();
    return hadAnySyncUnderWay;
  }

  private noticeWhetherTheActionFailed(description: StreamActionDescription): boolean {
    const failureHeld = this.latestFailedActionOfEachProject.get(description.project_directory);
    if (description.state === "failed" && description.failed_because !== null) {
      if (failureHeld?.action === description.action) return false;
      this.latestFailedActionOfEachProject.set(description.project_directory, {
        action: description.action,
        project_directory: description.project_directory,
        kind: description.kind,
        failed_because: description.failed_because,
      });
      return true;
    }
    if (failureHeld === undefined || failureHeld.action === description.action) return false;
    this.latestFailedActionOfEachProject.delete(description.project_directory);
    return true;
  }
}

/** The stream actions followed for the status. */
export interface StreamActionsFollowedForTheStatus {
  /** Start following the stream actions, as the app has opened; a second follow starts nothing. */
  readonly follow: Effect.Effect<void>;
}

/**
 * The stream actions followed into `noticed` from `follow` for as long as the scope is open, the status read again with
 * `readTheStatusAgain` as each one moves on.
 */
export function streamActionsFollowedForTheStatus(
  noticed: StreamActionsNoticed,
  readTheStatusAgain: () => void,
): Effect.Effect<StreamActionsFollowedForTheStatus, never, RuntimeControl | Scope.Scope> {
  return Effect.gen(function* () {
    const runtimeControl = yield* RuntimeControl;
    const followingStarted = yield* Latch.make(false);
    const readTheStatusAgainWhen = (didItChange: boolean) =>
      Effect.sync(() => {
        if (didItChange) readTheStatusAgain();
      });

    /** The actions under way, followed over one connection until the runtime closes it: why it ended. */
    const followedOverOneConnection = Effect.gen(function* () {
      const connection = yield* runtimeControl.connect;
      yield* Effect.addFinalizer(() => readTheStatusAgainWhen(noticed.forget()));
      const describing = yield* FiberSet.make<void, never>();
      /** Each action described and noticed, one describe of an action at a time; an ended sync is handed over when any describe asked for since would. */
      const describes = runsOneAtATime<EndedSyncOfTheDescription>(
        describing,
        Effect.fnUntraced(function* (action: string, endedSyncOfTheDescription: EndedSyncOfTheDescription): Effect.fn.Return<AfterTheRun> {
          const description = yield* Effect.result(
            controlOperationOnTheConnectionReadWith(connection, "describe_stream_action", { action }, streamActionDescriptionFromTheDescribeStreamActionToolResult),
          );
          if (EffectResult.isFailure(description)) {
            yield* Effect.logWarning("a stream action could not be described, so the Activity panel shows no sync for it").pipe(Effect.annotateLogs({ action, because: description.failure.words }));
            yield* readTheStatusAgainWhen(noticed.noticeTheActionWasNotDescribed(action));
            return "stop";
          }
          yield* readTheStatusAgainWhen(noticed.noticeTheDescription(description.success, endedSyncOfTheDescription));
          return "run_what_was_asked_since";
        }),
        (askedBefore, askedSince) => (askedSince === "hand_it_over" ? askedSince : askedBefore),
      );

      const changesNoticed = yield* connection.notifications("stream_action_changed").pipe(
        Stream.runForEach((change) =>
          Effect.suspend(() => {
            readTheStatusAgain();
            const actionsToDescribe = change.change === "changed" && typeof change.action === "string" ? [change.action] : noticed.actionsFollowedNow();
            return Effect.forEach(actionsToDescribe, (action) => describes.ask(action, "hand_it_over"), { discard: true });
          }),
        ),
        Effect.forkScoped({ startImmediately: true }),
      );
      const actionsUnderWay = yield* controlOperationOnTheConnectionReadWith(connection, "subscribe_stream_action_changes", {}, actionsUnderWayFromTheSubscribeResult);
      readTheStatusAgain();
      yield* Effect.forEach(actionsUnderWay, (action) => describes.ask(action, "count_it_handed_over"), { discard: true });
      return yield* Effect.raceAllFirst([
        connection.closedByTheRuntime,
        Fiber.join(changesNoticed).pipe(Effect.as("the runtime's stream action changes on the /control/ws connection ended")),
        FiberSet.join(describing).pipe(Effect.andThen(Effect.never)),
      ]);
    });

    yield* Effect.gen(function* () {
      yield* followingStarted.await;
      return yield* Effect.forever(
        Effect.gen(function* () {
          const whyItEnded = yield* followedUntilTheConnectionEnds(followedOverOneConnection, (why) => why, "following the stream actions");
          yield* Effect.logInfo("will follow the stream actions again").pipe(Effect.annotateLogs({ because: whyItEnded }));
          yield* Effect.sleep(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
        }),
      );
    }).pipe(Effect.forkScoped);

    return { follow: followingStarted.open.pipe(Effect.asVoid) } satisfies StreamActionsFollowedForTheStatus;
  });
}
