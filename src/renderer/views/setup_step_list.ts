// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createElement, type ElementChild } from "../dom";
import { createIcon } from "./window_controls";

/** One thing setup or the installer does: an icon, what it does, and a note on where or why. */
export interface SetupStep {
  iconSvg: string;
  title: ElementChild[];
  note: ElementChild[];
}

/** The hairline-separated list of what setting up does, as the setup screens show it. */
export function createSetupStepList(steps: readonly SetupStep[]): HTMLElement {
  return createElement(
    "ul",
    { class: "setup-steps" },
    steps.map((step) =>
      createElement("li", { class: "setup-step" }, [
        createIcon(step.iconSvg, 16, "setup-step-icon"),
        createElement("div", { class: "setup-step-copy" }, [
          createElement("p", { class: "setup-step-title" }, step.title),
          createElement("p", { class: "setup-step-note" }, step.note),
        ]),
      ]),
    ),
  );
}

/** A path or command set in mono inside a sentence. */
export function inlineCode(text: string): HTMLElement {
  return createElement("code", {}, [text]);
}
