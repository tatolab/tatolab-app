import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged } from "../dom";
import { GEAR_ICON_SVG, MACHINE_ICON_SVG } from "../icons";
import { presentPlatform, windowDragRegionAttribute, type PlatformPresentation } from "../presentation/platform_presentation";
import { presentRuntimeStatus, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import type { StreamListView } from "./stream_list_view";
import { createFailureIcon, createIcon, createWindowShortcutCap } from "./window_controls";

/** The runtime's sentence under the machine's name: `Tatolab is running`, `Tatolab is off`, or the state's short label. */
function runtimeSentence(presentation: RuntimeDisplayPresentation): string {
  switch (presentation.displayState) {
    case "running":
      return "Tatolab is running";
    case "switched_off":
      return "Tatolab is off";
    default:
      return presentation.shortLabel;
  }
}

/** The window's sidebar: a strip under the traffic lights, this machine and its runtime, the streams, and Settings. */
export class WindowSidebarView {
  readonly element: HTMLElement;
  private readonly platformPresentation: PlatformPresentation;
  private readonly machineBlock: HTMLElement;
  private readonly machineNameLabel: HTMLElement;
  private readonly runtimeStateLine: HTMLElement;
  private readonly runtimeStateText: HTMLElement;
  private readonly runtimeFailureIcon: SVGElement;
  private readonly settingsRow: HTMLButtonElement;

  constructor(platform: TatolabPlatform, streamList: StreamListView, onSettingsChosen: () => void) {
    this.platformPresentation = presentPlatform(platform);
    this.machineNameLabel = createElement("span", { class: "machine-block-name selectable-text" });
    this.runtimeFailureIcon = createFailureIcon(14);
    this.runtimeStateText = createElement("span", {});
    this.runtimeStateLine = createElement("span", { class: "machine-block-runtime" }, [this.runtimeFailureIcon, this.runtimeStateText]);
    this.machineBlock = createElement("div", { class: "machine-block", role: "group" }, [
      createIcon(MACHINE_ICON_SVG, 16, "machine-block-icon"),
      this.machineNameLabel,
      this.runtimeStateLine,
    ]);
    this.settingsRow = createElement(
      "button",
      { type: "button", class: "sidebar-settings-row", onClick: onSettingsChosen, "aria-keyshortcuts": platform === "macos" ? "Meta+," : "Control+," },
      [
        createIcon(GEAR_ICON_SVG, 16, "sidebar-settings-icon"),
        createElement("span", { class: "sidebar-settings-label" }, ["Settings"]),
        createWindowShortcutCap(platform, ","),
      ],
    );
    this.element = createElement("nav", { class: "window-sidebar", "aria-label": "Tatolab" }, [
      createElement("div", {
        class: "window-sidebar-band-strip",
        "data-tauri-drag-region": windowDragRegionAttribute(platform, "self"),
      }),
      this.machineBlock,
      createElement("div", { class: "window-sidebar-sections" }, [streamList.element]),
      createElement("div", { class: "window-sidebar-footer" }, [this.settingsRow]),
    ]);
  }

  showStatus(status: TatolabStatus): void {
    const presentation = presentRuntimeStatus(status);
    setTextIfChanged(this.machineNameLabel, status.machine_name ?? this.platformPresentation.thisMachineAtSentenceStart);
    this.machineNameLabel.title = status.machine_name ?? "";
    this.machineNameLabel.dataset.font = status.machine_name === null ? "ui" : "mono";
    setTextIfChanged(this.runtimeStateText, runtimeSentence(presentation));
    const isFailure = presentation.tone === "error";
    this.runtimeStateLine.dataset.failure = String(isFailure);
    this.runtimeFailureIcon.toggleAttribute("hidden", !isFailure);
    this.machineBlock.setAttribute(
      "aria-label",
      `Runtime ${presentation.shortLabel.toLowerCase()} on ${status.machine_name ?? this.platformPresentation.thisMachineMidSentence}`,
    );
  }

  setSettingsSelected(isSelected: boolean): void {
    if (isSelected) this.settingsRow.setAttribute("aria-current", "page");
    else this.settingsRow.removeAttribute("aria-current");
  }
}
