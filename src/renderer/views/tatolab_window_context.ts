import { createContext, useContext, useSyncExternalStore } from "react";
import type { AddStreamFlowOfTheWindow, OpenAddStreamDialog } from "../add_stream_flow_of_the_window";
import type { ProjectReload, ProjectReloadsOfTheWindow } from "../project_reloads_of_the_window";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type { AddStreamFlowState, AddStreamRunNotice } from "../presentation/add_stream_flow";
import type { RuntimeDescriptionReading } from "../presentation/settings_presentation";
import type { RelaysReading } from "../presentation/relays_presentation";
import type { RelayReadings } from "../relay_readings";
import type { RuntimeDescriptionReadings } from "../runtime_description_reading";
import type { WindowAppearance, WindowAppearanceChoice, WindowTheme } from "../window_appearance";
import type { StreamGraphReading, StreamGraphReadings } from "../stream_graph_readings";
import type { ProjectLogReading, ProjectLogReadings, ProjectLogScope } from "../project_log_readings";
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

/** The DOM pages the window keeps until later tickets rebuild them in React. */
export interface TatolabWindowHostedPages {
  streamsPage: StreamsPageView;
  /** What fills the Linux window while tatolabd.service is missing and the app is not installing it; `null` on macOS, whose first run is the React getting-started view. */
  linuxRuntimeInstallScreen: TatolabWindowPage | null;
}

/** What every part of the React window reads: the backend, the platform, the status, the shown stream's graph, the shown project log, the hosted DOM pages, the window's look, the runtime's description and uninstalling. */
export interface TatolabWindowEnvironment {
  backend: TatolabBackend;
  platform: TatolabPlatform;
  statusStore: TatolabWindowStatusStore;
  streamGraphReadings: StreamGraphReadings;
  projectLogReadings: ProjectLogReadings;
  /** Adding a stream, held by the window so a run outlives the page that started it. */
  addStreamFlow: AddStreamFlowOfTheWindow;
  /** Each project's last Reload, held by the window so a reload is followed to its end wherever the person goes. */
  projectReloads: ProjectReloadsOfTheWindow;
  hostedPages: TatolabWindowHostedPages;
  /** The person's choice of light, dark or the system's look, which the title bar and Settings › Appearance both change. */
  windowAppearance: WindowAppearanceChoice;
  /** The runtime's version, uptime and log folder, read while Settings shows them. */
  runtimeDescriptionReadings: RuntimeDescriptionReadings;
  /** The runtime's relays and its relay-adapter catalog, read while Settings › Relays shows them, and the changes made to them. */
  relayReadings: RelayReadings;
  /** Open the sheet "Uninstall Tatolab…" asks to confirm in. */
  openUninstallSheet(): void;
  /** Why the last uninstall was refused, which Settings shows under Uninstall Tatolab…, until the sheet opens again. */
  uninstallTatolabRefusal: RefusalKeptForTheWindow;
  /** Why Get Started could not be remembered, which a notice shows over the Streams list once first run is over. */
  firstRunFinishingRefusal: RefusalKeptForTheWindow;
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

/** What the window knows of `streamId`'s graph, re-rendering the caller on each change. */
export function useStreamGraphReading(streamId: string): StreamGraphReading {
  const { streamGraphReadings } = useTatolabWindowEnvironment();
  return useSyncExternalStore(streamGraphReadings.subscribeToReadings, () => streamGraphReadings.readingOf(streamId));
}

/** What the window holds of the project log in `scope`, re-rendering the caller on each change. */
export function useProjectLogReading(scope: ProjectLogScope): ProjectLogReading {
  const { projectLogReadings } = useTatolabWindowEnvironment();
  return useSyncExternalStore(projectLogReadings.subscribeToReadings, () => projectLogReadings.readingOf(scope));
}

/** The Add stream flow, re-rendering the caller on each change. */
export function useAddStreamFlowState(): AddStreamFlowState {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  return useSyncExternalStore(addStreamFlow.subscribeToFlow, addStreamFlow.readFlowState);
}

/** `projectDirectory`'s last Reload, `null` for none, re-rendering the caller on each change. */
export function useProjectReload(projectDirectory: string): ProjectReload | null {
  const { projectReloads } = useTatolabWindowEnvironment();
  return useSyncExternalStore(projectReloads.subscribeToReloads, () => projectReloads.readReloadOf(projectDirectory));
}

/** The New project or Import project dialog while it is open, `null` while closed, re-rendering the caller on each change. */
export function useOpenAddStreamDialog(): OpenAddStreamDialog | null {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  return useSyncExternalStore(addStreamFlow.subscribeToFlow, addStreamFlow.readOpenDialog);
}

/** What the last run that answered while the add-stream dialog was closed came to, re-rendering the caller on each change. */
export function useAddStreamRunNotice(): AddStreamRunNotice | null {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  return useSyncExternalStore(addStreamFlow.subscribeToFlow, addStreamFlow.readRunNotice);
}

/** The person's choice of look and the theme it shows, re-rendering the caller on each change. */
export function useWindowAppearance(): { chosenAppearance: WindowAppearance; shownTheme: WindowTheme; chooseAppearance: (appearance: WindowAppearance) => void } {
  const { windowAppearance } = useTatolabWindowEnvironment();
  const chosenAppearance = useSyncExternalStore(windowAppearance.subscribeToAppearance, windowAppearance.readChosenAppearance);
  const shownTheme = useSyncExternalStore(windowAppearance.subscribeToAppearance, windowAppearance.readShownTheme);
  return { chosenAppearance, shownTheme, chooseAppearance: (appearance) => windowAppearance.choose(appearance) };
}

/** What the runtime last said of itself, read while the caller is shown, re-rendering it on each change. */
export function useRuntimeDescriptionReading(): RuntimeDescriptionReading {
  const { runtimeDescriptionReadings } = useTatolabWindowEnvironment();
  return useSyncExternalStore(runtimeDescriptionReadings.subscribeToReading, runtimeDescriptionReadings.readLatestReading);
}

/** What the window holds of the runtime's relays, re-rendering the caller on each change and reading them while it shows them. */
export function useRelaysReading(): RelaysReading {
  const { relayReadings } = useTatolabWindowEnvironment();
  return useSyncExternalStore(relayReadings.subscribeToReading, relayReadings.readLatestReading);
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
