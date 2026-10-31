import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { holdsWindowShortcutModifier } from "../presentation/platform_presentation";
import { chooseTatolabWindowScreen } from "../presentation/runtime_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { GettingStartedView } from "./getting_started_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { LinuxRuntimeInstallView } from "./linux_runtime_install_view";
import { ControlTooltipProvider } from "../design_system/control_tooltip";
import { readableExposedPorts } from "../presentation/stream_overview_presentation";
import { AddStreamFlowOfTheWindow } from "../add_stream_flow_of_the_window";
import { StreamGraphReadings } from "../stream_graph_readings";
import { ProjectLogReadings } from "../project_log_readings";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "../window_visibility";
import { isShowingAStreamPage, streamPagePath, streamPageTabShownAt, type StreamPageNavigationState, type StreamPageTab } from "./stream_page_path";
import { StreamsPageView } from "./streams_page_view";
import { TatolabSearchView } from "./tatolab_search_view";
import {
  TatolabWindowEnvironmentContext,
  TatolabWindowStatusStore,
  RefusalKeptForTheWindow,
  useTatolabStatus,
  useTatolabWindowEnvironment,
  type TatolabWindowEnvironment,
  type TatolabWindowHostedPages,
} from "./tatolab_window_context";
import { TATOLAB_WINDOW_ROUTES } from "./tatolab_window_shell";
import { RelayReadings } from "../relay_readings";
import { RuntimeDescriptionReadings } from "../runtime_description_reading";
import { SYSTEM_PREFERS_DARK_MEDIA_QUERY, WindowAppearanceChoice } from "../window_appearance";
import { UninstallSheetView } from "./uninstall_sheet_view";

type TatolabWindowRouter = ReturnType<typeof createMemoryRouter>;

/** The page's storage, or `null` where the page may not use it. */
function windowLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The shell and its pages, or what fills the window until Tatolab runs here: macOS's first run, or Linux's installer. */
function TatolabWindowRoot({ router, isUninstallUnderway }: { router: TatolabWindowRouter; isUninstallUnderway: () => boolean }) {
  const { hostedPages } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  if (!isUninstallUnderway() && chooseTatolabWindowScreen(status) === "setup") {
    return hostedPages.linuxRuntimeInstallScreen === null ? (
      <GettingStartedView />
    ) : (
      <HostedDomPageView hostedPage={hostedPages.linuxRuntimeInstallScreen} className="h-full" />
    );
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
    void navigateTo(streamPagePath(selectedStream.stream, tab), navigationState);
    return true;
  };

  const streamGraphReadings = new StreamGraphReadings(backend);
  const projectLogReadings = new ProjectLogReadings(backend);
  const runtimeDescriptionReadings = new RuntimeDescriptionReadings(backend);
  const relayReadings = new RelayReadings(backend);
  streamGraphReadings.setPollingAllowed(isTatolabWindowVisible());
  projectLogReadings.setPollingAllowed(isTatolabWindowVisible());
  runtimeDescriptionReadings.setPollingAllowed(isTatolabWindowVisible());
  relayReadings.setPollingAllowed(isTatolabWindowVisible());
  onTatolabWindowVisibilityChanged((isVisible) => {
    streamGraphReadings.setPollingAllowed(isVisible);
    projectLogReadings.setPollingAllowed(isVisible);
    runtimeDescriptionReadings.setPollingAllowed(isVisible);
    relayReadings.setPollingAllowed(isVisible);
  });
  const windowAppearance = new WindowAppearanceChoice(windowLocalStorage(), window.matchMedia(SYSTEM_PREFERS_DARK_MEDIA_QUERY), document.documentElement);
  const uninstallTatolabRefusal = new RefusalKeptForTheWindow();
  const firstRunFinishingRefusal = new RefusalKeptForTheWindow();
  backend.onStreamPageRequested((streamId) => void navigateTo(streamPagePath(streamId)));
  const addStreamFlow = new AddStreamFlowOfTheWindow(backend);
  const streamsPage = new StreamsPageView(backend);
  const uninstallSheet = new UninstallSheetView(backend, platform, (flowState) =>
    uninstallTatolabRefusal.showRefusalReason(flowState.phase === "closed" ? flowState.refusalReason : null),
  );
  const search = new TatolabSearchView(
    backend,
    platform,
    featureFlags,
    {
      listedStreams: () => streamsPage.listedStreamsForSearch(),
      selectedStream: () => (isOnAStreamPage() ? streamsPage.selectedStream() : null),
      machineName: () => streamsPage.machineName(),
      exposedPortsAlreadyRead: (streamId) => {
        const graph = streamGraphReadings.readingOf(streamId).graph;
        return graph === null ? null : readableExposedPorts(graph);
      },
    },
    {
      selectStream: (streamId) => void navigateTo(streamPagePath(streamId)),
      showExposedOutputInOverview: (streamId, outputPort) => void navigateTo(streamPagePath(streamId), { previewedOutput: outputPort }),
      watchOutput: (streamId, outputPort) => void navigateTo(streamPagePath(streamId, "graph"), { pinnedOutput: outputPort }),
      goToStreamTab: (tab) => {
        showTheShownStreamsTab(tab);
      },
      goToSettings: () => void navigateTo("/settings"),
    },
  );
  const hostedPages: TatolabWindowHostedPages = {
    streamsPage,
    linuxRuntimeInstallScreen: platform === "linux" ? new LinuxRuntimeInstallView() : null,
  };
  const openSearch = () => {
    if (!uninstallSheet.isOpen()) search.open();
  };
  let statusStore: TatolabWindowStatusStore | null = null;
  let runtimeStateLastShown: TatolabStatus["runtime_state"] | null = null;
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
        const adjacentStreamId = streamsPage.adjacentStreamId(key === "ArrowUp" ? -1 : 1);
        if (adjacentStreamId === null) return false;
        void navigateTo(streamPagePath(adjacentStreamId, streamPageTabShownAt(router.state.location.pathname) ?? "overview"));
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
    hostedPages.linuxRuntimeInstallScreen?.showStatus?.(status);
    streamsPage.setRuntimeLastAnsweredAt(runtimeLastAnsweredAt);
    streamsPage.showStatus(status);
    if (runtimeStateLastShown !== null && status.runtime_state !== runtimeStateLastShown) {
      runtimeDescriptionReadings.forgetAndReadAgainAsTheRuntimesStateChanged();
      relayReadings.forgetAndReadAgainAsTheRuntimesStateChanged();
    }
    runtimeStateLastShown = status.runtime_state;
  };
  const renderTheWindowOn = (firstStatusStore: TatolabWindowStatusStore) => {
    const environment: TatolabWindowEnvironment = {
      backend,
      platform,
      statusStore: firstStatusStore,
      streamGraphReadings,
      projectLogReadings,
      addStreamFlow,
      hostedPages,
      windowAppearance,
      runtimeDescriptionReadings,
      relayReadings,
      openUninstallSheet: () => uninstallSheet.open(),
      uninstallTatolabRefusal,
      firstRunFinishingRefusal,
      openSearch,
    };
    createRoot(rootElement).render(
      <StrictMode>
        <TatolabWindowEnvironmentContext value={environment}>
          <ControlTooltipProvider>
            <TatolabWindowRoot router={router} isUninstallUnderway={() => uninstallSheet.isUninstallUnderway()} />
          </ControlTooltipProvider>
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
