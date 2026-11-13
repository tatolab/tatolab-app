// The runtime's stream actions followed over one `/control/ws` WebSocket, so the status is read
// again the moment a load, a run, a stop or any other action moves on, rather than at the status
// poll's next round, and each project's `.venv` sync is read as uv moves. Each
// `stream_action_changed` names the action, which `describe_stream_action` describes on the same
// connection; `missed` describes every action followed again. An action's sync is under way while
// it is on its `making_the_venv` step, and is handed over once as just ended when a later
// description carries it on another step or ended, so a sync shorter than a status round still
// reaches the window. A connection that cannot open, cannot subscribe or closes is followed again
// after a wait.

import { STREAM_ACTION_STEP_MAKING_THE_VENV, type FailedProjectStreamAction, type ProjectVenvSyncOfAStreamAction, type StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import { everyOneRead, jsonObject, requiredArray } from "./json_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { streamActionDescriptionFromTheDescribeStreamActionToolResult } from "./stream_action_description.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { ControlNotifications, TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** The parts of a `/control/ws` connection the stream actions are followed over, so a test can stand in for one. */
export interface StreamActionChangesConnection {
  /** The runtime's `subscribe_stream_action_changes`: the id of each action queued or running as it began, or the refusal in its words. */
  subscribeToTheStreamActionChanges(): Promise<Result<string[], string>>;
  /** Call `listener` with each `stream_action_changed` the runtime sends on this connection. */
  onStreamActionChanged(listener: (change: ControlNotifications["stream_action_changed"]) => void): void;
  /** The runtime's `describe_stream_action` of `action`, or why it was not described. */
  describeTheStreamAction(action: string): Promise<Result<StreamActionDescription, string>>;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  close(): void;
}

/** What following the stream actions reaches: the runtime, a timer, the status, and the app's log. */
export interface StreamActionChangesFollowedForTheStatusSources {
  openTheStreamActionChangesConnection(): Promise<Result<StreamActionChangesConnection, LocalApiRequestFailure>>;
  /** Call `then` once, `afterMs` from now. */
  waitThen(afterMs: number, then: () => void): void;
  /** Read the status again now, as a stream action or a sync moved on. */
  readTheStatusAgain(): void;
  tatolabAppLog: TatolabAppLog;
}

/** Each project's sync under way, and each that ended since the status last took them. */
export interface ProjectVenvSyncsUnderWayAndJustEnded {
  readonly underWay: ProjectVenvSyncOfAStreamAction[];
  readonly justEnded: ProjectVenvSyncOfAStreamAction[];
}

/** How long the stream actions wait, after their connection could not open, could not subscribe or closed, before they are followed again. */
export const STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS = 2_500;

function actionsUnderWayFromTheSubscribeResult(operationResult: unknown): Result<string[], string> {
  const subscribeResult = jsonObject(operationResult, "the subscribe_stream_action_changes answer");
  if (!subscribeResult.ok) return subscribeResult;
  const actionsUnderWay = requiredArray(subscribeResult.value, "actions_under_way");
  if (!actionsUnderWay.ok) return actionsUnderWay;
  return everyOneRead(actionsUnderWay.value, (action) => (typeof action === "string" ? succeeded(action) : failedWith("an entry of actions_under_way is not an action's id")));
}

/** `controlWebSocketConnection` as the connection the stream actions are followed over. */
export function streamActionChangesConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): StreamActionChangesConnection {
  return {
    subscribeToTheStreamActionChanges: async () => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_stream_action_changes", {});
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : actionsUnderWayFromTheSubscribeResult(subscribed.value.result);
    },
    onStreamActionChanged: (listener) => {
      controlWebSocketConnection.onNotification("stream_action_changed", listener);
    },
    describeTheStreamAction: async (action) => {
      const described = await controlWebSocketConnection.callControlOperation("describe_stream_action", { action });
      if (!described.ok) return failedWith(described.failure.failureDescription);
      return described.value.kind === "refused_by_the_operation" ? failedWith(described.value.words) : streamActionDescriptionFromTheDescribeStreamActionToolResult(described.value.result);
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    close: () => controlWebSocketConnection.close(),
  };
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

/** The runtime's stream actions, followed from `follow` until `stop` so the status is read again as each one moves on and carries each project's sync. */
export class StreamActionChangesFollowedForTheStatus {
  private streamActionChangesConnection: StreamActionChangesConnection | null = null;
  private isFollowing = false;
  private isAwaitingAFollowAgain = false;
  private actionsFollowedUntilTheyEnd = new Set<string>();
  private actionsMakingTheVenv = new Map<string, StreamActionDescription>();
  private actionsWhoseSyncWasHandedOver = new Set<string>();
  private actionsBeingDescribed = new Map<string, { isAnotherDescribeWanted: boolean; endedSyncOfTheNextDescription: EndedSyncOfTheDescription }>();
  private syncsJustEnded: ProjectVenvSyncOfAStreamAction[] = [];
  private latestFailedActionOfEachProject = new Map<string, FailedProjectStreamAction>();

  constructor(private readonly sources: StreamActionChangesFollowedForTheStatusSources) {}

  /** Start following the stream actions; a second call starts nothing. */
  follow(): void {
    if (this.isFollowing) return;
    this.isFollowing = true;
    void this.openAndSubscribe();
  }

  /** Stop following and close the connection, as the app quits. */
  stop(): void {
    this.isFollowing = false;
    const streamActionChangesConnection = this.streamActionChangesConnection;
    this.forgetTheConnection();
    streamActionChangesConnection?.close();
  }

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

  private async openAndSubscribe(): Promise<void> {
    const opened = await this.sources.openTheStreamActionChangesConnection();
    if (!this.isFollowing) {
      if (opened.ok) opened.value.close();
      return;
    }
    if (!opened.ok) {
      this.followAgainAfterAWait(opened.failure.failureDescription);
      return;
    }
    const streamActionChangesConnection = opened.value;
    this.streamActionChangesConnection = streamActionChangesConnection;
    streamActionChangesConnection.onStreamActionChanged((change) => {
      if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
      this.sources.readTheStatusAgain();
      const actionsToDescribe = change.change === "changed" && typeof change.action === "string" ? [change.action] : [...this.actionsFollowedUntilTheyEnd];
      for (const action of actionsToDescribe) void this.describeAndNotice(streamActionChangesConnection, action, "hand_it_over");
    });
    streamActionChangesConnection.onClosed((whyItClosed) => {
      if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
      const hadAnySyncUnderWay = this.actionsMakingTheVenv.size > 0;
      this.forgetTheConnection();
      if (hadAnySyncUnderWay) this.sources.readTheStatusAgain();
      this.followAgainAfterAWait(whyItClosed);
    });
    const subscribed = await streamActionChangesConnection.subscribeToTheStreamActionChanges();
    if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
    if (!subscribed.ok) {
      this.forgetTheConnection();
      streamActionChangesConnection.close();
      this.followAgainAfterAWait(subscribed.failure);
      return;
    }
    this.sources.readTheStatusAgain();
    for (const action of subscribed.value) void this.describeAndNotice(streamActionChangesConnection, action, "count_it_handed_over");
  }

  private async describeAndNotice(streamActionChangesConnection: StreamActionChangesConnection, action: string, endedSyncOfTheDescription: EndedSyncOfTheDescription): Promise<void> {
    const describeUnderWay = this.actionsBeingDescribed.get(action);
    if (describeUnderWay !== undefined) {
      describeUnderWay.isAnotherDescribeWanted = true;
      if (endedSyncOfTheDescription === "hand_it_over") describeUnderWay.endedSyncOfTheNextDescription = "hand_it_over";
      return;
    }
    const thisDescribe = { isAnotherDescribeWanted: true, endedSyncOfTheNextDescription: endedSyncOfTheDescription };
    this.actionsBeingDescribed.set(action, thisDescribe);
    while (thisDescribe.isAnotherDescribeWanted) {
      thisDescribe.isAnotherDescribeWanted = false;
      const endedSyncOfThisDescription = thisDescribe.endedSyncOfTheNextDescription;
      const described = await streamActionChangesConnection.describeTheStreamAction(action);
      if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
      if (!described.ok) {
        this.sources.tatolabAppLog.warn("a stream action could not be described, so the Activity panel shows no sync for it", { action, because: described.failure });
        this.actionsFollowedUntilTheyEnd.delete(action);
        if (this.actionsMakingTheVenv.delete(action)) this.sources.readTheStatusAgain();
        break;
      }
      this.noticeTheDescription(described.value, endedSyncOfThisDescription);
    }
    this.actionsBeingDescribed.delete(action);
  }

  private noticeTheDescription(description: StreamActionDescription, endedSyncOfTheDescription: EndedSyncOfTheDescription): void {
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
    if (didTheSyncsChange || didTheProjectsFailureChange) this.sources.readTheStatusAgain();
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

  private forgetTheConnection(): void {
    this.streamActionChangesConnection = null;
    this.actionsFollowedUntilTheyEnd = new Set();
    this.actionsMakingTheVenv = new Map();
    this.actionsWhoseSyncWasHandedOver = new Set();
    this.actionsBeingDescribed = new Map();
    this.latestFailedActionOfEachProject = new Map();
  }

  private followAgainAfterAWait(whyItIsNotFollowed: string): void {
    if (!this.isFollowing || this.isAwaitingAFollowAgain) return;
    this.isAwaitingAFollowAgain = true;
    this.sources.tatolabAppLog.info("will follow the stream actions again", { because: whyItIsNotFollowed });
    this.sources.waitThen(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS, () => {
      this.isAwaitingAFollowAgain = false;
      if (this.isFollowing && this.streamActionChangesConnection === null) void this.openAndSubscribe();
    });
  }
}
