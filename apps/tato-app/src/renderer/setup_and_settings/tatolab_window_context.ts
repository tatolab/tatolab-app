import { createContext, useContext, useSyncExternalStore } from "react";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type { RuntimeDescriptionReading } from "../presentation/settings_presentation";
import type { RuntimeDescriptionReadings } from "../runtime_description_reading";

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

/** What every part of the React window reads: the backend, the platform, the status and the runtime's description. */
export interface TatolabWindowEnvironment {
  backend: TatolabBackend;
  platform: TatolabPlatform;
  statusStore: TatolabWindowStatusStore;
  /** The runtime's version, uptime and log folder, read while Settings shows them. */
  runtimeDescriptionReadings: RuntimeDescriptionReadings;
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
