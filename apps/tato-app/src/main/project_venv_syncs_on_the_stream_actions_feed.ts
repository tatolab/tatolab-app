// Each project's `.venv` sync, followed live over one `/mcp/stdio` connection: a
// `subscriptions/listen` on `streamlib://stream-actions` is told each time an action is queued or
// changes, uv's lines included, and the resource is read again after each. An action that leaves
// the list, or leaves its `making_the_venv` step, is read once more by
// `streamlib://stream-action/<action>`, which the runtime keeps after the action ends, so a sync
// shorter than a status round still reaches the window as just ended.

import { STREAM_ACTION_STEP_MAKING_THE_VENV, type ProjectVenvSyncOfAStreamAction, type StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import type { McpStdioResourceListen } from "./local_api_mcp_stdio_connection.js";
import type { Result } from "./result.js";
import { streamActionDescriptionFromTheStreamActionResourceText, streamActionsUnderWayFromTheStreamActionsResourceText } from "./stream_action_description.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The resource holding every stream action queued or under way, as the runtime names it. */
export const STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI = "streamlib://stream-actions";

/** The resource holding one stream action, kept among its project's last finished ones once it ends. */
export function streamActionResourceUri(action: string): string {
  return `streamlib://stream-action/${action}`;
}

/** The parts of a `LocalApiMcpStdioConnection` the feed uses, so a test can stand in for one. */
export interface StreamActionsFeedConnection {
  readResourceText(uri: string): Promise<Result<string, LocalApiRequestFailure>>;
  listenForUpdatesOfTheResource(uri: string, whenUpdated: () => void, whenEnded: (whyItEnded: string) => void): McpStdioResourceListen;
  close(): void;
}

/** What following the stream actions reaches: a connection to the runtime, the status to refresh as a sync changes, and the app's log. */
export interface ProjectVenvSyncsOnTheStreamActionsFeedSources {
  openTheFeedConnection: () => Promise<Result<StreamActionsFeedConnection, LocalApiRequestFailure>>;
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
  private feedConnection: StreamActionsFeedConnection | null = null;
  private resourceListen: McpStdioResourceListen | null = null;
  private isFollowing = false;
  private followsStarted = 0;
  private hasStopped = false;
  private readInFlight: Promise<void> | null = null;
  private isAnotherReadWanted = false;
  private actionsMakingTheVenvAtTheLastRead = new Map<string, StreamActionDescription>();
  private actionsListedAtTheLastRead: ReadonlySet<string> = new Set();
  private syncsJustEnded: ProjectVenvSyncOfAStreamAction[] = [];
  private hasSaidWhyTheFeedEnded = false;

  constructor(private readonly sources: ProjectVenvSyncsOnTheStreamActionsFeedSources) {}

  /** Follow the feed while the runtime answers its health check, and stop following it while it does not. */
  keepFollowing(isTheRuntimeAnswering: boolean): void {
    if (!isTheRuntimeAnswering) {
      this.closeTheConnection();
      this.isFollowing = false;
      this.followsStarted += 1;
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
    this.closeTheConnection();
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
    const feedConnection = opened.value;
    this.feedConnection = feedConnection;
    const resourceListen = feedConnection.listenForUpdatesOfTheResource(
      STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI,
      () => void this.readTheFeed(feedConnection),
      (whyItEnded) => {
        if (this.feedConnection === feedConnection) this.endBecause(whyItEnded);
      },
    );
    if (this.feedConnection !== feedConnection) {
      resourceListen.stop();
      return;
    }
    this.resourceListen = resourceListen;
    await this.readTheFeed(feedConnection);
  }

  private readTheFeed(feedConnection: StreamActionsFeedConnection): Promise<void> {
    if (this.readInFlight !== null) {
      this.isAnotherReadWanted = true;
      return this.readInFlight;
    }
    const read = (async () => {
      do {
        this.isAnotherReadWanted = false;
        const resourceRead = await feedConnection.readResourceText(STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI);
        if (this.feedConnection !== feedConnection) return;
        const actionsUnderWay = resourceRead.ok ? streamActionsUnderWayFromTheStreamActionsResourceText(resourceRead.value) : { ok: false as const, failure: resourceRead.failure.failureDescription };
        if (!actionsUnderWay.ok) {
          this.endBecause(actionsUnderWay.failure);
          return;
        }
        this.hasSaidWhyTheFeedEnded = false;
        await this.noticeTheActionsUnderWay(feedConnection, actionsUnderWay.value);
      } while (this.isAnotherReadWanted && this.feedConnection === feedConnection);
    })().finally(() => {
      if (this.readInFlight === read) this.readInFlight = null;
    });
    this.readInFlight = read;
    return read;
  }

  private async noticeTheActionsUnderWay(feedConnection: StreamActionsFeedConnection, actionsUnderWay: readonly StreamActionDescription[]): Promise<void> {
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
    const endedSyncsReadAgain = await Promise.all(actionsThatLeftTheList.map((action) => this.lastSyncOfTheEndedAction(feedConnection, action)));
    const syncsJustEnded = [...syncsThatLeftTheVenvStepStillListed, ...endedSyncsReadAgain.flatMap((endedSync) => endedSync ?? [])];
    this.syncsJustEnded.push(...syncsJustEnded);
    if (syncsJustEnded.length > 0 || actionsMakingTheVenv.size > 0 || hadAnySyncUnderWay) this.sources.whenTheSyncsChange();
  }

  private async lastSyncOfTheEndedAction(feedConnection: StreamActionsFeedConnection, action: string): Promise<ProjectVenvSyncOfAStreamAction | null> {
    const resourceRead = await feedConnection.readResourceText(streamActionResourceUri(action));
    const description = resourceRead.ok ? streamActionDescriptionFromTheStreamActionResourceText(resourceRead.value) : { ok: false as const, failure: resourceRead.failure.failureDescription };
    if (!description.ok) {
      this.sources.tatolabAppLog.warn("an ended stream action could not be read, so the Activity panel shows no sync for it", { action, because: description.failure });
      return null;
    }
    return syncOfTheAction(description.value);
  }

  private endBecause(why: string): void {
    this.closeTheConnection();
    this.isFollowing = false;
    if (this.hasStopped || this.hasSaidWhyTheFeedEnded) return;
    this.hasSaidWhyTheFeedEnded = true;
    this.sources.tatolabAppLog.warn("the runtime's stream actions are not followed until the next status round", { because: why });
  }

  private closeTheConnection(): void {
    this.resourceListen?.stop();
    this.resourceListen = null;
    this.feedConnection?.close();
    this.feedConnection = null;
  }
}
