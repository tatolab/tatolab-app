import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged, type ElementChild } from "../dom";
import type { TatolabWindowPage } from "./tatolab_window_page";

function createSettingsRow(labelChildren: ElementChild[], controlChildren: ElementChild[]): HTMLDivElement {
  return createElement("div", { class: "settings-row" }, [
    createElement("div", { class: "settings-row-label" }, labelChildren),
    createElement("div", { class: "settings-row-control" }, controlChildren),
  ]);
}

function createSettingsGroup(groupTitle: string, rows: HTMLElement[]): HTMLElement {
  const groupTitleId = `settings-group-${groupTitle.toLowerCase().replace(/\s+/g, "-")}`;
  return createElement("section", { class: "settings-group", "aria-labelledby": groupTitleId }, [
    createElement("h2", { class: "settings-group-title", id: groupTitleId }, [groupTitle]),
    createElement("div", { class: "settings-group-rows" }, rows),
  ]);
}

/** Run Tatolab, the command line tool, Login Items, the version, and quitting the app. */
export class SettingsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly runTatolabSwitch: HTMLInputElement;
  private readonly runTatolabFailure: HTMLElement;
  private readonly loginItemsHint: HTMLElement;
  private readonly commandLineToolValue: HTMLElement;
  private readonly commandLineToolHint: HTMLElement;
  private readonly machineNameRow: HTMLElement;
  private readonly machineNameValue: HTMLElement;
  private readonly appVersionValue: HTMLElement;
  private latestStatus: TatolabStatus | null = null;
  private statusesShownCount = 0;

  constructor(private readonly backend: TatolabBackend) {
    this.runTatolabSwitch = createElement("input", {
      type: "checkbox",
      role: "switch",
      class: "toggle-switch",
      id: "run-tatolab-switch",
      "aria-describedby": "run-tatolab-description",
    });
    this.runTatolabSwitch.addEventListener("change", () => this.onRunTatolabSwitched());
    this.runTatolabFailure = createElement("span", { class: "settings-row-failure", role: "alert", hidden: true });
    this.loginItemsHint = createElement("span", { class: "settings-row-hint" });
    this.commandLineToolValue = createElement("code", { class: "settings-row-value selectable-text" });
    this.commandLineToolHint = createElement("span", { class: "settings-row-hint" });
    this.machineNameValue = createElement("code", { class: "settings-row-value selectable-text" });
    this.appVersionValue = createElement("code", { class: "settings-row-value selectable-text" });
    this.machineNameRow = createSettingsRow(
      [createElement("span", { class: "settings-row-title" }, ["Machine name"])],
      [this.machineNameValue],
    );

    this.element = createElement("section", { class: "window-page settings-page", "aria-labelledby": "settings-page-title" }, [
      createElement("header", { class: "page-top-band", "data-tauri-drag-region": "deep" }, [
        createElement("h1", { class: "page-title", id: "settings-page-title" }, ["Settings"]),
      ]),
      createElement("div", { class: "settings-scroller" }, [
        createElement("div", { class: "settings-column" }, [
          createSettingsGroup("Runtime", [
            createSettingsRow(
              [
                createElement("label", { class: "settings-row-title", for: "run-tatolab-switch" }, ["Run Tatolab"]),
                createElement("span", { class: "settings-row-hint", id: "run-tatolab-description" }, [
                  "Starts Tatolab at login and keeps the runtime running. Turning it off stops the runtime.",
                ]),
                this.runTatolabFailure,
              ],
              [this.runTatolabSwitch],
            ),
            createSettingsRow(
              [createElement("span", { class: "settings-row-title" }, ["Login Items"]), this.loginItemsHint],
              [
                createElement(
                  "button",
                  { type: "button", class: "button", onClick: () => void backend.openLoginItemsSettings() },
                  ["Open Login Items"],
                ),
              ],
            ),
          ]),
          createSettingsGroup("Command line", [
            createSettingsRow(
              [createElement("span", { class: "settings-row-title" }, ["tatolab command"]), this.commandLineToolHint],
              [this.commandLineToolValue],
            ),
          ]),
          createSettingsGroup("About", [
            createSettingsRow([createElement("span", { class: "settings-row-title" }, ["Version"])], [this.appVersionValue]),
            this.machineNameRow,
            createSettingsRow(
              [
                createElement("span", { class: "settings-row-title" }, ["Quit Tatolab"]),
                createElement("span", { class: "settings-row-hint" }, [
                  "Closes this app and its menu bar icon. The runtime and your streams keep running.",
                ]),
              ],
              [
                createElement(
                  "button",
                  { type: "button", class: "button", onClick: () => void backend.quitTatolabApp() },
                  ["Quit Tatolab"],
                ),
              ],
            ),
          ]),
        ]),
      ]),
    ]);
  }

  showStatus(status: TatolabStatus): void {
    this.latestStatus = status;
    this.statusesShownCount += 1;
    if (!this.runTatolabSwitch.disabled) this.runTatolabSwitch.checked = status.run_tatolab;
    setTextIfChanged(
      this.loginItemsHint,
      status.runtime_agent === "requires_approval"
        ? "Tatolab is waiting for you to switch it on under Allow in the Background."
        : "Tatolab is listed under Allow in the Background. That entry and Run Tatolab are the same setting.",
    );
    const linkedAt = status.command_line_tool_linked_at;
    setTextIfChanged(this.commandLineToolValue, linkedAt ?? "Not linked");
    this.commandLineToolValue.dataset.linked = linkedAt === null ? "false" : "true";
    setTextIfChanged(
      this.commandLineToolHint,
      linkedAt === null
        ? "Setting up Tatolab links it, so it works in every terminal."
        : "Linked to the copy inside Tatolab.app, so it works in every terminal.",
    );
    this.machineNameRow.hidden = status.machine_name === null;
    setTextIfChanged(this.machineNameValue, status.machine_name ?? "");
    setTextIfChanged(this.appVersionValue, status.app_version);
  }

  private onRunTatolabSwitched(): void {
    const requestedRunTatolab = this.runTatolabSwitch.checked;
    const statusesShownBeforeSwitching = this.statusesShownCount;
    this.runTatolabSwitch.disabled = true;
    this.runTatolabFailure.hidden = true;
    void this.backend
      .setRunTatolab(requestedRunTatolab)
      .catch((rejection: unknown) => {
        setTextIfChanged(
          this.runTatolabFailure,
          `Couldn't turn Run Tatolab ${requestedRunTatolab ? "on" : "off"}: ${describeBackendRejection(rejection)}`,
        );
        this.runTatolabFailure.hidden = false;
        this.runTatolabSwitch.checked = this.latestStatus?.run_tatolab ?? !requestedRunTatolab;
      })
      .finally(() => {
        this.runTatolabSwitch.disabled = false;
        const statusArrivedWhileSwitching = this.statusesShownCount !== statusesShownBeforeSwitching;
        if (statusArrivedWhileSwitching && this.latestStatus) this.runTatolabSwitch.checked = this.latestStatus.run_tatolab;
      });
  }
}
