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
import { FirstLaunchSetupView } from "./first_launch_setup_view";
import { createFirstStreamGuide } from "./first_stream_guide_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { LinuxRuntimeInstallView } from "./linux_runtime_install_view";
import { SettingsPageView } from "./settings_page_view";
import { TooltipProvider } from "./shadcn/tooltip";
import type { StreamViewTab } from "./stream_detail_view";
import { StreamsPageView } from "./streams_page_view";
import { streamPagePath } from "./streams_list_page_view";
import { TatolabSearchView } from "./tatolab_search_view";
import {
  TatolabWindowEnvironmentContext,
  TatolabWindowStatusStore,
  useTatolabStatus,
  useTatolabWindowEnvironment,
  type TatolabWindowEnvironment,
  type TatolabWindowHostedPages,
} from "./tatolab_window_context";
import { isShowingAStreamPage, TATOLAB_WINDOW_ROUTES } from "./tatolab_window_shell";
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
  const navigateTo = (path: string) => {
    if (router.state.location.pathname !== path) void router.navigate(path);
  };
  const showSelectedStreamPage = () => {
    const selectedStream = streamsPage.selectedStream();
    if (selectedStream !== null) navigateTo(streamPagePath(selectedStream.name));
  };

  const streamsPage = new StreamsPageView(backend, platform, featureFlags);
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
      exposedPortsAlreadyRead: (streamName) => streamsPage.exposedPortsAlreadyRead(streamName),
    },
    {
      selectStream: (streamName) => {
        streamsPage.chooseStream(streamName);
        navigateTo(streamPagePath(streamName));
      },
      showExposedOutputInOverview: (streamName, outputPort) => {
        streamsPage.showExposedOutputInOverview(streamName, outputPort);
        navigateTo(streamPagePath(streamName));
      },
      watchOutput: (streamName, outputPort, exposureLevel) => {
        streamsPage.watchOutput(streamName, outputPort, exposureLevel);
        navigateTo(streamPagePath(streamName));
      },
      goToStreamTab: (tab) => {
        if (streamsPage.showTab(tab)) showSelectedStreamPage();
      },
      goToSettings: () => navigateTo("/settings"),
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
    const showStreamTab = (tab: StreamViewTab): boolean => {
      if (!streamsPage.showTab(tab)) return false;
      showSelectedStreamPage();
      return true;
    };
    switch (key) {
      case "k":
        search.toggle();
        return true;
      case ",":
        navigateTo("/settings");
        return true;
      case "1":
      case "2":
        return streamsPage.isSelectedStreamLoaded() && showStreamTab(key === "1" ? "graph" : "logs");
      case "3":
        return streamsPage.selectedStream() !== null && showStreamTab("overview");
      case "f":
        if (!streamsPage.focusLogFilter()) return false;
        showSelectedStreamPage();
        return true;
      case "ArrowUp":
      case "ArrowDown":
        if (!streamsPage.selectAdjacentStream(key === "ArrowUp" ? -1 : 1)) return false;
        showSelectedStreamPage();
        return true;
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    const latestStatus = statusStore?.readLatestStatus() ?? null;
    if (latestStatus === null || chooseTatolabWindowScreen(latestStatus) === "setup" || uninstallSheet.isOpen() || search.isOpen()) return;
    if (keyboardEvent.key === "Escape") {
      if (isOnAStreamPage() && streamsPage.closeWatch()) keyboardEvent.preventDefault();
      return;
    }
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
    const environment: TatolabWindowEnvironment = { backend, platform, statusStore: firstStatusStore, hostedPages, openSearch };
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
