import { writeTextToClipboard } from "../clipboard";
import { createElement } from "../dom";
import { CHECK_ICON_SVG, COPY_ICON_SVG } from "../icons";
import { createIcon } from "./window_controls";

const COPIED_CONFIRMATION_MILLISECONDS = 1200;

let copiedAnnouncer: HTMLElement | null = null;

/** Says "Copied" to a screen reader through one polite live region shared by every copy button. */
function announceCopied(): void {
  if (!copiedAnnouncer) {
    copiedAnnouncer = createElement("div", { class: "visually-hidden", "aria-live": "polite", role: "status" });
    document.body.append(copiedAnnouncer);
  }
  copiedAnnouncer.textContent = "";
  window.setTimeout(() => {
    if (copiedAnnouncer) copiedAnnouncer.textContent = "Copied";
  }, 50);
}

/** A small icon button that copies what `readTextToCopy` answers, then shows a check in place for a moment. */
export function createCopyButton(accessibleSubject: string, readTextToCopy: () => string): HTMLButtonElement {
  let confirmationResetTimer: number | undefined;
  const copyLabel = `Copy ${accessibleSubject}`;
  const copyButton = createElement(
    "button",
    {
      type: "button",
      class: "icon-button icon-button-small copy-button",
      "aria-label": copyLabel,
      title: copyLabel,
      onClick: () => {
        void writeTextToClipboard(readTextToCopy()).then(() => {
          copyButton.dataset.copied = "true";
          announceCopied();
          window.clearTimeout(confirmationResetTimer);
          confirmationResetTimer = window.setTimeout(() => delete copyButton.dataset.copied, COPIED_CONFIRMATION_MILLISECONDS);
        });
      },
    },
    [createIcon(COPY_ICON_SVG, 16, "copy-button-copy-icon"), createIcon(CHECK_ICON_SVG, 16, "copy-button-copied-icon")],
  );
  return copyButton;
}

/** A command row inside a well: `$`, the command, what it does, and a copy button. */
export function createCommandRow(commandText: string, description: string | null = null): HTMLElement {
  return createElement("div", { class: "command-row" }, [
    createElement("span", { class: "command-prompt", "aria-hidden": "true" }, ["$"]),
    createElement("code", { class: "command-text selectable-text" }, [commandText]),
    createElement("span", { class: "command-description", title: description ?? undefined }, [description ?? ""]),
    createCopyButton(commandText, () => commandText),
  ]);
}

/** A well holding command rows, hairlines between them. */
export function createCommandWell(commands: readonly { command: string; description: string | null }[]): HTMLElement {
  return createElement(
    "div",
    { class: "well command-well" },
    commands.map(({ command, description }) => createCommandRow(command, description)),
  );
}

/** A command on its own, in a small well of its own, as the empty and setup screens show one. */
export function createStandaloneCommand(commandText: string): HTMLElement {
  return createElement("div", { class: "standalone-command" }, [
    createElement("span", { class: "command-prompt", "aria-hidden": "true" }, ["$"]),
    createElement("code", { class: "command-text selectable-text" }, [commandText]),
    createCopyButton(commandText, () => commandText),
  ]);
}

/** A command too long for one line, broken where a shell would continue it; the copy is the one-line command. */
export function createContinuedStandaloneCommand(commandLines: readonly [string, ...string[]]): HTMLElement {
  const commandText = commandLines.join(" ");
  const [firstLine, ...continuationLines] = commandLines;
  return createElement("div", { class: "standalone-command standalone-command-continued" }, [
    createElement("span", { class: "command-prompt", "aria-hidden": "true" }, ["$"]),
    createElement("code", { class: "command-text selectable-text" }, [
      [firstLine, ...continuationLines.map((continuationLine) => `  ${continuationLine}`)].join("\n"),
    ]),
    createCopyButton(commandText, () => commandText),
  ]);
}
