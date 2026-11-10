// The change feed of the project a studio window shows, followed over one `/mcp/stdio`
// connection: `list_assets` opens the project in the runtime and names its feed's resource, a
// `subscriptions/listen` on that resource is told of each transaction the runtime applies, and
// the resource is read again after each. When the runtime goes away the window is told why, and
// the feed is followed again once it answers.

import type { ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import type { McpStdioResourceListen } from "./local_api_mcp_stdio_connection.js";
import { projectTransactionsFromTheResourceText, transactionsResourceUriFromTheListAssetsToolResult } from "./project_transactions_on_the_wire.js";
import type { Result } from "./result.js";

/** How long after the feed's connection ends it is followed again. */
export const PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS = 3_000;

/** The parts of a `LocalApiMcpStdioConnection` the feed uses, so a test can stand in for one. */
export interface ProjectTransactionsFeedConnection {
  callMcpTool(toolName: string, toolArguments: Readonly<Record<string, unknown>>): Promise<Result<string, LocalApiRequestFailure>>;
  readResourceText(uri: string): Promise<Result<string, LocalApiRequestFailure>>;
  listenForUpdatesOfTheResource(uri: string, whenUpdated: () => void, whenEnded: (whyItEnded: string) => void): McpStdioResourceListen;
  close(): void;
}

/** What following a window's project feed reaches: a connection to the runtime, a timer, and the window. */
export interface ProjectTransactionsFeedOfAStudioWindowSources {
  openTheFeedConnection: () => Promise<Result<ProjectTransactionsFeedConnection, LocalApiRequestFailure>>;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheProjectTransactions: (reading: ProjectTransactionsReading) => void;
}

/** The change feed of the project in `projectFolder`, followed while its studio window is open. */
export class ProjectTransactionsFeedOfAStudioWindow {
  private lastReading: ProjectTransactionsReading = { kind: "not_read", because: "The project's history has not been read yet." };
  private feedConnection: ProjectTransactionsFeedConnection | null = null;
  private resourceListen: McpStdioResourceListen | null = null;
  private cancelTheNextFollow: (() => void) | null = null;
  private isFollowing = false;
  private hasStopped = false;
  private readInFlight: Promise<void> | null = null;
  private isAnotherReadWanted = false;

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
      this.endBecause(opened.failure.failureDescription);
      return;
    }
    const feedConnection = opened.value;
    this.feedConnection = feedConnection;
    const listed = await feedConnection.callMcpTool("list_assets", { project_directory: this.projectFolder });
    if (this.feedConnection !== feedConnection) return;
    const uri = listed.ok ? transactionsResourceUriFromTheListAssetsToolResult(listed.value) : { ok: false as const, failure: listed.failure.failureDescription };
    if (!uri.ok) {
      this.endBecause(uri.failure);
      return;
    }
    this.resourceListen = feedConnection.listenForUpdatesOfTheResource(
      uri.value,
      () => void this.readTheFeed(feedConnection, uri.value),
      (whyItEnded) => {
        if (this.feedConnection === feedConnection) this.endBecause(whyItEnded);
      },
    );
    await this.readTheFeed(feedConnection, uri.value);
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

  private readTheFeed(feedConnection: ProjectTransactionsFeedConnection, uri: string): Promise<void> {
    if (this.readInFlight !== null) {
      this.isAnotherReadWanted = true;
      return this.readInFlight;
    }
    this.readInFlight = (async () => {
      do {
        this.isAnotherReadWanted = false;
        const read = await feedConnection.readResourceText(uri);
        if (this.feedConnection !== feedConnection) return;
        const transactions = read.ok ? projectTransactionsFromTheResourceText(read.value) : { ok: false as const, failure: read.failure.failureDescription };
        this.publish(transactions.ok ? { kind: "read", project_transactions: transactions.value } : { kind: "not_read", because: transactions.failure });
      } while (this.isAnotherReadWanted);
    })().finally(() => {
      this.readInFlight = null;
    });
    return this.readInFlight;
  }

  private endBecause(why: string): void {
    this.closeTheConnection();
    this.isFollowing = false;
    this.publish({ kind: "not_read", because: why });
    if (this.hasStopped) return;
    this.cancelTheNextFollow = this.sources.runAfter(PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS, () => {
      this.cancelTheNextFollow = null;
      void this.follow();
    });
  }

  private closeTheConnection(): void {
    this.resourceListen?.stop();
    this.resourceListen = null;
    this.feedConnection?.close();
    this.feedConnection = null;
  }

  private publish(reading: ProjectTransactionsReading): void {
    if (this.hasStopped) return;
    this.lastReading = reading;
    this.sources.sendTheWindowTheProjectTransactions(reading);
  }
}
