import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { holdsWindowShortcutModifier } from "../presentation/platform_presentation";
import { chooseTatolabWindowScreen } from "../presentation/runtime_presentation";
import { FirstLaunchSetupView } from "./first_launch_setup_view";
import { LinuxRuntimeInstallView } from "./linux_runtime_install_view";
import { SettingsPageView } from "./settings_page_view";
import { StreamsPageView } from "./streams_page_view";
import { TatolabSearchView } from "./tatolab_search_view";
import type { TatolabWindowPage } from "./tatolab_window_page";
import { UninstallSheetView } from "./uninstall_sheet_view";
import { WindowSidebarView } from "./window_sidebar_view";

/** The pages the content beside the sidebar shows. */
type TatolabWindowPageName = "streams" | "settings";

/** What fills the window until Tatolab can run here: macOS's administrator setup, or Linux's installer. */
interface PlatformSetupScreen {
  readonly element: HTMLElement;
  showStatus?(status: TatolabStatus): void;
}

/**
 * Mounts the main window, built for `platform` with `featureFlags`, into `rootElement`; the answer shows each status
 * the backend reports.
 */
export function mountTatolabWindow(
  rootElement: HTMLElement,
  backend: TatolabBackend,
  platform: TatolabPlatform,
  featureFlags: TatolabFrontendFeatureFlags,
): (status: TatolabStatus) => void {
  document.documentElement.dataset.platform = platform;
  const openSearch = () => {
    if (!uninstallSheet.isOpen()) search.open();
  };
  const streamsPage = new StreamsPageView(backend, platform, featureFlags, {
    onStreamChosen: () => showPage("streams"),
    onOpenSearch: openSearch,
  });
  const settingsPage = new SettingsPageView(backend, platform, () => uninstallSheet.open(), openSearch);
  const uninstallSheet = new UninstallSheetView(backend, platform, (flowState) =>
    settingsPage.showUninstallTatolabRefusal(flowState.phase === "closed" ? flowState.refusalReason : null),
  );
  const search = new TatolabSearchView(
    backend,
    platform,
    featureFlags,
    {
      listedStreams: () => streamsPage.listedStreamsForSearch(),
      selectedStream: () => (currentPageName === "streams" ? streamsPage.selectedStream() : null),
      machineName: () => streamsPage.machineName(),
      exposedPortsAlreadyRead: (streamName) => streamsPage.exposedPortsAlreadyRead(streamName),
    },
    {
      selectStream: (streamName) => {
        showPage("streams");
        streamsPage.chooseStream(streamName);
      },
      showExposedOutputInOverview: (streamName, outputPort) => {
        showPage("streams");
        streamsPage.showExposedOutputInOverview(streamName, outputPort);
      },
      watchOutput: (streamName, outputPort, exposureLevel) => {
        showPage("streams");
        streamsPage.watchOutput(streamName, outputPort, exposureLevel);
      },
      goToStreamTab: (tab) => {
        showPage("streams");
        streamsPage.showTab(tab);
      },
      goToSettings: () => showPage("settings"),
    },
  );
  const pages: Record<TatolabWindowPageName, TatolabWindowPage> = { streams: streamsPage, settings: settingsPage };
  const setupScreen: PlatformSetupScreen = platform === "linux" ? new LinuxRuntimeInstallView() : new FirstLaunchSetupView(backend);
  const sidebar = new WindowSidebarView(platform, streamsPage.streamList, () => showPage("settings"));
  const pageContainer = createElement("main", { class: "window-content" });
  const windowShell = createElement("div", { class: "tatolab-window" }, [sidebar.element, pageContainer]);
  let currentPageName: TatolabWindowPageName = "streams";
  let isShowingSetupScreen = false;
  let runtimeLastAnsweredAt: Date | null = null;

  function tellPagesWhichIsShown(): void {
    for (const [pageName, page] of Object.entries(pages)) {
      page.setPageShown?.(!isShowingSetupScreen && pageName === currentPageName);
    }
  }

  function showPage(pageName: TatolabWindowPageName): void {
    if (currentPageName === pageName && pageContainer.firstElementChild === pages[pageName].element) return;
    currentPageName = pageName;
    pageContainer.replaceChildren(pages[pageName].element);
    sidebar.setSettingsSelected(pageName === "settings");
    tellPagesWhichIsShown();
  }

  /** Runs the window shortcut for `key`, held with ⌘ on macOS and Ctrl on Linux; false when `key` has none here. */
  function runWindowShortcut(key: string): boolean {
    switch (key) {
      case "k":
        search.toggle();
        return true;
      case ",":
        showPage("settings");
        return true;
      case "1":
      case "2":
        if (!streamsPage.isSelectedStreamLoaded()) return false;
        showPage("streams");
        return streamsPage.showTab(key === "1" ? "graph" : "logs");
      case "3":
        if (streamsPage.selectedStream() === null) return false;
        showPage("streams");
        return streamsPage.showTab("overview");
      case "f":
        if (!streamsPage.isSelectedStreamLoaded()) return false;
        showPage("streams");
        return streamsPage.focusLogFilter();
      case "ArrowUp":
      case "ArrowDown":
        showPage("streams");
        return streamsPage.selectAdjacentStream(key === "ArrowUp" ? -1 : 1);
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    if (isShowingSetupScreen || uninstallSheet.isOpen() || search.isOpen()) return;
    if (keyboardEvent.key === "Escape") {
      if (currentPageName === "streams" && streamsPage.closeWatch()) keyboardEvent.preventDefault();
      return;
    }
    if (!holdsWindowShortcutModifier(platform, keyboardEvent)) return;
    const key = keyboardEvent.key.length === 1 ? keyboardEvent.key.toLowerCase() : keyboardEvent.key;
    if (runWindowShortcut(key)) keyboardEvent.preventDefault();
  });

  document.body.append(uninstallSheet.element, search.element);
  showPage(currentPageName);

  return (status) => {
    if (status.runtime_state === "running") runtimeLastAnsweredAt = new Date();
    isShowingSetupScreen = !uninstallSheet.isUninstallUnderway() && chooseTatolabWindowScreen(status) === "setup";
    if (isShowingSetupScreen) search.close();
    const shownElement = isShowingSetupScreen ? setupScreen.element : windowShell;
    if (rootElement.firstElementChild !== shownElement) rootElement.replaceChildren(shownElement);
    setupScreen.showStatus?.(status);
    sidebar.showStatus(status);
    streamsPage.setRuntimeLastAnsweredAt(runtimeLastAnsweredAt);
    for (const page of Object.values(pages)) page.showStatus(status);
    tellPagesWhichIsShown();
  };
}
