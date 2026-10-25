// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createElement } from "./dom";

/** Copies `text`, falling back to a hidden text area where the async clipboard is not offered. */
export async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // A webview may refuse the async clipboard outside a secure context; the selection copy below still works.
    }
  }
  const hiddenTextArea = createElement("textarea", { "aria-hidden": "true", class: "visually-hidden" });
  hiddenTextArea.value = text;
  document.body.append(hiddenTextArea);
  hiddenTextArea.select();
  document.execCommand("copy");
  hiddenTextArea.remove();
}
