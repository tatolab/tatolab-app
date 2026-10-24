// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { RuntimeDescriptionReading } from "./presentation/settings_presentation";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often the runtime's description is read while a page shows it: its uptime is shown to the minute. */
export const RUNTIME_DESCRIPTION_POLL_MILLISECONDS = 15_000;

const NOTHING_READ_YET: RuntimeDescriptionReading = { kind: "not_read" };

/**
 * The one reader of the runtime's description, which Settings' Runtime and About show: it reads `describe_runtime`
 * while a page shows it and the window lets it poll, and again at once each time the runtime's state changes, so a
 * restarted runtime's version and uptime replace the last one's as soon as it answers.
 */
export class RuntimeDescriptionReadings {
  private latestReading: RuntimeDescriptionReading = NOTHING_READ_YET;
  private readonly readingListeners = new Set<() => void>();
  private readonly descriptionPoll: RepeatingBackendPoll;
  private pagesShowingIt = 0;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeRuntime">,
    pollMilliseconds: number = RUNTIME_DESCRIPTION_POLL_MILLISECONDS,
  ) {
    this.descriptionPoll = new RepeatingBackendPoll(() => this.readTheRuntimesDescription(), pollMilliseconds);
  }

  /** The latest reading, the same object until it changes. */
  readonly readLatestReading = (): RuntimeDescriptionReading => this.latestReading;

  /** Calls `readingListener` after each change, and reads the description while any page listens; the returned function stops it. */
  readonly subscribeToReading = (readingListener: () => void): (() => void) => {
    this.readingListeners.add(readingListener);
    this.pagesShowingIt += 1;
    this.updatePolling();
    return () => {
      this.readingListeners.delete(readingListener);
      this.pagesShowingIt -= 1;
      this.updatePolling();
    };
  };

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.updatePolling();
  }

  /** Read the description at once, as a change of the runtime's state asks. */
  pollNow(): void {
    this.descriptionPoll.pollNow();
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.pagesShowingIt > 0) this.descriptionPoll.start();
    else this.descriptionPoll.stop();
  }

  private async readTheRuntimesDescription(): Promise<void> {
    try {
      this.showReading({ kind: "read", description: await this.backend.describeRuntime() });
    } catch (rejection) {
      this.showReading({ kind: "refused", refusal: describeBackendRejection(rejection) });
    }
  }

  private showReading(reading: RuntimeDescriptionReading): void {
    this.latestReading = reading;
    for (const readingListener of this.readingListeners) readingListener();
  }
}
