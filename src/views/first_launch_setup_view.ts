// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { LOCK_ICON_SVG, POWER_ICON_SVG, TATOLAB_MARK_SVG, TERMINAL_ICON_SVG } from "../icons";
import { createSetupStepList, inlineCode } from "./setup_step_list";
import { createFailureLine, createIcon, createSpinner } from "./window_controls";

/** The whole window until macOS's first-launch setup is done: what the one administrator prompt is for, and the button that asks. */
export class FirstLaunchSetupView {
  readonly element: HTMLElement;
  private readonly setUpButton: HTMLButtonElement;
  private readonly setUpButtonSpinner: HTMLElement;
  private readonly setUpButtonLabel: HTMLElement;
  private readonly setupFailure = createFailureLine();
  private hasSetupBeenRefused = false;
  private isWaitingForAdministrator = false;
  /** From the click until the backend answers, and after a successful answer until the next status arrives. */
  private isSetUpRequestPending = false;

  constructor(private readonly backend: TatolabBackend) {
    this.setUpButtonSpinner = createSpinner();
    this.setUpButtonLabel = createElement("span", {}, ["Set Up Tatolab…"]);
    this.setUpButton = createElement(
      "button",
      { type: "button", class: "button button-primary", onClick: () => this.requestSetUp() },
      [this.setUpButtonSpinner, this.setUpButtonLabel],
    );

    this.element = createElement("main", { class: "setup-screen" }, [
      createElement("div", { class: "setup-screen-drag-band", "data-tauri-drag-region": "" }),
      createElement("div", { class: "centred-page" }, [
        createElement("div", { class: "centred-page-column" }, [
          createElement("span", { class: "setup-screen-mark" }, [createSvgFromMarkup(TATOLAB_MARK_SVG)]),
          createElement("h1", { class: "screen-heading setup-screen-heading" }, ["Set up Tatolab on this Mac"]),
          createElement("p", { class: "screen-lede" }, [
            "Tatolab runs your streams in the background, one runtime for the whole Mac. Setting up takes one administrator password.",
          ]),
          createSetupStepList([
            {
              iconSvg: TERMINAL_ICON_SVG,
              title: ["Links the ", inlineCode("tatolab"), " command"],
              note: ["At ", inlineCode("/usr/local/bin/tatolab"), ", so every terminal can make and run streams."],
            },
            {
              iconSvg: LOCK_ICON_SVG,
              title: ["Creates the machine lock"],
              note: ["In ", inlineCode("/Library/Application Support/Tatolab"), ", so this Mac runs one runtime."],
            },
            {
              iconSvg: POWER_ICON_SVG,
              title: ["Starts the runtime, now and at login"],
              note: ["Turn it off any time with Run Tatolab in Settings."],
            },
          ]),
          this.setupFailure.element,
          createElement("div", { class: "setup-screen-actions" }, [
            createElement("span", { class: "setup-screen-password-note" }, [createIcon(LOCK_ICON_SVG, 14), "macOS asks for your password once."]),
            createElement("button", { type: "button", class: "button", onClick: () => void backend.quitTatolabApp() }, ["Quit"]),
            this.setUpButton,
          ]),
        ]),
      ]),
    ]);
    this.showBusyState();
  }

  showStatus(status: TatolabStatus): void {
    this.isWaitingForAdministrator = status.machine_setup_state === "waiting_for_administrator";
    this.isSetUpRequestPending = false;
    if (this.isWaitingForAdministrator) this.setupFailure.show(null);
    this.showBusyState();
  }

  private showBusyState(): void {
    const isBusy = this.isWaitingForAdministrator || this.isSetUpRequestPending;
    this.element.dataset.settingUp = String(isBusy);
    this.setUpButton.disabled = isBusy;
    this.setUpButtonSpinner.hidden = !isBusy;
    setTextIfChanged(
      this.setUpButtonLabel,
      isBusy ? "Waiting for your password…" : this.hasSetupBeenRefused ? "Try Again…" : "Set Up Tatolab…",
    );
  }

  private requestSetUp(): void {
    this.isSetUpRequestPending = true;
    this.setupFailure.show(null);
    this.showBusyState();
    void this.backend.setUpTatolab().catch((rejection: unknown) => {
      this.isSetUpRequestPending = false;
      this.hasSetupBeenRefused = true;
      this.setupFailure.show(`Setup didn't finish: ${describeBackendRejection(rejection)}`);
      this.showBusyState();
    });
  }
}
