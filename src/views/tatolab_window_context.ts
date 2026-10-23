// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createContext, useContext, useSyncExternalStore } from "react";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import type { SettingsPageView } from "./settings_page_view";
import type { StreamsPageView } from "./streams_page_view";
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

/** The DOM pages the window keeps until later tickets rebuild them in React. */
export interface TatolabWindowHostedPages {
  streamsPage: StreamsPageView;
  settingsPage: SettingsPageView;
  firstStreamGuidePage: TatolabWindowPage;
  /** What fills the window until Tatolab can run here: macOS's administrator setup, or Linux's installer. */
  setupScreen: TatolabWindowPage;
}

/** What every part of the React window reads: the backend, the platform, the status, and the hosted DOM pages. */
export interface TatolabWindowEnvironment {
  backend: TatolabBackend;
  platform: TatolabPlatform;
  statusStore: TatolabWindowStatusStore;
  hostedPages: TatolabWindowHostedPages;
  openSearch(): void;
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
