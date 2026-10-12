import { createElement, createSvgFromMarkup } from "../dom";
import { RUNTIME_POWER_ICON_SVG, TATOLAB_FILLED_MARK_SVG, TERMINAL_ICON_SVG } from "../icons";
import { createTerminalCommand } from "./copy_button";

const LINUX_INSTALL_COMMAND = "curl -fsSL https://get.tatolab.com/install.sh | sh";

function createInstallerStep(iconSvg: string, title: string, explanation: string): HTMLLIElement {
  return createElement("li", { class: "setup-step" }, [
    createElement("span", { class: "setup-step-icon" }, [createSvgFromMarkup(iconSvg)]),
    createElement("div", { class: "setup-step-copy" }, [
      createElement("strong", {}, [title]),
      createElement("span", {}, [explanation]),
    ]),
  ]);
}

/** The whole window while Linux has no tatolabd.service: the installer's one line, and the wait for the service. */
export class LinuxRuntimeInstallView {
  readonly element: HTMLElement;

  constructor() {
    this.element = createElement("main", { class: "first-launch-setup linux-runtime-install" }, [
      createElement("div", { class: "first-launch-setup-column" }, [
        createElement("div", { class: "first-launch-setup-mark" }, [createSvgFromMarkup(TATOLAB_FILLED_MARK_SVG)]),
        createElement("h1", { class: "first-launch-setup-headline" }, ["Install the Tatolab runtime"]),
        createElement("p", { class: "first-launch-setup-lead" }, [
          "This app shows your streams. The runtime that runs them comes from the installer.",
        ]),
        createElement("ul", { class: "setup-steps" }, [
          createInstallerStep(
            TERMINAL_ICON_SVG,
            "Installs tatolab and tatolabd",
            "In ~/.local/bin, to make and run streams from any terminal.",
          ),
          createInstallerStep(
            RUNTIME_POWER_ICON_SVG,
            "Runs the runtime as a systemd user service",
            "tatolabd.service starts at login and restarts if it fails.",
          ),
        ]),
        createElement("div", { class: "linux-runtime-install-command" }, [
          createElement("p", { class: "linux-runtime-install-command-label" }, ["Run the installer in a terminal:"]),
          createTerminalCommand(LINUX_INSTALL_COMMAND),
        ]),
        createElement("p", { class: "linux-runtime-install-waiting", role: "status" }, [
          createElement("span", { class: "status-dot status-dot-breathing", "data-tone": "progress", "aria-hidden": "true" }),
          "This window notices tatolabd.service as soon as it exists.",
        ]),
      ]),
    ]);
  }
}
