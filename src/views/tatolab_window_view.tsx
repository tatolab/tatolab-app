// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { holdsWindowShortcutModifier } from "../presentation/platform_presentation";
import { chooseTatolabWindowScreen } from "../presentation/runtime_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { FirstLaunchSetupView } from "./first_launch_setup_view";
import { createFirstStreamGuide } from "./first_stream_guide_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { LinuxRuntimeInstallView } from "./linux_runtime_install_view";
import { SettingsPageView } from "./settings_page_view";
import { TooltipProvider } from "./shadcn/tooltip";
import { readableExposedPorts } from "../presentation/stream_overview_presentation";
import { StreamGraphReadings } from "../stream_graph_readings";
import { StreamLogReadings } from "../stream_log_readings";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "../window_visibility";
import { isShowingAStreamPage, streamPagePath, streamPageTabShownAt, type StreamPageNavigationState, type StreamPageTab } from "./stream_page_path";
import { StreamsPageView } from "./streams_page_view";
import { TatolabSearchView } from "./tatolab_search_view";
import {
  TatolabWindowEnvironmentContext,
  TatolabWindowStatusStore,
  useTatolabStatus,
  useTatolabWindowEnvironment,
  type TatolabWindowEnvironment,
  type TatolabWindowHostedPages,
} from "./tatolab_window_context";
import { TATOLAB_WINDOW_ROUTES } from "./tatolab_window_shell";
import { UninstallSheetView } from "./uninstall_sheet_view";

type TatolabWindowRouter = ReturnType<typeof createMemoryRouter>;

/** The shell and its pages, or the setup screen that fills the window until Tatolab can run here. */
function TatolabWindowRoot({ router, isUninstallUnderway }: { router: TatolabWindowRouter; isUninstallUnderway: () => boolean }) {
  const { hostedPages } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  if (!isUninstallUnderway() && chooseTatolabWindowScreen(status) === "setup") {
    return <HostedDomPageView hostedPage={hostedPages.setupScreen} className="h-full" />;
  }
  return <RouterProvider router={router} />;
}

/**
 * Mounts the main window, built for `platform` with `featureFlags`, into `rootElement`; the answer shows each status
 * the backend reports, first to every hosted DOM page, then to the React window, which renders on the first.
 */
export function mountTatolabWindow(
  rootElement: HTMLElement,
  backend: TatolabBackend,
  platform: TatolabPlatform,
  featureFlags: TatolabFrontendFeatureFlags,
): (status: TatolabStatus) => void {
  document.documentElement.dataset.platform = platform;
  const router = createMemoryRouter(TATOLAB_WINDOW_ROUTES);
  const isOnAStreamPage = () => isShowingAStreamPage(router.state.location.pathname);
  /** Navigates to `path` unless the router already shows it; settles once the router shows it. */
  const navigateTo = async (path: string, navigationState?: StreamPageNavigationState): Promise<void> => {
    if (router.state.location.pathname !== path || navigationState !== undefined) await router.navigate(path, { state: navigationState });
  };
  /** Shows `tab` of the stream whose page shows; false off a stream page, or on Graph of a stream not loaded. */
  const showTheShownStreamsTab = (tab: StreamPageTab, navigationState?: StreamPageNavigationState): boolean => {
    const selectedStream = isOnAStreamPage() ? streamsPage.selectedStream() : null;
    if (selectedStream === null || (tab === "graph" && !isStreamLoaded(selectedStream))) return false;
    void navigateTo(streamPagePath(selectedStream.name, tab), navigationState);
    return true;
  };

  const streamGraphReadings = new StreamGraphReadings(backend);
  const streamLogReadings = new StreamLogReadings(backend, (streamName, streamInstance) => streamGraphReadings.rememberStreamInstance(streamName, streamInstance));
  streamGraphReadings.setPollingAllowed(isTatolabWindowVisible());
  streamLogReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => {
    streamGraphReadings.setPollingAllowed(isVisible);
    streamLogReadings.setPollingAllowed(isVisible);
  });
  const streamsPage = new StreamsPageView(backend);
  const uninstallSheet = new UninstallSheetView(backend, platform, (flowState) =>
    settingsPage.showUninstallTatolabRefusal(flowState.phase === "closed" ? flowState.refusalReason : null),
  );
  const settingsPage = new SettingsPageView(backend, platform, () => uninstallSheet.open());
  const search = new TatolabSearchView(
    backend,
    platform,
    featureFlags,
    {
      listedStreams: () => streamsPage.listedStreamsForSearch(),
      selectedStream: () => (isOnAStreamPage() ? streamsPage.selectedStream() : null),
      machineName: () => streamsPage.machineName(),
      exposedPortsAlreadyRead: (streamName) => {
        const graph = streamGraphReadings.readingOf(streamName).graph;
        return graph === null ? null : readableExposedPorts(graph);
      },
    },
    {
      selectStream: (streamName) => void navigateTo(streamPagePath(streamName)),
      showExposedOutputInOverview: (streamName, outputPort) => void navigateTo(streamPagePath(streamName), { previewedOutput: outputPort }),
      watchOutput: (streamName, outputPort) => void navigateTo(streamPagePath(streamName, "graph"), { pinnedOutput: outputPort }),
      goToStreamTab: (tab) => {
        showTheShownStreamsTab(tab);
      },
      goToSettings: () => void navigateTo("/settings"),
    },
  );
  const hostedPages: TatolabWindowHostedPages = {
    streamsPage,
    settingsPage,
    firstStreamGuidePage: { element: createFirstStreamGuide() },
    setupScreen: platform === "linux" ? new LinuxRuntimeInstallView() : new FirstLaunchSetupView(backend),
  };
  const openSearch = () => {
    if (!uninstallSheet.isOpen()) search.open();
  };
  let statusStore: TatolabWindowStatusStore | null = null;
  let runtimeLastAnsweredAt: Date | null = null;

  /** Runs the window shortcut for `key`, held with ⌘ on macOS and Ctrl on Linux; false when `key` has none here. */
  function runWindowShortcut(key: string): boolean {
    switch (key) {
      case "k":
        search.toggle();
        return true;
      case ",":
        void navigateTo("/settings");
        return true;
      case "1":
        return showTheShownStreamsTab("graph");
      case "2":
        return showTheShownStreamsTab("logs");
      case "3":
        return showTheShownStreamsTab("overview");
      case "f": {
        const selectedStream = isOnAStreamPage() ? streamsPage.selectedStream() : null;
        if (selectedStream === null || !isStreamLoaded(selectedStream)) return false;
        return showTheShownStreamsTab("logs", { askedLogView: "search_focused" });
      }
      case "ArrowUp":
      case "ArrowDown": {
        if (!isOnAStreamPage()) return false;
        const adjacentStreamName = streamsPage.adjacentStreamName(key === "ArrowUp" ? -1 : 1);
        if (adjacentStreamName === null) return false;
        void navigateTo(streamPagePath(adjacentStreamName, streamPageTabShownAt(router.state.location.pathname) ?? "overview"));
        return true;
      }
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    const latestStatus = statusStore?.readLatestStatus() ?? null;
    if (latestStatus === null || chooseTatolabWindowScreen(latestStatus) === "setup" || uninstallSheet.isOpen() || search.isOpen()) return;
    if (!holdsWindowShortcutModifier(platform, keyboardEvent)) return;
    const key = keyboardEvent.key.length === 1 ? keyboardEvent.key.toLowerCase() : keyboardEvent.key;
    if (runWindowShortcut(key)) keyboardEvent.preventDefault();
  });

  document.body.append(uninstallSheet.element, search.element);

  const showStatusOnTheHostedPages = (status: TatolabStatus) => {
    if (status.runtime_state === "running") runtimeLastAnsweredAt = new Date();
    if (!uninstallSheet.isUninstallUnderway() && chooseTatolabWindowScreen(status) === "setup") search.close();
    hostedPages.setupScreen.showStatus?.(status);
    streamsPage.setRuntimeLastAnsweredAt(runtimeLastAnsweredAt);
    streamsPage.showStatus(status);
    settingsPage.showStatus(status);
  };
  const renderTheWindowOn = (firstStatusStore: TatolabWindowStatusStore) => {
    const environment: TatolabWindowEnvironment = { backend, platform, statusStore: firstStatusStore, streamGraphReadings, streamLogReadings, hostedPages, openSearch };
    createRoot(rootElement).render(
      <StrictMode>
        <TatolabWindowEnvironmentContext value={environment}>
          <TooltipProvider>
            <TatolabWindowRoot router={router} isUninstallUnderway={() => uninstallSheet.isUninstallUnderway()} />
          </TooltipProvider>
        </TatolabWindowEnvironmentContext>
      </StrictMode>,
    );
  };

  return (status) => {
    showStatusOnTheHostedPages(status);
    if (statusStore === null) {
      statusStore = new TatolabWindowStatusStore(status);
      renderTheWindowOn(statusStore);
    } else {
      statusStore.publishStatus(status);
    }
  };
}
