// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged, type ElementChild } from "../dom";
import {
  presentCommandLineTool,
  presentPlatform,
  windowDragRegionAttribute,
  type PlatformPresentation,
} from "../presentation/platform_presentation";
import { createCopyButton } from "./copy_button";
import type { TatolabWindowPage } from "./tatolab_window_page";
import { createFailureLine, createSearchButton } from "./window_controls";

function createSettingsRow(textChildren: ElementChild[], controlChildren: ElementChild[], failureLine: HTMLElement | null = null): HTMLDivElement {
  return createElement("div", { class: "settings-row" }, [
    createElement("div", { class: "settings-row-text" }, textChildren),
    createElement("div", { class: "settings-row-control" }, controlChildren),
    failureLine,
  ]);
}

function createSettingsGroup(groupTitle: string, rows: ElementChild[]): HTMLElement {
  const groupTitleId = `settings-group-${groupTitle.toLowerCase().replace(/\s+/g, "-")}`;
  return createElement("section", { class: "settings-group", "aria-labelledby": groupTitleId }, [
    createElement("h2", { class: "settings-group-title", id: groupTitleId }, [groupTitle]),
    createElement("div", { class: "well settings-group-rows" }, rows),
  ]);
}

/** Run Tatolab, Login Items on macOS, the `tatolab` command, the version and machine, quitting, and uninstalling. */
export class SettingsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly platformPresentation: PlatformPresentation;
  private readonly runTatolabSwitch: HTMLButtonElement;
  private readonly runTatolabFailure = createFailureLine();
  private readonly loginItemsDescription: HTMLElement | null;
  private readonly commandLineToolDescription: HTMLElement;
  private readonly commandLineToolValue: HTMLElement;
  private readonly commandLineToolCopyButton: HTMLButtonElement;
  private readonly machineNameRow: HTMLElement;
  private readonly machineNameValue: HTMLElement;
  private readonly appVersionValue: HTMLElement;
  private readonly uninstallTatolabRefusal = createFailureLine();
  private latestStatus: TatolabStatus | null = null;
  private statusesShownCount = 0;
  private isRunTatolabSwitching = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
    onUninstallTatolabRequested: () => void,
    onOpenSearch: () => void,
  ) {
    this.platformPresentation = presentPlatform(platform);
    this.runTatolabSwitch = createElement("button", {
      type: "button",
      role: "switch",
      class: "toggle-switch",
      id: "run-tatolab-switch",
      "aria-checked": "false",
      "aria-labelledby": "run-tatolab-title",
      "aria-describedby": "run-tatolab-description",
      onClick: () => this.onRunTatolabSwitched(),
    });
    this.loginItemsDescription = this.platformPresentation.showsLoginItems
      ? createElement("p", { class: "settings-row-description" })
      : null;
    this.commandLineToolDescription = createElement("p", { class: "settings-row-description" });
    this.commandLineToolValue = createElement("code", { class: "settings-row-value selectable-text" });
    this.commandLineToolCopyButton = createCopyButton("the tatolab command's path", () => this.latestStatus?.command_line_tool_linked_at ?? "");
    this.machineNameValue = createElement("code", { class: "settings-row-value selectable-text" });
    this.appVersionValue = createElement("span", { class: "settings-row-value selectable-text" });
    this.machineNameRow = createSettingsRow(
      [createElement("p", { class: "settings-row-title" }, [this.platformPresentation.thisMachineAtSentenceStart])],
      [this.machineNameValue],
    );
    const streamRecordsDirectory = this.platformPresentation.streamRecordsDirectory;

    this.element = createElement("section", { class: "window-page settings-page", "aria-labelledby": "settings-page-title" }, [
      createElement("header", { class: "content-band", "data-tauri-drag-region": windowDragRegionAttribute(platform, "deep") }, [
        createElement("div", { class: "content-band-title" }, [
          createElement("h1", { class: "content-band-page-name", id: "settings-page-title" }, ["Settings"]),
        ]),
        createElement("div", { class: "content-band-tabs" }),
        createElement("div", { class: "content-band-spacer" }),
        createElement("div", { class: "band-actions", "data-slot": "stream-actions" }),
        createSearchButton(platform, onOpenSearch),
      ]),
      createElement("div", { class: "settings-scroller" }, [
        createElement("div", { class: "settings-column" }, [
          createSettingsGroup("Runtime", [
            createSettingsRow(
              [
                createElement("p", { class: "settings-row-title", id: "run-tatolab-title" }, ["Run Tatolab"]),
                createElement("p", { class: "settings-row-description", id: "run-tatolab-description" }, [
                  this.platformPresentation.runTatolabExplanation,
                ]),
              ],
              [this.runTatolabSwitch],
              this.runTatolabFailure.element,
            ),
            this.loginItemsDescription &&
              createSettingsRow(
                [createElement("p", { class: "settings-row-title" }, ["Login Items"]), this.loginItemsDescription],
                [
                  createElement("button", { type: "button", class: "button", onClick: () => void backend.openLoginItemsSettings() }, [
                    "Open Login Items…",
                  ]),
                ],
              ),
          ]),
          createSettingsGroup("Command line", [
            createSettingsRow(
              [
                createElement("p", { class: "settings-row-title" }, ["The ", createElement("code", {}, ["tatolab"]), " command"]),
                this.commandLineToolDescription,
              ],
              [this.commandLineToolValue, this.commandLineToolCopyButton],
            ),
          ]),
          createSettingsGroup("About", [
            createSettingsRow([createElement("p", { class: "settings-row-title" }, ["Version"])], [this.appVersionValue]),
            this.machineNameRow,
            createSettingsRow(
              [createElement("p", { class: "settings-row-title" }, ["Stream records"])],
              [
                createElement("code", { class: "settings-row-value selectable-text" }, [streamRecordsDirectory]),
                createCopyButton("the stream records' folder", () => streamRecordsDirectory),
              ],
            ),
          ]),
          createSettingsGroup("Quit or uninstall", [
            createSettingsRow(
              [
                createElement("p", { class: "settings-row-title" }, ["Quit Tatolab"]),
                createElement("p", { class: "settings-row-description" }, [this.platformPresentation.quitTatolabExplanation]),
              ],
              [createElement("button", { type: "button", class: "button", onClick: () => void backend.quitTatolabApp() }, ["Quit Tatolab"])],
            ),
            createSettingsRow(
              [
                createElement("p", { class: "settings-row-title" }, ["Uninstall Tatolab"]),
                createElement("p", { class: "settings-row-description" }, [this.platformPresentation.uninstallTatolabExplanation]),
              ],
              [
                createElement(
                  "button",
                  { type: "button", class: "button button-destructive", "data-action": "uninstall", onClick: onUninstallTatolabRequested },
                  ["Uninstall Tatolab…"],
                ),
              ],
              this.uninstallTatolabRefusal.element,
            ),
          ]),
        ]),
      ]),
    ]);
  }

  showStatus(status: TatolabStatus): void {
    this.latestStatus = status;
    this.statusesShownCount += 1;
    if (!this.isRunTatolabSwitching) this.showRunTatolab(status.run_tatolab);
    if (this.loginItemsDescription) {
      setTextIfChanged(
        this.loginItemsDescription,
        status.runtime_agent === "requires_approval"
          ? "Tatolab is waiting for you to switch it on under Allow in the Background."
          : "Tatolab is listed under Allow in the Background. Run Tatolab and that entry are the same setting.",
      );
    }
    const linkedAt = status.command_line_tool_linked_at;
    const commandLineTool = presentCommandLineTool(this.platform, linkedAt);
    this.commandLineToolDescription.replaceChildren(
      commandLineTool.explanation,
      ...(commandLineTool.isLinked ? [" Try ", createElement("code", {}, ["tatolab streams"]), "."] : []),
    );
    setTextIfChanged(this.commandLineToolValue, commandLineTool.shownValue);
    this.commandLineToolValue.dataset.linked = String(commandLineTool.isLinked);
    this.commandLineToolCopyButton.hidden = !commandLineTool.isLinked;
    if (linkedAt !== null && linkedAt !== commandLineTool.shownValue) this.commandLineToolValue.title = linkedAt;
    else this.commandLineToolValue.removeAttribute("title");
    this.machineNameRow.hidden = status.machine_name === null;
    setTextIfChanged(this.machineNameValue, status.machine_name ?? "");
    setTextIfChanged(this.appVersionValue, `Tatolab ${status.app_version}`);
  }

  /** Shows why the last uninstall was refused under its row; `null` clears it. */
  showUninstallTatolabRefusal(refusalReason: string | null): void {
    this.uninstallTatolabRefusal.show(refusalReason === null ? null : `Uninstall didn't finish: ${refusalReason}`);
    if (refusalReason !== null) this.uninstallTatolabRefusal.element.scrollIntoView({ block: "nearest" });
  }

  private showRunTatolab(isOn: boolean): void {
    this.runTatolabSwitch.setAttribute("aria-checked", String(isOn));
  }

  private onRunTatolabSwitched(): void {
    if (this.isRunTatolabSwitching) return;
    const requestedRunTatolab = this.runTatolabSwitch.getAttribute("aria-checked") !== "true";
    const statusesShownBeforeSwitching = this.statusesShownCount;
    this.isRunTatolabSwitching = true;
    this.showRunTatolab(requestedRunTatolab);
    this.runTatolabSwitch.disabled = true;
    this.runTatolabFailure.show(null);
    void this.backend
      .setRunTatolab(requestedRunTatolab)
      .catch((rejection: unknown) => {
        this.runTatolabFailure.show(
          `Couldn't turn Run Tatolab ${requestedRunTatolab ? "on" : "off"}: ${describeBackendRejection(rejection)}`,
        );
        this.showRunTatolab(this.latestStatus?.run_tatolab ?? !requestedRunTatolab);
      })
      .finally(() => {
        this.isRunTatolabSwitching = false;
        this.runTatolabSwitch.disabled = false;
        const statusArrivedWhileSwitching = this.statusesShownCount !== statusesShownBeforeSwitching;
        if (statusArrivedWhileSwitching && this.latestStatus) this.showRunTatolab(this.latestStatus.run_tatolab);
      });
  }
}
