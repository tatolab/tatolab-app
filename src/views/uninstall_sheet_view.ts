import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged, type ElementChild } from "../dom";
import {
  CHECK_ICON_SVG,
  KEPT_RECORDS_ICON_SVG,
  LOCK_ICON_SVG,
  RUNTIME_POWER_ICON_SVG,
  TATOLAB_FILLED_MARK_SVG,
  TERMINAL_ICON_SVG,
  TRASH_ICON_SVG,
} from "../icons";
import {
  advanceUninstallFlow,
  isUninstallUnderway,
  UNINSTALL_FLOW_AT_REST,
  type UninstallFlowEvent,
  type UninstallFlowState,
} from "../presentation/uninstall_flow";
import { createContinuedTerminalCommand } from "./copy_button";

const UNINSTALL_SHEET_TITLE_ID = "uninstall-sheet-title";
const UNINSTALL_SHEET_LEAD_ID = "uninstall-sheet-lead";
const LINUX_UNINSTALL_COMMAND_LINES = ["curl -fsSL https://get.tatolab.com/install.sh |", "sh -s -- --uninstall"] as const;
const FOCUSABLE_IN_SHEET = "button:not(:disabled):not([hidden]), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])";

function createSheetHeader(title: string, lead: string): HTMLElement {
  return createElement("header", { class: "uninstall-sheet-header" }, [
    createElement("span", { class: "uninstall-sheet-mark" }, [createSvgFromMarkup(TATOLAB_FILLED_MARK_SVG)]),
    createElement("div", { class: "uninstall-sheet-heading" }, [
      createElement("h2", { class: "uninstall-sheet-title", id: UNINSTALL_SHEET_TITLE_ID }, [title]),
      createElement("p", { class: "uninstall-sheet-lead", id: UNINSTALL_SHEET_LEAD_ID }, [lead]),
    ]),
  ]);
}

function createRemovalRow(iconSvg: string, title: string, detail: ElementChild): HTMLLIElement {
  return createElement("li", { class: "uninstall-sheet-removal" }, [
    createElement("span", { class: "uninstall-sheet-row-icon" }, [createSvgFromMarkup(iconSvg)]),
    createElement("div", { class: "uninstall-sheet-removal-copy" }, [createElement("strong", {}, [title]), detail]),
  ]);
}

function createKeptRecordsNote(stateDirectory: string): HTMLElement {
  return createElement("div", { class: "uninstall-sheet-kept" }, [
    createElement("span", { class: "uninstall-sheet-row-icon uninstall-sheet-kept-icon" }, [
      createSvgFromMarkup(KEPT_RECORDS_ICON_SVG),
    ]),
    createElement("div", { class: "uninstall-sheet-kept-copy" }, [
      createElement("strong", {}, ["Your streams' records stay"]),
      createElement("span", {}, [
        "In ",
        createElement("code", { class: "selectable-text" }, [stateDirectory]),
        ", so reinstalling Tatolab brings kept streams back.",
      ]),
    ]),
  ]);
}

function createLinuxStep(stepNumber: number, title: string, body: ElementChild[]): HTMLLIElement {
  return createElement("li", { class: "uninstall-sheet-step" }, [
    createElement("span", { class: "numbered-step-marker", "aria-hidden": "true" }, [String(stepNumber)]),
    createElement("div", { class: "uninstall-sheet-step-copy" }, [createElement("strong", {}, [title]), ...body]),
  ]);
}

/** The parts of macOS's confirmation that show the uninstall's progress. */
interface MacosUninstallProgressControls {
  footerNote: HTMLElement;
  uninstallButton: HTMLButtonElement;
  uninstallButtonSpinner: HTMLElement;
  uninstallButtonCheck: SVGElement;
  uninstallButtonLabel: HTMLElement;
}

/** The sheet "Uninstall Tatolab…" opens over the window: macOS's confirmation, or the steps Linux takes in a terminal. */
export class UninstallSheetView {
  readonly element: HTMLDialogElement;
  private flowState: UninstallFlowState = UNINSTALL_FLOW_AT_REST;
  private elementFocusedBeforeOpening: Element | null = null;
  private readonly dismissButton: HTMLButtonElement;
  private readonly macosProgressControls: MacosUninstallProgressControls | null;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
    private readonly onFlowChanged: (flowState: UninstallFlowState) => void,
  ) {
    this.dismissButton = createElement(
      "button",
      { type: "button", class: "button", onClick: () => this.advance({ kind: "sheet_dismissed" }) },
      [platform === "linux" ? "Close" : "Cancel"],
    );
    this.macosProgressControls = platform === "linux" ? null : this.createMacosProgressControls();
    const sheetContent = this.macosProgressControls
      ? this.createMacosConfirmation(this.macosProgressControls)
      : this.createLinuxSteps();
    this.element = createElement(
      "dialog",
      {
        class: "uninstall-sheet",
        role: platform === "linux" ? null : "alertdialog",
        "aria-labelledby": UNINSTALL_SHEET_TITLE_ID,
        "aria-describedby": UNINSTALL_SHEET_LEAD_ID,
        tabindex: "-1",
      },
      sheetContent,
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
    const uninstallButtonSpinner = createElement("span", { class: "progress-spinner", hidden: true });
    const uninstallButtonCheck = createSvgFromMarkup(CHECK_ICON_SVG);
    uninstallButtonCheck.setAttribute("class", "line-icon uninstall-sheet-uninstalled-check");
    uninstallButtonCheck.toggleAttribute("hidden", true);
    const uninstallButtonLabel = createElement("span", {}, ["Uninstall"]);
    return {
      footerNote: createElement("p", { class: "uninstall-sheet-note" }),
      uninstallButton: createElement(
        "button",
        { type: "button", class: "button button-destructive", onClick: () => this.confirmUninstall() },
        [uninstallButtonSpinner, uninstallButtonCheck, uninstallButtonLabel],
      ),
      uninstallButtonSpinner,
      uninstallButtonCheck,
      uninstallButtonLabel,
    };
  }

  private createMacosConfirmation({ footerNote, uninstallButton }: MacosUninstallProgressControls): ElementChild[] {
    return [
      createElement("div", { class: "uninstall-sheet-body" }, [
        createSheetHeader("Uninstall Tatolab?", "Tatolab and its runtime leave this Mac."),
        createElement("ul", { class: "uninstall-sheet-removals", "aria-label": "What uninstalling does" }, [
          createRemovalRow(
            RUNTIME_POWER_ICON_SVG,
            "Stops the runtime",
            createElement("span", {}, ["Your streams stop, and Tatolab leaves Login Items."]),
          ),
          createRemovalRow(
            TERMINAL_ICON_SVG,
            "Removes the tatolab command",
            createElement("code", { class: "selectable-text" }, ["/usr/local/bin/tatolab"]),
          ),
          createRemovalRow(
            LOCK_ICON_SVG,
            "Removes the machine lock",
            createElement("code", { class: "selectable-text" }, ["/Library/Application Support/Tatolab"]),
          ),
          createRemovalRow(TRASH_ICON_SVG, "Moves Tatolab to the Trash", createElement("span", {}, ["Then it quits."])),
        ]),
        createKeptRecordsNote("~/Library/Application Support/Tatolab"),
      ]),
      createElement("footer", { class: "uninstall-sheet-footer" }, [
        footerNote,
        createElement("div", { class: "uninstall-sheet-actions" }, [this.dismissButton, uninstallButton]),
      ]),
    ];
  }

  private createLinuxSteps(): ElementChild[] {
    return [
      createElement("div", { class: "uninstall-sheet-body" }, [
        createSheetHeader(
          "Uninstall Tatolab",
          "The installer removes the runtime it set up, and your package manager removes this app.",
        ),
        createElement("ol", { class: "uninstall-sheet-steps", "aria-label": "How to uninstall Tatolab" }, [
          createLinuxStep(1, "Remove the runtime and its service", [
            createContinuedTerminalCommand(LINUX_UNINSTALL_COMMAND_LINES),
            createElement("span", {}, [
              "It stops and removes tatolabd.service, the tatolab and tatolabd commands, and ~/.local/share/tatolab.",
            ]),
          ]),
          createLinuxStep(2, "Remove this app", [
            createElement("span", {}, ["Uninstall the Tatolab package with your package manager, or delete the AppImage."]),
          ]),
        ]),
        createKeptRecordsNote("~/.local/state/tatolab"),
      ]),
      createElement("footer", { class: "uninstall-sheet-footer" }, [
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
      this.element.close();
      if (this.elementFocusedBeforeOpening instanceof HTMLElement) this.elementFocusedBeforeOpening.focus();
      this.elementFocusedBeforeOpening = null;
      return;
    }
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
    const { footerNote, uninstallButton, uninstallButtonSpinner, uninstallButtonCheck, uninstallButtonLabel } =
      this.macosProgressControls;
    const isUninstalling = this.flowState.phase === "uninstalling";
    const isUninstalled = this.flowState.phase === "uninstalled";
    this.dismissButton.disabled = isUninstalling;
    this.dismissButton.hidden = isUninstalled;
    uninstallButton.disabled = isUninstalling || isUninstalled;
    uninstallButtonSpinner.hidden = !isUninstalling;
    uninstallButtonCheck.toggleAttribute("hidden", !isUninstalled);
    setTextIfChanged(uninstallButtonLabel, isUninstalling ? "Uninstalling…" : isUninstalled ? "Uninstalled" : "Uninstall");
    setTextIfChanged(
      footerNote,
      isUninstalling
        ? "Enter an administrator's password in the macOS dialog."
        : isUninstalled
          ? "Tatolab is in the Trash and quits now."
          : "macOS asks for an administrator's password.",
    );
  }

  /** Esc follows Cancel, and Tab stays inside the sheet, whatever the webview does at its ends. */
  private onSheetKeyDown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      this.advance({ kind: "sheet_dismissed" });
      return;
    }
    if (keyboardEvent.key !== "Tab") return;
    const focusableElements = [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE_IN_SHEET)];
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
