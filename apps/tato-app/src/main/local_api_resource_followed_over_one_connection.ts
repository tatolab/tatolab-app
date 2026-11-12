// One resource of the runtime's local API followed over one `/mcp/stdio` connection: a
// `subscriptions/listen` names it, and it is read at once and again after each
// `notifications/resources/updated`, one read at a time, an update that lands mid-read asking for
// one more read after it. Stopping it stops the listen and closes the connection, and nothing it
// reads is handed on after that.

import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { McpStdioResourceListen } from "./local_api_mcp_stdio_connection.js";
import type { Result } from "./result.js";

/** The parts of a `LocalApiMcpStdioConnection` a followed resource uses, so a test can stand in for one. */
export interface LocalApiResourceFollowingConnection {
  readResourceText(uri: string): Promise<Result<string, LocalApiRequestFailure>>;
  listenForUpdatesOfTheResource(uri: string, whenUpdated: () => void, whenEnded: (whyItEnded: string) => void): McpStdioResourceListen;
  close(): void;
}

/** What a followed resource hands on: each reading, in the order read, and once, why the listen ended. */
export interface LocalApiResourceFollowedOverOneConnectionSinks {
  /** Called with each reading, the text or why it was not read; the next read waits for the answer. */
  whenRead: (reading: Result<string, string>) => void | Promise<void>;
  whenTheListenEnded: (whyItEnded: string) => void;
}

/** The resource `uri`, followed over `connection` until stopped. */
export class LocalApiResourceFollowedOverOneConnection {
  private resourceListen: McpStdioResourceListen | null = null;
  private hasStopped = false;
  private readInFlight: Promise<void> | null = null;
  private isAnotherReadWanted = false;

  constructor(
    readonly connection: LocalApiResourceFollowingConnection,
    readonly uri: string,
    private readonly sinks: LocalApiResourceFollowedOverOneConnectionSinks,
  ) {}

  /** Listen for the resource's updates, then read it; answers once the first reading is handed on. */
  start(): Promise<void> {
    const resourceListen = this.connection.listenForUpdatesOfTheResource(
      this.uri,
      () => void this.readTheResource(),
      (whyItEnded) => {
        if (!this.hasStopped) this.sinks.whenTheListenEnded(whyItEnded);
      },
    );
    if (this.hasStopped) {
      resourceListen.stop();
      return Promise.resolve();
    }
    this.resourceListen = resourceListen;
    return this.readTheResource();
  }

  /** Whether `stop` has been called, so a sink awaiting more of the connection can tell its work is stale. */
  isStopped(): boolean {
    return this.hasStopped;
  }

  /** Stop the listen and close the connection; nothing read after this is handed on. */
  stop(): void {
    if (this.hasStopped) return;
    this.hasStopped = true;
    this.resourceListen?.stop();
    this.resourceListen = null;
    this.connection.close();
  }

  private readTheResource(): Promise<void> {
    if (this.readInFlight !== null) {
      this.isAnotherReadWanted = true;
      return this.readInFlight;
    }
    const read = (async () => {
      do {
        this.isAnotherReadWanted = false;
        const resourceRead = await this.connection.readResourceText(this.uri);
        if (this.hasStopped) return;
        await this.sinks.whenRead(resourceRead.ok ? resourceRead : { ok: false, failure: resourceRead.failure.failureDescription });
      } while (this.isAnotherReadWanted && !this.hasStopped);
    })().finally(() => {
      if (this.readInFlight === read) this.readInFlight = null;
    });
    this.readInFlight = read;
    return read;
  }
}
