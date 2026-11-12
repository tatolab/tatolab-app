// The change feed of the project a studio window shows, followed over one `/mcp/stdio`
// connection: `list_assets` opens the project in the runtime and names its feed's resource, a
// `subscriptions/listen` on that resource is told of each transaction the runtime applies, and
// the resource is read again after each. A listen that ends is followed again at once, keeping the
// last reading; when that fails too the window is told why, and the feed is followed again every
// few seconds until the runtime answers.

import type { ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { LocalApiResourceFollowedOverOneConnection, type LocalApiResourceFollowingConnection } from "./local_api_resource_followed_over_one_connection.js";
import { projectTransactionsFromTheResourceText } from "./project_transactions_on_the_wire.js";
import type { Result } from "./result.js";

/** How long after the feed's connection ends it is followed again. */
export const PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS = 3_000;

/** What following a window's project feed reaches: the runtime's `list_assets`, a connection to the runtime, a timer, and the window. */
export interface ProjectTransactionsFeedOfAStudioWindowSources {
  /** The change feed's resource of the project in `projectFolder`, as `list_assets` names it, which opens the project in the runtime; or why it names none. */
  nameTheChangeFeedOfTheProject: (projectFolder: string) => Promise<Result<string, LocalApiRequestFailure>>;
  openTheFeedConnection: () => Promise<Result<LocalApiResourceFollowingConnection, LocalApiRequestFailure>>;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheProjectTransactions: (reading: ProjectTransactionsReading) => void;
}

/** The change feed of the project in `projectFolder`, followed while its studio window is open. */
export class ProjectTransactionsFeedOfAStudioWindow {
  private lastReading: ProjectTransactionsReading = { kind: "not_read", because: "The project's history has not been read yet." };
  private feedConnection: LocalApiResourceFollowingConnection | null = null;
  private followedTransactions: LocalApiResourceFollowedOverOneConnection | null = null;
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
    const uri = await this.sources.nameTheChangeFeedOfTheProject(this.projectFolder);
    if (this.feedConnection !== feedConnection) return;
    if (!uri.ok) {
      this.endBecause(uri.failure.failureDescription, "tell_the_window");
      return;
    }
    const followedTransactions = new LocalApiResourceFollowedOverOneConnection(feedConnection, uri.value, {
      whenRead: (reading) => {
        const transactions = reading.ok ? projectTransactionsFromTheResourceText(reading.value) : reading;
        if (transactions.ok) this.hasFollowedAgainAtOnce = false;
        this.publish(transactions.ok ? { kind: "read", project_transactions: transactions.value } : { kind: "not_read", because: transactions.failure });
      },
      whenTheListenEnded: (whyItEnded) => {
        if (this.feedConnection !== feedConnection) return;
        const followsAgainAtOnce = this.lastReading.kind === "read" && !this.hasFollowedAgainAtOnce;
        this.hasFollowedAgainAtOnce = followsAgainAtOnce;
        this.endBecause(whyItEnded, followsAgainAtOnce ? "follow_again_at_once" : "tell_the_window");
      },
    });
    this.followedTransactions = followedTransactions;
    await followedTransactions.start();
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
    if (this.followedTransactions === null) this.feedConnection?.close();
    this.followedTransactions?.stop();
    this.followedTransactions = null;
    this.feedConnection = null;
  }

  private publish(reading: ProjectTransactionsReading): void {
    if (this.hasStopped || JSON.stringify(reading) === JSON.stringify(this.lastReading)) return;
    this.lastReading = reading;
    this.sources.sendTheWindowTheProjectTransactions(reading);
  }
}
