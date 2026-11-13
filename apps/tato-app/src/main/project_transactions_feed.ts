// The change feed of the project a studio window shows, followed over one `/control/ws`
// WebSocket: `read_project_changes` opens the project in the runtime and answers its feed, whose
// project UUID `subscribe_project_changes` names, and each `project_changed` of that project,
// `missed` among them, reads the feed again, one read at a time. A `files_changed`, a file an
// editor or another tool changed in the project's folder, leaves the feed as it is: the window is
// told the project's files changed. A `node_types_added`, `node_types_removed` or
// `node_types_updated` leaves it as it is too: the window is told the project's node types
// changed. The window is told both after `missed` and after each subscribe, when a change may have
// gone untold. A connection that closes is
// followed again at once, keeping the last reading; when that fails too the window is told why,
// and the feed is followed again every few seconds until the runtime answers.

import type { ProjectTransactions, ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { projectTransactionsFromTheChangeFeed } from "./project_transactions_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { ControlNotifications, TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** How long after the feed's connection ends it is followed again. */
export const PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS = 3_000;

/** The parts of a `/control/ws` connection a project's feed is followed over, so a test can stand in for one. */
export interface ProjectChangesConnection {
  /** The runtime's `read_project_changes` of the project in `projectFolder`, or why it was not read. */
  readTheProjectChanges(projectFolder: string): Promise<Result<ProjectTransactions, string>>;
  /** The runtime's `subscribe_project_changes` of the project whose UUID is `project`; refused in its words. */
  subscribeToTheProjectChanges(project: string): Promise<Result<void, string>>;
  /** Call `listener` with each `project_changed` the runtime sends on this connection. */
  onProjectChanged(listener: (change: ControlNotifications["project_changed"]) => void): void;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  close(): void;
}

/** What following a window's project feed reaches: a connection to the runtime, a timer, and the window. */
export interface ProjectTransactionsFeedOfAStudioWindowSources {
  openTheFeedConnection: () => Promise<Result<ProjectChangesConnection, LocalApiRequestFailure>>;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheProjectTransactions: (reading: ProjectTransactionsReading) => void;
  /** Tell the window a file of the project changed, so it lists the project again. */
  tellTheWindowTheProjectFilesChanged: () => void;
  /** Tell the window the node types the project offers changed, so it lists them again. */
  tellTheWindowTheProjectNodeTypesChanged: () => void;
}

/** The `project_changed` kinds that name node types the project offers, which leave its feed as it is. */
const PROJECT_CHANGES_NAMING_NODE_TYPES: ReadonlySet<string> = new Set(["node_types_added", "node_types_removed", "node_types_updated"]);

/** `controlWebSocketConnection` as the connection a project's feed is followed over. */
export function projectChangesConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): ProjectChangesConnection {
  return {
    readTheProjectChanges: async (projectFolder) => {
      const read = await controlWebSocketConnection.callControlOperation("read_project_changes", { project_directory: projectFolder });
      if (!read.ok) return failedWith(read.failure.failureDescription);
      return read.value.kind === "refused_by_the_operation" ? failedWith(read.value.words) : projectTransactionsFromTheChangeFeed(read.value.result);
    },
    subscribeToTheProjectChanges: async (project) => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_project_changes", { projects: [project] });
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onProjectChanged: (listener) => {
      controlWebSocketConnection.onNotification("project_changed", listener);
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The change feed of the project in `projectFolder`, followed while its studio window is open. */
export class ProjectTransactionsFeedOfAStudioWindow {
  private lastReading: ProjectTransactionsReading = { kind: "not_read", because: "The project's history has not been read yet." };
  private feedConnection: ProjectChangesConnection | null = null;
  private readInFlight: Promise<void> | null = null;
  private isAnotherReadWanted = false;
  private cancelTheNextFollow: (() => void) | null = null;
  private isFollowing = false;
  private hasStopped = false;
  private hasFollowedAgainAtOnce = false;

  constructor(
    readonly projectFolder: string,
    private readonly sources: ProjectTransactionsFeedOfAStudioWindowSources,
  ) {}

  /** The feed as last read, or why it is not. */
  readProjectTransactions(): ProjectTransactionsReading {
    return this.lastReading;
  }

  /** Start following the feed, unless it is already followed; answers once the first reading is sent. */
  async follow(): Promise<void> {
    if (this.hasStopped || this.isFollowing) return;
    this.isFollowing = true;
    this.cancelTheNextFollow?.();
    this.cancelTheNextFollow = null;
    const opened = await this.sources.openTheFeedConnection();
    if (this.hasStopped) {
      if (opened.ok) opened.value.close();
      return;
    }
    if (!opened.ok) {
      this.endBecause(opened.failure.failureDescription, "tell_the_window");
      return;
    }
    const feedConnection = opened.value;
    this.feedConnection = feedConnection;
    feedConnection.onClosed((whyItClosed) => {
      if (this.feedConnection !== feedConnection) return;
      const followsAgainAtOnce = this.lastReading.kind === "read" && !this.hasFollowedAgainAtOnce;
      this.hasFollowedAgainAtOnce = followsAgainAtOnce;
      this.endBecause(whyItClosed, followsAgainAtOnce ? "follow_again_at_once" : "tell_the_window");
    });
    const firstRead = await feedConnection.readTheProjectChanges(this.projectFolder);
    if (this.feedConnection !== feedConnection) return;
    if (!firstRead.ok) {
      this.endBecause(firstRead.failure, "tell_the_window");
      return;
    }
    const project = firstRead.value.project;
    feedConnection.onProjectChanged((change) => {
      if (this.feedConnection !== feedConnection || change.project !== project) return;
      const namesNodeTypes = PROJECT_CHANGES_NAMING_NODE_TYPES.has(change.change);
      if (change.change === "files_changed" || change.change === "missed") this.sources.tellTheWindowTheProjectFilesChanged();
      if (namesNodeTypes || change.change === "missed") this.sources.tellTheWindowTheProjectNodeTypesChanged();
      if (change.change !== "files_changed" && !namesNodeTypes) void this.readTheFeed(feedConnection);
    });
    const subscribed = await feedConnection.subscribeToTheProjectChanges(project);
    if (this.feedConnection !== feedConnection) return;
    if (!subscribed.ok) {
      this.endBecause(subscribed.failure, "tell_the_window");
      return;
    }
    this.hasFollowedAgainAtOnce = false;
    this.sources.tellTheWindowTheProjectFilesChanged();
    this.sources.tellTheWindowTheProjectNodeTypesChanged();
    this.publish({ kind: "read", project_transactions: firstRead.value });
    await this.readTheFeed(feedConnection);
  }

  /** Follow the feed again at once, as the runtime starts answering. */
  followAgain(): Promise<void> {
    return this.follow();
  }

  /** Stop following, as the window closes or the app quits. */
  stopFollowing(): void {
    this.hasStopped = true;
    this.cancelTheNextFollow?.();
    this.cancelTheNextFollow = null;
    this.closeTheConnection();
  }

  private readTheFeed(feedConnection: ProjectChangesConnection): Promise<void> {
    if (this.readInFlight !== null) {
      this.isAnotherReadWanted = true;
      return this.readInFlight;
    }
    const read = (async () => {
      do {
        this.isAnotherReadWanted = false;
        const reading = await feedConnection.readTheProjectChanges(this.projectFolder);
        if (this.feedConnection !== feedConnection) return;
        this.publish(reading.ok ? { kind: "read", project_transactions: reading.value } : { kind: "not_read", because: reading.failure });
      } while (this.isAnotherReadWanted && this.feedConnection === feedConnection);
    })().finally(() => {
      if (this.readInFlight === read) this.readInFlight = null;
    });
    this.readInFlight = read;
    return read;
  }

  private endBecause(why: string, thenWhat: "tell_the_window" | "follow_again_at_once"): void {
    this.closeTheConnection();
    this.isFollowing = false;
    if (this.hasStopped) return;
    if (thenWhat === "follow_again_at_once") {
      void this.follow();
      return;
    }
    this.publish({ kind: "not_read", because: why });
    this.cancelTheNextFollow = this.sources.runAfter(PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS, () => {
      this.cancelTheNextFollow = null;
      void this.follow();
    });
  }

  private closeTheConnection(): void {
    const feedConnection = this.feedConnection;
    this.feedConnection = null;
    this.readInFlight = null;
    this.isAnotherReadWanted = false;
    feedConnection?.close();
  }

  private publish(reading: ProjectTransactionsReading): void {
    if (this.hasStopped || JSON.stringify(reading) === JSON.stringify(this.lastReading)) return;
    this.lastReading = reading;
    this.sources.sendTheWindowTheProjectTransactions(reading);
  }
}
