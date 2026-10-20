// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Polls the status every couple of seconds and publishes each change to the tray menu and, as
// the `tatolab-status-changed` event, to the window.

import { isDeepStrictEqual } from "node:util";
import type { TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { TatolabAppController } from "./tatolab_app_controller.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The event the window hears each status change on, and the status again each time it is shown. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** How often the poller observes the runtime when nothing asks it to sooner. */
export const STATUS_POLL_INTERVAL_MS = 2_000;

/** Where the status shows in the tray: its status line, the switch's check mark, and "Set Up Tatolab…". */
export interface TatolabStatusShownInTheTray {
  showStatus(status: TatolabStatus): void;
}

/** The poller's wake-ups: a refresh request, or its interval passing. Requests made while a round runs collapse into the one round after it. */
export class TatolabStatusRefreshRequests {
  private refreshRequested = false;
  private everyRequesterIsGone = false;
  private wakeTheWaitingRound: (() => void) | null = null;

  /** Ask for a round now rather than at the next interval. */
  requestRefresh(): void {
    this.refreshRequested = true;
    this.wakeTheWaitingRound?.();
  }

  /** No more rounds: the app is exiting. */
  stopRequestingRounds(): void {
    this.everyRequesterIsGone = true;
    this.wakeTheWaitingRound?.();
  }

  /** Wait up to `pollIntervalMs` for a refresh request, taking every request already made as one; whether another round should run. */
  async waitForTheNextStatusRound(pollIntervalMs: number): Promise<boolean> {
    if (!this.refreshRequested && !this.everyRequesterIsGone) {
      await new Promise<void>((wake) => {
        const pollIntervalTimer = setTimeout(wake, pollIntervalMs);
        this.wakeTheWaitingRound = () => {
          clearTimeout(pollIntervalTimer);
          wake();
        };
      });
      this.wakeTheWaitingRound = null;
    }
    this.refreshRequested = false;
    return !this.everyRequesterIsGone;
  }
}

/** The last status published, and where each change goes. */
export class TatolabStatusPublisher {
  private lastPublishedStatus: TatolabStatus | null = null;
  private readonly waitingForTheFirstStatus: (() => void)[] = [];
  private tatolabTrayMenu: TatolabStatusShownInTheTray | null = null;
  private readonly refreshRequests = new TatolabStatusRefreshRequests();
  private polling = false;

  /** A publisher of `controller`'s status, sending each change to the window through `sendTheWindowTheStatus`, polling once `startPolling` is called. */
  constructor(
    private readonly controller: TatolabAppController,
    private readonly sendTheWindowTheStatus: (status: TatolabStatus) => void,
    private readonly readMonotonicClockMs: () => number,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Hand the tray menu every later change. */
  attachTrayMenu(tatolabTrayMenu: TatolabStatusShownInTheTray): void {
    if (this.tatolabTrayMenu !== null) {
      this.tatolabAppLog.warn("the tray menu was attached twice; keeping the first");
      return;
    }
    if (this.lastPublishedStatus !== null) tatolabTrayMenu.showStatus(this.lastPublishedStatus);
    this.tatolabTrayMenu = tatolabTrayMenu;
  }

  /** The poller's one round: observe everything, react to an agent needing approval or a runtime that is down, and publish the status if it changed. Everyone else asks for a round with `requestRefresh`. */
  async refreshAndPublish(): Promise<void> {
    const nowMs = this.readMonotonicClockMs();
    const status = await this.controller.composeStatus(nowMs);
    await this.controller.openLoginItemsIfTheRuntimeAgentNeedsApproval(status.runtime_agent);
    await this.controller.startTheRuntimeIfThePollerFoundItDown(status, nowMs);
    if (!this.rememberIfChanged(status)) return;
    this.tatolabAppLog.info("Tatolab status changed", {
      runtime_state: status.runtime_state,
      runtime_agent: status.runtime_agent,
      run_tatolab: status.run_tatolab,
      listed_stream_count: status.streams?.length ?? null,
      machine_name: status.machine_name,
      machine_setup_state: status.machine_setup_state,
    });
    this.sendTheLastPublishedStatusToTheWindow();
    this.tatolabTrayMenu?.showStatus(status);
  }

  /** Remember `status` when it differs from the last one published, waking whoever waits for the first; whether it did. */
  private rememberIfChanged(status: TatolabStatus): boolean {
    if (isDeepStrictEqual(this.lastPublishedStatus, status)) return false;
    this.lastPublishedStatus = status;
    this.waitingForTheFirstStatus.splice(0).forEach((wake) => wake());
    return true;
  }

  /** Send the window the last status published, as the window is shown again or the status changes. */
  sendTheLastPublishedStatusToTheWindow(): void {
    if (this.lastPublishedStatus !== null) this.sendTheWindowTheStatus(this.lastPublishedStatus);
  }

  /** The last status published, waiting up to `waitLimitMs` for the poller's first round; `null` when it has published nothing by then. */
  async lastPublishedStatusWaitingUpTo(waitLimitMs: number): Promise<TatolabStatus | null> {
    if (this.lastPublishedStatus === null) {
      await new Promise<void>((wake) => {
        const waitLimitTimer = setTimeout(wake, waitLimitMs);
        this.waitingForTheFirstStatus.push(() => {
          clearTimeout(waitLimitTimer);
          wake();
        });
      });
    }
    return this.lastPublishedStatus;
  }

  /** Ask the poller to observe again now rather than at its next interval. */
  requestRefresh(): void {
    this.refreshRequests.requestRefresh();
  }

  /** Stop polling after the round under way: the app is exiting. */
  stopPolling(): void {
    this.refreshRequests.stopRequestingRounds();
  }

  /** Start the poller; a second call starts nothing. */
  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    void this.pollUntilStopped();
  }

  private async pollUntilStopped(): Promise<void> {
    do {
      await this.refreshAndPublish();
    } while (await this.refreshRequests.waitForTheNextStatusRound(STATUS_POLL_INTERVAL_MS));
  }
}
