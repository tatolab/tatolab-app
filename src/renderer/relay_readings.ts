import type { RelaySettingsByName } from "../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import { relaysDescriptionOfTheReading, type RelaysReading } from "./presentation/relays_presentation";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often the relays are read while Settings › Relays shows them, so a relay joining or lost reads as it changes. */
export const RELAYS_POLL_MILLISECONDS = 3_000;

const NOTHING_READ_YET: RelaysReading = { kind: "not_read" };

/**
 * The one reader of the runtime's relays and its relay-adapter catalog, which Settings › Relays shows: it reads
 * `describe_relays` while a page shows it and the window lets it poll, again at once after each change made through it,
 * and from nothing each time the runtime's state changes.
 */
export class RelayReadings {
  private latestReading: RelaysReading = NOTHING_READ_YET;
  private readonly readingListeners = new Set<() => void>();
  private readonly relaysPoll: RepeatingBackendPoll;
  private pagesShowingIt = 0;
  /** Counts the runtime's state changes, so an answer about the runtime before the last one is dropped. */
  private runtimeStateChangesSeen = 0;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeRelays" | "addRelay" | "configureRelay" | "removeRelay">,
    pollMilliseconds: number = RELAYS_POLL_MILLISECONDS,
  ) {
    this.relaysPoll = new RepeatingBackendPoll(() => this.readTheRelays(), pollMilliseconds);
  }

  /** The latest reading, the same object until it changes. */
  readonly readLatestReading = (): RelaysReading => this.latestReading;

  /** Calls `readingListener` after each change, and reads the relays while any page listens; the returned function stops it. */
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

  /** The runtime's state changed: what it last listed was another runtime's, so it is forgotten and read again at once. */
  forgetAndReadAgainAsTheRuntimesStateChanged(): void {
    this.runtimeStateChangesSeen += 1;
    this.showReading(NOTHING_READ_YET);
    this.relaysPoll.pollNow();
  }

  /** Add a relay of `adapter` with `settings`, resolving with the id the runtime gave it; the relays are read again whether it was added or refused. */
  addRelay(adapter: string, settings: Readonly<RelaySettingsByName>): Promise<string> {
    return this.readAgainAfter(this.backend.addRelay(adapter, settings));
  }

  /** Replace the settings named in `settings` on `relayId`; the relays are read again whether it was configured or refused. */
  configureRelay(relayId: string, settings: Readonly<RelaySettingsByName>): Promise<void> {
    return this.readAgainAfter(this.backend.configureRelay(relayId, settings));
  }

  /** Leave and forget `relayId`; the relays are read again whether it was removed or refused. */
  removeRelay(relayId: string): Promise<void> {
    return this.readAgainAfter(this.backend.removeRelay(relayId));
  }

  private readAgainAfter<Answer>(relayChange: Promise<Answer>): Promise<Answer> {
    return relayChange.finally(() => this.relaysPoll.pollNow());
  }

  private updatePolling(): void {
    if (this.isPollingAllowed && this.pagesShowingIt > 0) this.relaysPoll.start();
    else this.relaysPoll.stop();
  }

  private async readTheRelays(): Promise<void> {
    const runtimeStateChangesSeenAtTheRead = this.runtimeStateChangesSeen;
    let reading: RelaysReading;
    try {
      reading = { kind: "read", description: await this.backend.describeRelays() };
    } catch (rejection) {
      reading = { kind: "refused", refusal: describeBackendRejection(rejection), lastDescription: relaysDescriptionOfTheReading(this.latestReading) };
    }
    if (runtimeStateChangesSeenAtTheRead === this.runtimeStateChangesSeen) this.showReading(reading);
  }

  private showReading(reading: RelaysReading): void {
    this.latestReading = reading;
    for (const readingListener of this.readingListeners) readingListener();
  }
}
