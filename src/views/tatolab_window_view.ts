import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import { FirstLaunchSetupView } from "./first_launch_setup_view";
import { SettingsPageView } from "./settings_page_view";
import { StreamsPageView } from "./streams_page_view";
import type { TatolabWindowPage } from "./tatolab_window_page";
import { WindowSidebarView, type TatolabWindowPageName } from "./window_sidebar_view";

/** Mounts the main window into `rootElement`; the answer shows each status the backend reports. */
export function mountTatolabWindow(rootElement: HTMLElement, backend: TatolabBackend): (status: TatolabStatus) => void {
  const streamsPage = new StreamsPageView(backend);
  const pages: Record<TatolabWindowPageName, TatolabWindowPage> = {
    streams: streamsPage,
    settings: new SettingsPageView(backend),
  };
  const firstLaunchSetup = new FirstLaunchSetupView(backend);
  const sidebar = new WindowSidebarView(showPage);
  const pageContainer = createElement("div", { class: "window-content" });
  const windowShell = createElement("div", { class: "tatolab-window" }, [sidebar.element, pageContainer]);
  let currentPageName: TatolabWindowPageName = "streams";
  let isShowingFirstLaunchSetup = false;

  function tellPagesWhichIsShown(): void {
    for (const [pageName, page] of Object.entries(pages)) {
      page.setPageShown?.(!isShowingFirstLaunchSetup && pageName === currentPageName);
    }
  }

  function showPage(pageName: TatolabWindowPageName): void {
    currentPageName = pageName;
    pageContainer.replaceChildren(pages[pageName].element);
    sidebar.setCurrentPage(pageName);
    tellPagesWhichIsShown();
  }

  /** Runs the ⌘-shortcut for `key`; false when `key` has none here. */
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
    if (isShowingFirstLaunchSetup || !keyboardEvent.metaKey || keyboardEvent.altKey || keyboardEvent.ctrlKey) return;
    if (runWindowShortcut(keyboardEvent.key)) keyboardEvent.preventDefault();
  });

  showPage(currentPageName);

  return (status) => {
    isShowingFirstLaunchSetup = status.machine_setup_state !== "complete";
    const shownElement = isShowingFirstLaunchSetup ? firstLaunchSetup.element : windowShell;
    if (rootElement.firstElementChild !== shownElement) rootElement.replaceChildren(shownElement);
    firstLaunchSetup.showStatus(status);
    sidebar.showStatus(status);
    for (const page of Object.values(pages)) page.showStatus(status);
    tellPagesWhichIsShown();
  };
}
