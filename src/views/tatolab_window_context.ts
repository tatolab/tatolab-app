// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createContext, useContext, useSyncExternalStore } from "react";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import type { SettingsPageView } from "./settings_page_view";
import type { StreamsPageView } from "./streams_page_view";

/** A DOM page built once for the window's life, which a React route hosts while it is shown. */
export interface HostedDomPage {
  readonly element: HTMLElement;
  /** Told when the page is shown or hidden, for a page that polls while it shows. */
  setPageShown?(isShown: boolean): void;
}

/** What fills the window until Tatolab can run here: macOS's administrator setup, or Linux's installer. */
export interface HostedSetupScreen extends HostedDomPage {
  showStatus?(status: TatolabStatus): void;
}

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
  firstStreamGuidePage: HostedDomPage;
  setupScreen: HostedSetupScreen;
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
