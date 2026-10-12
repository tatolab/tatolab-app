import { writeTextToClipboard } from "../clipboard";
import { createElement, createSvgFromMarkup } from "../dom";
import { CHECK_ICON_SVG, COPY_ICON_SVG } from "../icons";

const COPIED_CONFIRMATION_MILLISECONDS = 1600;

/** An icon button that copies the text `readTextToCopy` answers and shows a check for a moment. */
export function createCopyButton(accessibleSubject: string, readTextToCopy: () => string): HTMLButtonElement {
  let confirmationResetTimer: number | undefined;
  const copyLabel = `Copy ${accessibleSubject}`;
  const copyButton = createElement(
    "button",
    {
      type: "button",
      class: "icon-button copy-button",
      "aria-label": copyLabel,
      title: copyLabel,
      onClick: () => {
        void writeTextToClipboard(readTextToCopy()).then(() => {
          copyButton.dataset.copied = "true";
          copyButton.setAttribute("aria-label", "Copied");
          window.clearTimeout(confirmationResetTimer);
          confirmationResetTimer = window.setTimeout(() => {
            delete copyButton.dataset.copied;
            copyButton.setAttribute("aria-label", copyLabel);
          }, COPIED_CONFIRMATION_MILLISECONDS);
        });
      },
    },
    [createSvgFromMarkup(COPY_ICON_SVG), createSvgFromMarkup(CHECK_ICON_SVG)],
  );
  return copyButton;
}

/** A command to type in Terminal, shown after a prompt with a copy button. */
export function createTerminalCommand(commandText: string): HTMLElement {
  return createElement("div", { class: "terminal-command" }, [
    createElement("span", { class: "terminal-command-prompt", "aria-hidden": "true" }, ["$"]),
    createElement("code", { class: "selectable-text" }, [commandText]),
    createCopyButton(commandText, () => commandText),
  ]);
}

/** A command too long for one line, shown broken where a shell would continue it; the copy is the one-line command. */
export function createContinuedTerminalCommand(commandLines: readonly [string, ...string[]]): HTMLElement {
  const commandText = commandLines.join(" ");
  const [firstLine, ...continuationLines] = commandLines;
  return createElement("div", { class: "terminal-command terminal-command-continued" }, [
    createElement("span", { class: "terminal-command-prompt", "aria-hidden": "true" }, ["$"]),
    createElement("code", { class: "selectable-text" }, [
      [firstLine, ...continuationLines.map((continuationLine) => `  ${continuationLine}`)].join("\n"),
    ]),
    createCopyButton(commandText, () => commandText),
  ]);
}
