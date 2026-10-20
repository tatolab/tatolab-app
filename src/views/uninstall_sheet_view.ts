// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged, type ElementChild } from "../dom";
import { CLOSE_ICON_SVG, KEPT_RECORDS_ICON_SVG, POWER_ICON_SVG, TATOLAB_MARK_SVG, TERMINAL_ICON_SVG, TRASH_ICON_SVG } from "../icons";
import { presentPlatform } from "../presentation/platform_presentation";
import {
  advanceUninstallFlow,
  isUninstallUnderway,
  UNINSTALL_FLOW_AT_REST,
  type UninstallFlowEvent,
  type UninstallFlowState,
} from "../presentation/uninstall_flow";
import { createContinuedStandaloneCommand } from "./copy_button";
import { createIcon, createSpinner } from "./window_controls";

const UNINSTALL_SHEET_TITLE_ID = "uninstall-sheet-title";
const LINUX_UNINSTALL_COMMAND_LINES = ["curl -fsSL https://get.tatolab.com/install.sh |", "sh -s -- --uninstall"] as const;
const FOCUSABLE_IN_SHEET = "button:not(:disabled):not([hidden]), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])";
/** How long the sheet takes to leave, matching uninstall_sheet.css. */
const SHEET_CLOSING_MILLISECONDS = 120;

function createMark(): HTMLElement {
  return createElement("span", { class: "uninstall-sheet-mark" }, [createSvgFromMarkup(TATOLAB_MARK_SVG)]);
}

function createRemovalRow(iconSvg: string, title: ElementChild[], note: ElementChild[] | null): HTMLLIElement {
  return createElement("li", { class: "uninstall-sheet-row" }, [
    createIcon(iconSvg, 16, "uninstall-sheet-row-icon"),
    createElement("div", { class: "uninstall-sheet-row-copy" }, [
      createElement("p", { class: "uninstall-sheet-row-title" }, title),
      note !== null && createElement("p", { class: "uninstall-sheet-row-note" }, note),
    ]),
  ]);
}

function createKeptRecordsNote(streamRecordsDirectory: string): HTMLElement {
  return createElement("p", { class: "uninstall-sheet-kept" }, [
    createIcon(KEPT_RECORDS_ICON_SVG, 16, "uninstall-sheet-row-icon"),
    createElement("span", {}, [
      "Your streams' records stay in ",
      createElement("code", { class: "selectable-text" }, [streamRecordsDirectory]),
      ". Reinstall Tatolab and they come back.",
    ]),
  ]);
}

/** The parts of macOS's confirmation that show the uninstall's progress. */
interface MacosUninstallProgressControls {
  confirmationBody: HTMLElement;
  uninstalledBody: HTMLElement;
  lede: HTMLElement;
  uninstallButton: HTMLButtonElement;
  uninstallButtonSpinner: HTMLElement;
  uninstallButtonLabel: HTMLElement;
}

/** The sheet "Uninstall Tatolab…" opens: macOS's confirmation under the band, or the steps Linux takes in a terminal. */
export class UninstallSheetView {
  readonly element: HTMLDialogElement;
  private flowState: UninstallFlowState = UNINSTALL_FLOW_AT_REST;
  private elementFocusedBeforeOpening: Element | null = null;
  private readonly dismissButton: HTMLButtonElement;
  private readonly macosProgressControls: MacosUninstallProgressControls | null;
  private closingTimer: number | undefined;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
    private readonly onFlowChanged: (flowState: UninstallFlowState) => void,
  ) {
    this.dismissButton = createElement(
      "button",
      { type: "button", class: "button", onClick: () => this.advance({ kind: "sheet_dismissed" }) },
      [platform === "linux" ? "Done" : "Cancel"],
    );
    this.macosProgressControls = platform === "linux" ? null : this.createMacosProgressControls();
    this.element = createElement(
      "dialog",
      {
        class: "uninstall-sheet",
        "data-platform-sheet": platform,
        "aria-modal": "true",
        "aria-labelledby": UNINSTALL_SHEET_TITLE_ID,
        tabindex: "-1",
      },
      this.macosProgressControls
        ? [this.macosProgressControls.confirmationBody, this.macosProgressControls.uninstalledBody]
        : this.createLinuxSteps(),
    );
    this.element.addEventListener("keydown", (keyboardEvent) => this.onSheetKeyDown(keyboardEvent));
    this.element.addEventListener("cancel", (cancelEvent) => {
      cancelEvent.preventDefault();
      this.advance({ kind: "sheet_dismissed" });
    });
  }

  open(): void {
    this.advance({ kind: "sheet_opened", platform: this.platform });
  }

  /** Whether the sheet is over the window, so the window's own shortcuts stay quiet. */
  isOpen(): boolean {
    return this.flowState.phase !== "closed";
  }

  /** Whether an uninstall is running or done, so the window stays on Settings until the app quits. */
  isUninstallUnderway(): boolean {
    return isUninstallUnderway(this.flowState);
  }

  private createMacosProgressControls(): MacosUninstallProgressControls {
    const uninstallButtonSpinner = createSpinner();
    uninstallButtonSpinner.hidden = true;
    const uninstallButtonLabel = createElement("span", {}, ["Uninstall"]);
    const uninstallButton = createElement(
      "button",
      { type: "button", class: "button button-destructive", onClick: () => this.confirmUninstall() },
      [uninstallButtonSpinner, uninstallButtonLabel],
    );
    const lede = createElement("p", { class: "uninstall-sheet-lede" }, ["Your streams stop now. Tatolab will:"]);
    const confirmationBody = createElement("div", { class: "uninstall-sheet-body" }, [
      createElement("header", { class: "uninstall-sheet-head" }, [
        createMark(),
        createElement("div", {}, [createElement("h2", { class: "uninstall-sheet-title", id: UNINSTALL_SHEET_TITLE_ID }, ["Uninstall Tatolab?"]), lede]),
      ]),
      createElement("ul", { class: "uninstall-sheet-rows", "aria-label": "What uninstalling does" }, [
        createRemovalRow(POWER_ICON_SVG, ["Stop the runtime and remove it from Login Items"], null),
        createRemovalRow(
          TERMINAL_ICON_SVG,
          ["Remove the ", createElement("code", {}, ["tatolab"]), " command and the machine lock"],
          [
            createElement("code", { class: "selectable-text" }, ["/usr/local/bin/tatolab"]),
            " and ",
            createElement("code", { class: "selectable-text" }, ["/Library/Application Support/Tatolab"]),
            ". macOS asks for an administrator password once.",
          ],
        ),
        createRemovalRow(TRASH_ICON_SVG, ["Move Tatolab to the Trash"], ["Then it quits."]),
      ]),
      createKeptRecordsNote(presentPlatform(this.platform).streamRecordsDirectory),
      createElement("div", { class: "uninstall-sheet-actions" }, [this.dismissButton, uninstallButton]),
    ]);
    const uninstalledBody = createElement("div", { class: "uninstall-sheet-body uninstall-sheet-uninstalled", hidden: true }, [
      createMark(),
      createElement("h2", { class: "uninstall-sheet-title" }, ["Tatolab is uninstalled"]),
      createElement("p", { class: "uninstall-sheet-lede" }, ["It quits now."]),
    ]);
    return { confirmationBody, uninstalledBody, lede, uninstallButton, uninstallButtonSpinner, uninstallButtonLabel };
  }

  private createLinuxSteps(): ElementChild[] {
    return [
      createElement("div", { class: "uninstall-sheet-body" }, [
        createElement("button", {
          type: "button",
          class: "icon-button uninstall-sheet-close",
          "aria-label": "Close",
          title: "Close",
          onClick: () => this.advance({ kind: "sheet_dismissed" }),
        }, [createIcon(CLOSE_ICON_SVG, 16)]),
        createElement("h2", { class: "uninstall-sheet-title", id: UNINSTALL_SHEET_TITLE_ID }, ["Uninstall Tatolab"]),
        createElement("p", { class: "uninstall-sheet-lede" }, ["Two steps, both from your own hands:"]),
        createElement("ol", { class: "uninstall-sheet-steps", "aria-label": "How to uninstall Tatolab" }, [
          createElement("li", { class: "uninstall-sheet-step" }, [
            createElement("span", { class: "uninstall-sheet-step-number", "aria-hidden": "true" }, ["1"]),
            createElement("div", { class: "uninstall-sheet-step-copy" }, [
              createElement("p", { class: "uninstall-sheet-row-title" }, ["Remove the runtime"]),
            ]),
            createContinuedStandaloneCommand(LINUX_UNINSTALL_COMMAND_LINES),
          ]),
          createElement("li", { class: "uninstall-sheet-step" }, [
            createElement("span", { class: "uninstall-sheet-step-number", "aria-hidden": "true" }, ["2"]),
            createElement("div", { class: "uninstall-sheet-step-copy" }, [
              createElement("p", { class: "uninstall-sheet-row-title" }, ["Remove this app"]),
              createElement("p", { class: "uninstall-sheet-row-note" }, [
                "Uninstall the Tatolab package with your package manager, or delete the AppImage.",
              ]),
            ]),
          ]),
        ]),
        createKeptRecordsNote(presentPlatform(this.platform).streamRecordsDirectory),
        createElement("div", { class: "uninstall-sheet-actions" }, [this.dismissButton]),
      ]),
    ];
  }

  private confirmUninstall(): void {
    this.advance({ kind: "uninstall_confirmed" });
    void this.backend.uninstallTatolab().then(
      () => this.advance({ kind: "uninstall_finished" }),
      (rejection: unknown) => this.advance({ kind: "uninstall_refused", reason: describeBackendRejection(rejection) }),
    );
  }

  private advance(event: UninstallFlowEvent): void {
    const previousFlowState = this.flowState;
    this.flowState = advanceUninstallFlow(previousFlowState, event);
    if (this.flowState === previousFlowState) return;
    this.showFlowState();
    this.onFlowChanged(this.flowState);
  }

  private showFlowState(): void {
    if (this.flowState.phase === "closed") {
      this.element.dataset.closing = "true";
      window.clearTimeout(this.closingTimer);
      this.closingTimer = window.setTimeout(() => {
        delete this.element.dataset.closing;
        if (this.flowState.phase === "closed") this.element.close();
      }, SHEET_CLOSING_MILLISECONDS);
      if (this.elementFocusedBeforeOpening instanceof HTMLElement) this.elementFocusedBeforeOpening.focus();
      this.elementFocusedBeforeOpening = null;
      return;
    }
    window.clearTimeout(this.closingTimer);
    delete this.element.dataset.closing;
    this.element.dataset.phase = this.flowState.phase;
    this.showUninstallProgress();
    if (!this.element.open) {
      this.elementFocusedBeforeOpening = document.activeElement;
      this.element.showModal();
      this.dismissButton.focus();
    }
    if (isUninstallUnderway(this.flowState)) this.element.focus();
  }

  private showUninstallProgress(): void {
    if (!this.macosProgressControls) return;
    const { confirmationBody, uninstalledBody, lede, uninstallButton, uninstallButtonSpinner, uninstallButtonLabel } =
      this.macosProgressControls;
    const isUninstalling = this.flowState.phase === "uninstalling";
    const isUninstalled = this.flowState.phase === "uninstalled";
    confirmationBody.hidden = isUninstalled;
    uninstalledBody.hidden = !isUninstalled;
    this.dismissButton.disabled = isUninstalling;
    uninstallButton.disabled = isUninstalling;
    uninstallButtonSpinner.hidden = !isUninstalling;
    setTextIfChanged(uninstallButtonLabel, isUninstalling ? "Uninstalling…" : "Uninstall");
    setTextIfChanged(lede, isUninstalling ? "macOS asks for your password now." : "Your streams stop now. Tatolab will:");
  }

  /** Esc follows Cancel while the sheet can be dismissed, and Tab stays inside the sheet. */
  private onSheetKeyDown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      this.advance({ kind: "sheet_dismissed" });
      return;
    }
    if (keyboardEvent.key !== "Tab") return;
    const focusableElements = [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE_IN_SHEET)].filter(
      (focusable) => focusable.closest("[hidden]") === null,
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);
    if (!firstFocusable || !lastFocusable) {
      keyboardEvent.preventDefault();
      return;
    }
    const isLeavingAtTheEnd = !keyboardEvent.shiftKey && document.activeElement === lastFocusable;
    const isLeavingAtTheStart =
      keyboardEvent.shiftKey && (document.activeElement === firstFocusable || document.activeElement === this.element);
    if (isLeavingAtTheEnd) {
      keyboardEvent.preventDefault();
      firstFocusable.focus();
    } else if (isLeavingAtTheStart) {
      keyboardEvent.preventDefault();
      lastFocusable.focus();
    }
  }
}
