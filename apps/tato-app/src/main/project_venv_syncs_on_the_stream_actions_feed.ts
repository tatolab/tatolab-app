// Each project's `.venv` sync, followed live over one `/mcp/stdio` connection: a
// `subscriptions/listen` on `streamlib://stream-actions` is told each time an action is queued or
// changes, uv's lines included, and the resource is read again after each. An action that leaves
// the list, or leaves its `making_the_venv` step, is read once more by
// `streamlib://stream-action/<action>`, which the runtime keeps after the action ends, so a sync
// shorter than a status round still reaches the window as just ended.

import { STREAM_ACTION_STEP_MAKING_THE_VENV, type ProjectVenvSyncOfAStreamAction, type StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { LocalApiResourceFollowedOverOneConnection, type LocalApiResourceFollowingConnection } from "./local_api_resource_followed_over_one_connection.js";
import type { Result } from "./result.js";
import { streamActionDescriptionFromTheStreamActionResourceText, streamActionsUnderWayFromTheStreamActionsResourceText } from "./stream_action_description.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The resource holding every stream action queued or under way, as the runtime names it. */
export const STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI = "streamlib://stream-actions";

/** The resource holding one stream action, kept among its project's last finished ones once it ends. */
export function streamActionResourceUri(action: string): string {
  return `streamlib://stream-action/${action}`;
}

/** What following the stream actions reaches: a connection to the runtime, the status to refresh as a sync changes, and the app's log. */
export interface ProjectVenvSyncsOnTheStreamActionsFeedSources {
  openTheFeedConnection: () => Promise<Result<LocalApiResourceFollowingConnection, LocalApiRequestFailure>>;
  whenTheSyncsChange: () => void;
  tatolabAppLog: TatolabAppLog;
}

/** Each project's sync under way, and each that ended since the status last took them. */
export interface ProjectVenvSyncsUnderWayAndJustEnded {
  readonly underWay: ProjectVenvSyncOfAStreamAction[];
  readonly justEnded: ProjectVenvSyncOfAStreamAction[];
}

function syncOfTheAction(description: StreamActionDescription): ProjectVenvSyncOfAStreamAction | null {
  return description.venv_sync === null ? null : { action: description.action, project_directory: description.project_directory, venv_sync: description.venv_sync };
}

function isMakingTheVenv(description: StreamActionDescription): boolean {
  return description.state === "in_progress" && description.step === STREAM_ACTION_STEP_MAKING_THE_VENV;
}

/** The runtime's stream actions, followed while it answers, read for each project's `.venv` sync. */
export class ProjectVenvSyncsOnTheStreamActionsFeed {
  private followedStreamActions: LocalApiResourceFollowedOverOneConnection | null = null;
  private isFollowing = false;
  private followsStarted = 0;
  private hasStopped = false;
  private actionsMakingTheVenvAtTheLastRead = new Map<string, StreamActionDescription>();
  private actionsListedAtTheLastRead: ReadonlySet<string> = new Set();
  private syncsJustEnded: ProjectVenvSyncOfAStreamAction[] = [];
  private hasSaidWhyTheFeedEnded = false;

  constructor(private readonly sources: ProjectVenvSyncsOnTheStreamActionsFeedSources) {}

  /** Follow the feed while the runtime answers its health check, and stop following it while it does not. */
  keepFollowing(isTheRuntimeAnswering: boolean): void {
    if (!isTheRuntimeAnswering) {
      this.forgetTheFollowedConnection();
      this.actionsMakingTheVenvAtTheLastRead = new Map();
      this.actionsListedAtTheLastRead = new Set();
      return;
    }
    if (!this.isFollowing) void this.follow();
  }

  /** The syncs under way as last read, and each that ended since the last take, which this take empties. */
  takeTheProjectVenvSyncs(): ProjectVenvSyncsUnderWayAndJustEnded {
    const justEnded = this.syncsJustEnded;
    this.syncsJustEnded = [];
    const underWay = [...this.actionsMakingTheVenvAtTheLastRead.values()].flatMap((description) => syncOfTheAction(description) ?? []);
    return { underWay, justEnded };
  }

  /** Stop following, as the app quits. */
  stopFollowing(): void {
    this.hasStopped = true;
    this.forgetTheFollowedConnection();
  }

  private async follow(): Promise<void> {
    if (this.hasStopped || this.isFollowing) return;
    this.isFollowing = true;
    this.followsStarted += 1;
    const thisFollow = this.followsStarted;
    const opened = await this.sources.openTheFeedConnection();
    if (this.hasStopped || this.followsStarted !== thisFollow) {
      if (opened.ok) opened.value.close();
      return;
    }
    if (!opened.ok) {
      this.endBecause(opened.failure.failureDescription);
      return;
    }
    const followedStreamActions: LocalApiResourceFollowedOverOneConnection = new LocalApiResourceFollowedOverOneConnection(opened.value, STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI, {
      whenRead: async (reading) => {
        const actionsUnderWay = reading.ok ? streamActionsUnderWayFromTheStreamActionsResourceText(reading.value) : reading;
        if (!actionsUnderWay.ok) {
          this.endBecause(actionsUnderWay.failure);
          return;
        }
        this.hasSaidWhyTheFeedEnded = false;
        await this.noticeTheActionsUnderWay(followedStreamActions, actionsUnderWay.value);
      },
      whenTheListenEnded: (whyItEnded) => this.endBecause(whyItEnded),
    });
    this.followedStreamActions = followedStreamActions;
    await followedStreamActions.start();
  }

  private async noticeTheActionsUnderWay(followedStreamActions: LocalApiResourceFollowedOverOneConnection, actionsUnderWay: readonly StreamActionDescription[]): Promise<void> {
    const listedActions = new Map(actionsUnderWay.map((description) => [description.action, description]));
    const actionsMakingTheVenv = new Map(actionsUnderWay.filter(isMakingTheVenv).map((description) => [description.action, description]));
    const actionsThatLeftTheList = [...this.actionsListedAtTheLastRead].filter((action) => !listedActions.has(action));
    const syncsThatLeftTheVenvStepStillListed = [...this.actionsMakingTheVenvAtTheLastRead.keys()].flatMap((action) => {
      const listedNow = listedActions.get(action);
      return listedNow === undefined || isMakingTheVenv(listedNow) ? [] : (syncOfTheAction(listedNow) ?? []);
    });
    const hadAnySyncUnderWay = this.actionsMakingTheVenvAtTheLastRead.size > 0;
    this.actionsListedAtTheLastRead = new Set(listedActions.keys());
    this.actionsMakingTheVenvAtTheLastRead = actionsMakingTheVenv;
    const endedSyncsReadAgain = await Promise.all(actionsThatLeftTheList.map((action) => this.lastSyncOfTheEndedAction(followedStreamActions, action)));
    if (followedStreamActions.isStopped()) return;
    const syncsJustEnded = [...syncsThatLeftTheVenvStepStillListed, ...endedSyncsReadAgain.flatMap((endedSync) => endedSync ?? [])];
    this.syncsJustEnded.push(...syncsJustEnded);
    if (syncsJustEnded.length > 0 || actionsMakingTheVenv.size > 0 || hadAnySyncUnderWay) this.sources.whenTheSyncsChange();
  }

  private async lastSyncOfTheEndedAction(followedStreamActions: LocalApiResourceFollowedOverOneConnection, action: string): Promise<ProjectVenvSyncOfAStreamAction | null> {
    const resourceRead = await followedStreamActions.connection.readResourceText(streamActionResourceUri(action));
    if (followedStreamActions.isStopped()) return null;
    const description = resourceRead.ok ? streamActionDescriptionFromTheStreamActionResourceText(resourceRead.value) : { ok: false as const, failure: resourceRead.failure.failureDescription };
    if (!description.ok) {
      this.sources.tatolabAppLog.warn("an ended stream action could not be read, so the Activity panel shows no sync for it", { action, because: description.failure });
      return null;
    }
    return syncOfTheAction(description.value);
  }

  private endBecause(why: string): void {
    this.forgetTheFollowedConnection();
    if (this.hasStopped || this.hasSaidWhyTheFeedEnded) return;
    this.hasSaidWhyTheFeedEnded = true;
    this.sources.tatolabAppLog.warn("the runtime's stream actions are not followed until the next status round", { because: why });
  }

  /** Stop the followed connection, and any follow still opening one, so the next round opens a new one. */
  private forgetTheFollowedConnection(): void {
    this.followedStreamActions?.stop();
    this.followedStreamActions = null;
    this.isFollowing = false;
    this.followsStarted += 1;
  }
}
