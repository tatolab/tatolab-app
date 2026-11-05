import { createContext, useContext, useSyncExternalStore } from "react";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type { RuntimeDescriptionReading } from "../presentation/settings_presentation";
import type { RuntimeDescriptionReadings } from "../runtime_description_reading";
import type { TatolabWindowPage } from "./tatolab_window_page";

/** The latest status the backend reported, which React reads and re-renders on. */
export class TatolabWindowStatusStore {
  private readonly statusListeners = new Set<() => void>();

  constructor(private latestStatus: TatolabStatus) {}

  readonly readLatestStatus = (): TatolabStatus => this.latestStatus;

  readonly subscribeToStatus = (statusListener: () => void): (() => void) => {
    this.statusListeners.add(statusListener);
    return () => this.statusListeners.delete(statusListener);
  };

  /** Keep `status` and tell every subscriber, in the order they subscribed. */
  publishStatus(status: TatolabStatus): void {
    this.latestStatus = status;
    for (const statusListener of this.statusListeners) statusListener();
  }
}

/** A refusal the window keeps after the place that asked has gone, for another place to show: why the last uninstall was refused, or why first run's finishing was not remembered. */
export class RefusalKeptForTheWindow {
  private refusalReason: string | null = null;
  private readonly refusalListeners = new Set<() => void>();

  readonly readRefusalReason = (): string | null => this.refusalReason;

  readonly subscribeToRefusal = (refusalListener: () => void): (() => void) => {
    this.refusalListeners.add(refusalListener);
    return () => this.refusalListeners.delete(refusalListener);
  };

  /** Keep `refusalReason`, `null` to clear it, and tell every subscriber. */
  showRefusalReason(refusalReason: string | null): void {
    if (this.refusalReason === refusalReason) return;
    this.refusalReason = refusalReason;
    for (const refusalListener of this.refusalListeners) refusalListener();
  }
}

/** What every part of the React window reads: the backend, the platform, the status, the Linux installer's DOM page, the runtime's description and uninstalling. */
export interface TatolabWindowEnvironment {
  backend: TatolabBackend;
  platform: TatolabPlatform;
  statusStore: TatolabWindowStatusStore;
  /** What fills the Linux window while tatolabd.service is missing and the app is not installing it; `null` on macOS, whose first run is the React getting-started view. */
  linuxRuntimeInstallScreen: TatolabWindowPage | null;
  /** The runtime's version, uptime and log folder, read while Preferences shows them. */
  runtimeDescriptionReadings: RuntimeDescriptionReadings;
  /** Open the sheet "Uninstall Spudnik Studio…" asks to confirm in. */
  openUninstallSheet(): void;
  /** Why the last uninstall was refused, which Preferences shows under Uninstall Tatolab…, until the sheet opens again. */
  uninstallTatolabRefusal: RefusalKeptForTheWindow;
  /** Why Get Started could not be remembered, which a notice shows over the studio once first run is over. */
  firstRunFinishingRefusal: RefusalKeptForTheWindow;
}

/** Carries the window's environment to every component under `mountTatolabWindow`'s root. */
export const TatolabWindowEnvironmentContext = createContext<TatolabWindowEnvironment | null>(null);

/** The window's environment; only components rendered inside `mountTatolabWindow` call it. */
export function useTatolabWindowEnvironment(): TatolabWindowEnvironment {
  const environment = useContext(TatolabWindowEnvironmentContext);
  if (environment === null) throw new Error("useTatolabWindowEnvironment is called outside the Tatolab window");
  return environment;
}

/** The latest status, re-rendering the caller on each new one. */
export function useTatolabStatus(): TatolabStatus {
  const { statusStore } = useTatolabWindowEnvironment();
  return useSyncExternalStore(statusStore.subscribeToStatus, statusStore.readLatestStatus);
}

/** What the runtime last said of itself, read while the caller is shown, re-rendering it on each change. */
export function useRuntimeDescriptionReading(): RuntimeDescriptionReading {
  const { runtimeDescriptionReadings } = useTatolabWindowEnvironment();
  return useSyncExternalStore(runtimeDescriptionReadings.subscribeToReading, runtimeDescriptionReadings.readLatestReading);
}

/** Why the last uninstall was refused, `null` for none, re-rendering the caller on each change. */
export function useUninstallTatolabRefusalReason(): string | null {
  const { uninstallTatolabRefusal } = useTatolabWindowEnvironment();
  return useSyncExternalStore(uninstallTatolabRefusal.subscribeToRefusal, uninstallTatolabRefusal.readRefusalReason);
}

/** Why Get Started could not be remembered, `null` with no refusal or once dismissed. */
export function useFirstRunFinishingRefusalReason(): string | null {
  const { firstRunFinishingRefusal } = useTatolabWindowEnvironment();
  return useSyncExternalStore(firstRunFinishingRefusal.subscribeToRefusal, firstRunFinishingRefusal.readRefusalReason);
}
