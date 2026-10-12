import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import { holdsWindowShortcutModifier } from "../presentation/platform_presentation";
import { chooseTatolabWindowScreen } from "../presentation/runtime_presentation";
import { FirstLaunchSetupView } from "./first_launch_setup_view";
import { LinuxRuntimeInstallView } from "./linux_runtime_install_view";
import { SettingsPageView } from "./settings_page_view";
import { StreamsPageView } from "./streams_page_view";
import type { TatolabWindowPage } from "./tatolab_window_page";
import { WindowSidebarView, type TatolabWindowPageName } from "./window_sidebar_view";

/** What fills the window until Tatolab can run here: macOS's administrator setup, or Linux's installer. */
interface PlatformSetupScreen {
  readonly element: HTMLElement;
  showStatus?(status: TatolabStatus): void;
}

/** Mounts the main window, built for `platform`, into `rootElement`; the answer shows each status the backend reports. */
export function mountTatolabWindow(
  rootElement: HTMLElement,
  backend: TatolabBackend,
  platform: TatolabPlatform,
): (status: TatolabStatus) => void {
  document.documentElement.dataset.platform = platform;
  const streamsPage = new StreamsPageView(backend, platform);
  const settingsPage = new SettingsPageView(backend, platform);
  const pages: Record<TatolabWindowPageName, TatolabWindowPage> = { streams: streamsPage, settings: settingsPage };
  const setupScreen: PlatformSetupScreen =
    platform === "linux" ? new LinuxRuntimeInstallView() : new FirstLaunchSetupView(backend);
  const sidebar = new WindowSidebarView(showPage, platform);
  const pageContainer = createElement("div", { class: "window-content" });
  const windowShell = createElement("div", { class: "tatolab-window" }, [sidebar.element, pageContainer]);
  let currentPageName: TatolabWindowPageName = "streams";
  let isShowingSetupScreen = false;

  function tellPagesWhichIsShown(): void {
    for (const [pageName, page] of Object.entries(pages)) {
      page.setPageShown?.(!isShowingSetupScreen && pageName === currentPageName);
    }
  }

  function showPage(pageName: TatolabWindowPageName): void {
    currentPageName = pageName;
    pageContainer.replaceChildren(pages[pageName].element);
    sidebar.setCurrentPage(pageName);
    tellPagesWhichIsShown();
  }

  /** Runs the window shortcut for `key`, held with ⌘ on macOS and Ctrl on Linux; false when `key` has none here. */
  function runWindowShortcut(key: string): boolean {
    switch (key) {
      case "1":
        showPage("streams");
        return true;
      case "2":
      case ",":
        showPage("settings");
        return true;
      case "f":
        return currentPageName === "streams" && streamsPage.focusLogFilter();
      default:
        return false;
    }
  }

  document.addEventListener("keydown", (keyboardEvent) => {
    if (isShowingSetupScreen || !holdsWindowShortcutModifier(platform, keyboardEvent)) return;
    if (runWindowShortcut(keyboardEvent.key)) keyboardEvent.preventDefault();
  });

  showPage(currentPageName);

  return (status) => {
    isShowingSetupScreen = chooseTatolabWindowScreen(status) === "setup";
    const shownElement = isShowingSetupScreen ? setupScreen.element : windowShell;
    if (rootElement.firstElementChild !== shownElement) rootElement.replaceChildren(shownElement);
    setupScreen.showStatus?.(status);
    sidebar.showStatus(status);
    for (const page of Object.values(pages)) page.showStatus(status);
    tellPagesWhichIsShown();
  };
}
