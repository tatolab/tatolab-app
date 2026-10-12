import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { LOCK_ICON_SVG, TATOLAB_FILLED_MARK_SVG, TERMINAL_ICON_SVG } from "../icons";

function createSetupStep(iconSvg: string, title: string, explanation: string): HTMLLIElement {
  return createElement("li", { class: "setup-step" }, [
    createElement("span", { class: "setup-step-icon" }, [createSvgFromMarkup(iconSvg)]),
    createElement("div", { class: "setup-step-copy" }, [
      createElement("strong", {}, [title]),
      createElement("span", {}, [explanation]),
    ]),
  ]);
}

/** The whole window until first-launch setup is done: what the one administrator prompt is for, and the button that asks. */
export class FirstLaunchSetupView {
  readonly element: HTMLElement;
  private readonly setUpButton: HTMLButtonElement;
  private readonly setUpButtonSpinner: HTMLElement;
  private readonly setUpButtonLabel: HTMLElement;
  private readonly setupNote: HTMLElement;
  private readonly setupFailure: HTMLElement;
  private isWaitingForAdministrator = false;
  /** From the click until the backend answers, and after a successful answer until the next status arrives. */
  private isSetUpRequestPending = false;

  constructor(private readonly backend: TatolabBackend) {
    this.setUpButtonSpinner = createElement("span", { class: "progress-spinner", hidden: true });
    this.setUpButtonLabel = createElement("span", {}, ["Set up Tatolab"]);
    this.setUpButton = createElement(
      "button",
      { type: "button", class: "button button-primary button-large", onClick: () => this.requestSetUp() },
      [this.setUpButtonSpinner, this.setUpButtonLabel],
    );
    this.setupNote = createElement("p", { class: "first-launch-setup-note" });
    this.setupFailure = createElement("p", { class: "first-launch-setup-failure", role: "alert", hidden: true });

    this.element = createElement("main", { class: "first-launch-setup" }, [
      createElement("div", { class: "first-launch-setup-drag-band", "data-tauri-drag-region": "" }),
      createElement("div", { class: "first-launch-setup-column" }, [
        createElement("div", { class: "first-launch-setup-mark" }, [createSvgFromMarkup(TATOLAB_FILLED_MARK_SVG)]),
        createElement("h1", { class: "first-launch-setup-headline" }, ["Welcome to Tatolab"]),
        createElement("p", { class: "first-launch-setup-lead" }, ["One step gets this Mac ready to run streams."]),
        createElement("ul", { class: "setup-steps" }, [
          createSetupStep(
            TERMINAL_ICON_SVG,
            "Installs the tatolab command",
            "So you can make and run streams from any terminal.",
          ),
          createSetupStep(
            LOCK_ICON_SVG,
            "Prepares this Mac for the runtime",
            "So one runtime serves everyone on this Mac, and starts again by itself if it stops.",
          ),
        ]),
        createElement("div", { class: "first-launch-setup-actions" }, [this.setUpButton, this.setupNote]),
        this.setupFailure,
      ]),
    ]);
    this.showBusyState();
  }

  showStatus(status: TatolabStatus): void {
    this.isWaitingForAdministrator = status.machine_setup_state === "waiting_for_administrator";
    this.isSetUpRequestPending = false;
    if (this.isWaitingForAdministrator) this.setupFailure.hidden = true;
    this.showBusyState();
  }

  private showBusyState(): void {
    const isBusy = this.isWaitingForAdministrator || this.isSetUpRequestPending;
    this.element.dataset.settingUp = String(isBusy);
    this.setUpButton.disabled = isBusy;
    this.setUpButtonSpinner.hidden = !isBusy;
    setTextIfChanged(this.setUpButtonLabel, isBusy ? "Setting up…" : "Set up Tatolab");
    setTextIfChanged(
      this.setupNote,
      isBusy
        ? "Enter an administrator's password in the macOS dialog to finish."
        : "macOS asks for an administrator password once.",
    );
  }

  private requestSetUp(): void {
    this.isSetUpRequestPending = true;
    this.setupFailure.hidden = true;
    this.showBusyState();
    void this.backend.setUpTatolab().catch((rejection: unknown) => {
      this.isSetUpRequestPending = false;
      setTextIfChanged(this.setupFailure, `Setup didn't finish: ${describeBackendRejection(rejection)}`);
      this.setupFailure.hidden = false;
      this.showBusyState();
    });
  }
}
