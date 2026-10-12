import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { SETTINGS_NAVIGATION_ICON_SVG, STREAMS_NAVIGATION_ICON_SVG, TATOLAB_OUTLINED_MARK_SVG } from "../icons";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";

/** The pages the sidebar navigates between. */
export type TatolabWindowPageName = "streams" | "settings";

/** The window's sidebar: the mark, the two pages, and the runtime's state with this Mac's name. */
export class WindowSidebarView {
  readonly element: HTMLElement;
  private readonly navigationButtons: Record<TatolabWindowPageName, HTMLButtonElement>;
  private readonly streamCountBadge: HTMLElement;
  private readonly runtimePill: HTMLButtonElement;
  private readonly runtimePillDot: HTMLElement;
  private readonly runtimePillStateLabel: HTMLElement;
  private readonly runtimePillMachineName: HTMLElement;

  constructor(onNavigate: (pageName: TatolabWindowPageName) => void) {
    this.streamCountBadge = createElement("span", { class: "window-sidebar-count-badge", hidden: true });
    this.navigationButtons = {
      streams: createElement(
        "button",
        { type: "button", class: "window-sidebar-navigation-item", onClick: () => onNavigate("streams") },
        [createSvgFromMarkup(STREAMS_NAVIGATION_ICON_SVG), createElement("span", {}, ["Streams"]), this.streamCountBadge],
      ),
      settings: createElement(
        "button",
        { type: "button", class: "window-sidebar-navigation-item", onClick: () => onNavigate("settings") },
        [createSvgFromMarkup(SETTINGS_NAVIGATION_ICON_SVG), createElement("span", {}, ["Settings"])],
      ),
    };

    this.runtimePillDot = createElement("span", { class: "status-dot", "aria-hidden": "true" });
    this.runtimePillStateLabel = createElement("span", { class: "window-sidebar-runtime-pill-state" });
    this.runtimePillMachineName = createElement("span", { class: "window-sidebar-runtime-pill-machine" });
    this.runtimePill = createElement(
      "button",
      { type: "button", class: "window-sidebar-runtime-pill", onClick: () => onNavigate("streams") },
      [
        this.runtimePillDot,
        createElement("span", { class: "window-sidebar-runtime-pill-copy" }, [
          this.runtimePillStateLabel,
          this.runtimePillMachineName,
        ]),
      ],
    );

    this.element = createElement("nav", { class: "window-sidebar", "aria-label": "Tatolab" }, [
      createElement("div", { class: "window-sidebar-traffic-light-band", "data-tauri-drag-region": "" }),
      createElement("div", { class: "window-sidebar-brand", "data-tauri-drag-region": "deep" }, [
        createSvgFromMarkup(TATOLAB_OUTLINED_MARK_SVG),
        createElement("span", { class: "window-sidebar-wordmark" }, ["Tatolab"]),
      ]),
      createElement("div", { class: "window-sidebar-navigation" }, [
        this.navigationButtons.streams,
        this.navigationButtons.settings,
      ]),
      createElement("div", { class: "window-sidebar-spacer", "data-tauri-drag-region": "" }),
      this.runtimePill,
    ]);
  }

  setCurrentPage(currentPageName: TatolabWindowPageName): void {
    for (const [pageName, navigationButton] of Object.entries(this.navigationButtons)) {
      const isCurrentPage = pageName === currentPageName;
      navigationButton.classList.toggle("window-sidebar-navigation-item-current", isCurrentPage);
      if (isCurrentPage) navigationButton.setAttribute("aria-current", "page");
      else navigationButton.removeAttribute("aria-current");
    }
  }

  showStatus(status: TatolabStatus): void {
    const presentation = presentRuntimeStatus(status);
    const listedStreamCount = presentation.displayState === "running" ? (status.streams?.length ?? null) : null;
    this.streamCountBadge.hidden = listedStreamCount === null;
    setTextIfChanged(this.streamCountBadge, listedStreamCount === null ? "" : String(listedStreamCount));
    this.streamCountBadge.dataset.anyFailed = String(status.streams?.some((stream) => stream.state === "failed") ?? false);

    this.runtimePill.dataset.tone = presentation.tone;
    this.runtimePillDot.dataset.tone = presentation.tone;
    this.runtimePillDot.classList.toggle("status-dot-live", presentation.displayState === "running");
    this.runtimePillDot.classList.toggle("status-dot-breathing", presentation.displayState === "starting");
    setTextIfChanged(this.runtimePillStateLabel, presentation.shortLabel);
    setTextIfChanged(this.runtimePillMachineName, status.machine_name ?? "This Mac");
    this.runtimePillMachineName.dataset.machineNameKnown = String(status.machine_name !== null);
    this.runtimePill.setAttribute("aria-label", `Runtime ${presentation.shortLabel.toLowerCase()} on ${status.machine_name ?? "this Mac"}`);
  }
}
